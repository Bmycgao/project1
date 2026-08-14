<script lang="ts" setup>
/**
 * 协议签约详情整页：左侧目录锚点 + 长页通览 + 分存 / 合存 / 提交复核
 * 点目录滚到对应章节；滚动时自动高亮当前段（非 Tab 切换）
 */
import type { AgreementDetail, AgreementModuleKey } from '../types';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  provide,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';
import { getLayoutScrollElement } from '@vben/utils';

import { ElButton, ElEmpty, ElMessage, ElTag } from 'element-plus';

import {
  getAgreementDetail,
  saveAgreementAll,
  saveAgreementModule,
  submitAgreement,
} from '#/api';

import { buildAgreementDetail } from '../mock-data';
import { cloneJson } from '../clone';
import { getAgreeListPathByScene } from '../scene-paths';
import {
  resolveAgreeModulesForPage,
  type AgreeModuleMount,
} from '../module-access';
import {
  buildDefaultBasicModuleInner,
  type BasicModuleInnerConfig,
} from '../module-inner-config';
import { loadAgreeDetailPageConfig } from '../resolve-runtime';
import { useProvideAgreeFieldRules } from '../use-field-access';
import BasicModule from '../modules/basic-module.vue';
import CompensationModule from '../modules/compensation-module.vue';
import MaterialModule from '../modules/material-module.vue';
import SigningModule from '../modules/signing-module.vue';

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();

/** 加载列模板 fieldRules 并注入给子模块 */
useProvideAgreeFieldRules('PS_AGREE_COLS');

/** 目录当前高亮章节（滚动或点击定位） */
const active = ref<AgreementModuleKey>('basic');
/** 右侧通览滚动容器（桌面端独立滚动，目录固定不动） */
const mainScrollRef = ref<HTMLElement | null>(null);
/** 点击目录触发滚动时，短暂忽略 spy 避免闪烁 */
const scrollingByClick = ref(false);
let scrollUnlockTimer: ReturnType<typeof setTimeout> | null = null;
/** 已绑定 scroll 监听的容器（桌面右侧栏 / 移动端布局滚动区） */
let scrollSpyRoot: HTMLElement | null = null;

/**
 * 取实际滚动根：桌面优先右侧通览区（自身可滚时）；否则布局主滚动区
 */
function getScrollRoot(): HTMLElement | null {
  const panel = mainScrollRef.value;
  if (panel && panel.scrollHeight > panel.clientHeight + 1) {
    return panel;
  }
  return getLayoutScrollElement();
}

const loading = ref(false);
const saving = ref(false);
const detail = ref<AgreementDetail | null>(null);
/** 场景挂载的模块配置（来自 page-schema.modules） */
const moduleMounts = ref<AgreeModuleMount[] | null>(null);
/** 基础信息内部字段配置（注入给 BasicModule） */
const basicInnerConfig = ref<BasicModuleInnerConfig>(
  buildDefaultBasicModuleInner(),
);
provide('agreeModuleInnerBasic', basicInnerConfig);
/** 各模块未保存标记 */
const dirtyMap = ref<Record<AgreementModuleKey, boolean>>({
  basic: false,
  signing: false,
  signMaterial: false,
  certifyMaterial: false,
  compensation: false,
});

const basicRef = ref<InstanceType<typeof BasicModule>>();
const signingRef = ref<InstanceType<typeof SigningModule>>();
const signMatRef = ref<InstanceType<typeof MaterialModule>>();
const certifyMatRef = ref<InstanceType<typeof MaterialModule>>();
const compensationRef = ref<InstanceType<typeof CompensationModule>>();

/** 协议编号（路由参数） */
const agreementNo = computed(() =>
  decodeURIComponent(String(route.params.agreementNo || '')),
);

/**
 * 当前可见区域 = 场景挂载 ∩ 角色 Agree:Module:*
 */
const visibleModules = computed(() =>
  resolveAgreeModulesForPage(
    moduleMounts.value,
    accessStore.accessCodes,
  ),
);

/** 模块是否在当前页展示（挂载+权限） */
function isModuleShown(key: AgreementModuleKey) {
  return visibleModules.value.some((m) => m.key === key);
}

/** 章节 DOM id */
function sectionId(key: AgreementModuleKey) {
  return `agree-section-${key}`;
}

/** 确保 active 落在可见模块上 */
watch(
  visibleModules,
  (list) => {
    if (!list.length) return;
    if (!list.some((m) => m.key === active.value)) {
      active.value = list[0]!.key;
    }
  },
  { immediate: true },
);

/** 取某模块组件 ref */
function moduleApi(key: AgreementModuleKey) {
  switch (key) {
    case 'basic': {
      return basicRef.value;
    }
    case 'signing': {
      return signingRef.value;
    }
    case 'signMaterial': {
      return signMatRef.value;
    }
    case 'certifyMaterial': {
      return certifyMatRef.value;
    }
    case 'compensation': {
      return compensationRef.value;
    }
  }
}

/** 模块是否有未保存改动 */
function moduleDirty(key: AgreementModuleKey) {
  return !!dirtyMap.value[key];
}

/** 标记某模块脏 */
function onModuleDirty(key: AgreementModuleKey) {
  dirtyMap.value[key] = true;
}

/** 清除脏标记 */
function clearDirty(key?: AgreementModuleKey) {
  if (key) {
    dirtyMap.value[key] = false;
    return;
  }
  (Object.keys(dirtyMap.value) as AgreementModuleKey[]).forEach((k) => {
    dirtyMap.value[k] = false;
  });
}

/**
 * 滚动到指定章节（目录点击 / 校验失败定位）
 * @param key 目标模块
 */
function scrollToModule(key: AgreementModuleKey) {
  if (!isModuleShown(key)) {
    ElMessage.warning('当前场景未挂载或无权限查看该区域');
    return;
  }
  active.value = key;
  scrollingByClick.value = true;
  if (scrollUnlockTimer) clearTimeout(scrollUnlockTimer);
  nextTick(() => {
    const el = document.getElementById(sectionId(key));
    const root = getScrollRoot();
    if (el && root) {
      const elRect = el.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const nextTop = root.scrollTop + (elRect.top - rootRect.top) - 12;
      root.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
    } else {
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    scrollUnlockTimer = setTimeout(() => {
      scrollingByClick.value = false;
      scrollUnlockTimer = null;
    }, 900);
  });
}

/** 解除滚动 spy 监听 */
function teardownSectionObserver() {
  if (scrollSpyRoot) {
    scrollSpyRoot.removeEventListener('scroll', onScrollSpy);
    scrollSpyRoot = null;
  }
}

/**
 * 按滚动位置计算当前章节
 * 判定线取滚动区高度约 28%（偏上），避免必须顶到标题才切换导致慢一拍
 */
function syncActiveFromScroll() {
  if (scrollingByClick.value) return;
  const keys = visibleModules.value.map((m) => m.key);
  if (!keys.length) return;

  const root = scrollSpyRoot || getScrollRoot();
  if (!root) return;

  const rootRect = root.getBoundingClientRect();
  // 视口偏上探测点：落在哪一节的纵向范围内，就高亮哪一节
  const probeY = rootRect.top + Math.min(120, Math.max(48, rootRect.height * 0.28));

  let current: AgreementModuleKey = keys[0]!;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const el = document.getElementById(sectionId(key));
    if (!el) continue;
    const top = el.getBoundingClientRect().top;
    const nextKey = keys[i + 1];
    const nextEl = nextKey
      ? document.getElementById(sectionId(nextKey))
      : null;
    const bottom = nextEl
      ? nextEl.getBoundingClientRect().top
      : rootRect.bottom;

    // 探测点落在 [本节顶, 下一节顶) → 当前节
    if (top <= probeY && probeY < bottom) {
      current = key;
      break;
    }
    // 已滚过本节顶但还没到探测点时，先记为候选（接近顶部的最后一节）
    if (top <= probeY) {
      current = key;
    }
  }
  if (active.value !== current) {
    active.value = current;
  }
}

/** scroll 回调（passive） */
function onScrollSpy() {
  syncActiveFromScroll();
}

/**
 * 在真实滚动容器上绑定 spy（须在 loading 结束、章节 DOM 已渲染后调用）
 */
function setupSectionObserver() {
  teardownSectionObserver();
  if (!detail.value || loading.value) return;

  const keys = visibleModules.value.map((m) => m.key);
  if (!keys.length) return;

  // 章节尚未挂到 DOM 时不绑，交由后续 watch / rAF 重试
  const hasDom = keys.some((key) => document.getElementById(sectionId(key)));
  if (!hasDom) return;

  const root = getScrollRoot();
  if (!root) return;

  scrollSpyRoot = root;
  scrollSpyRoot.addEventListener('scroll', onScrollSpy, { passive: true });
  syncActiveFromScroll();
}

/**
 * 等 loading 结束 + DOM/ref 就绪后再绑目录滚动高亮
 */
async function bindScrollSpyWhenReady() {
  if (!detail.value || loading.value) return;
  await nextTick();
  // 再等一帧，确保 mainScrollRef 与 section 已挂上
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  setupSectionObserver();
  // 桌面高度样式可能晚一拍才让右侧可滚，再补一次
  if (!scrollSpyRoot || scrollSpyRoot !== mainScrollRef.value) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    setupSectionObserver();
  }
}

/** 加载详情：优先接口，失败回退本地演示数据 */
async function loadDetail() {
  if (!agreementNo.value) {
    detail.value = null;
    ElMessage.error('缺少协议编号');
    return;
  }
  loading.value = true;
  teardownSectionObserver();
  try {
    // 先拉场景模块挂载 + 基础信息内部字段
    const pageCfg = await loadAgreeDetailPageConfig({
      schemaId: String(route.query.schemaId || ''),
      scene: String(route.query.scene || 'entry'),
    });
    moduleMounts.value = pageCfg.modules;
    basicInnerConfig.value = pageCfg.basicInner;

    try {
      detail.value = await getAgreementDetail(agreementNo.value, {
        id: String(route.query.id || ''),
        compensatee: String(route.query.compensatee || ''),
        houseAddress: String(route.query.houseAddress || ''),
      });
    } catch {
      detail.value = buildAgreementDetail(agreementNo.value, {
        id: String(route.query.id || ''),
        compensatee: String(route.query.compensatee || ''),
        houseAddress: String(route.query.houseAddress || ''),
        agreementNo: agreementNo.value,
      });
      ElMessage.warning('详情接口暂不可用，已使用本地演示数据');
    }
    const first = visibleModules.value[0]?.key || 'basic';
    active.value = first;
    clearDirty();
  } catch (error: any) {
    detail.value = null;
    ElMessage.error(error?.message || '加载详情失败');
  } finally {
    // 必须先结束 loading 渲染出 section，再绑滚动高亮
    loading.value = false;
  }
  await bindScrollSpyWhenReady();
}

/** 汇总全部模块当前值 */
function collectAll(): AgreementDetail | null {
  if (!detail.value) return null;
  const basic = basicRef.value?.getValues();
  const signing = signingRef.value?.getValues();
  const signMat = signMatRef.value?.getValues();
  const certifyMat = certifyMatRef.value?.getValues();
  const compensation = compensationRef.value?.getValues();

  return {
    ...detail.value,
    ...basic,
    ...signing,
    ...signMat,
    ...certifyMat,
    ...compensation,
  } as AgreementDetail;
}

/**
 * 保存单个模块（调接口落库）
 * @param key 模块
 */
async function saveModule(key: AgreementModuleKey) {
  if (!isModuleShown(key)) {
    ElMessage.error('当前场景未挂载或无权限操作该区域');
    return;
  }
  const api = moduleApi(key);
  if (!api) return;
  if (!(await api.validate())) {
    scrollToModule(key);
    return;
  }
  saving.value = true;
  try {
    const values = api.getValues();
    try {
      detail.value = await saveAgreementModule(
        agreementNo.value,
        key,
        values,
      );
    } catch {
      // 接口失败时仍写回本地，保证演示可走通
      detail.value = cloneJson({
        ...detail.value!,
        ...values,
      } as AgreementDetail);
      ElMessage.warning('接口暂不可用，已保存到本页内存');
      clearDirty(key);
      return;
    }
    clearDirty(key);
    const label =
      visibleModules.value.find((m) => m.key === key)?.label || key;
    ElMessage.success(`「${label}」已保存`);
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 全部保存（仅校验/保存当前可见区域） */
async function saveAll() {
  for (const m of visibleModules.value) {
    const ok = await moduleApi(m.key)?.validate();
    if (!ok) {
      scrollToModule(m.key);
      return;
    }
  }
  const all = collectAll();
  if (!all) return;
  saving.value = true;
  try {
    try {
      detail.value = await saveAgreementAll(all);
    } catch {
      detail.value = cloneJson(all);
      ElMessage.warning('接口暂不可用，已保存到本页内存');
      clearDirty();
      return;
    }
    clearDirty();
    ElMessage.success('全部模块已保存');
  } catch (error: any) {
    ElMessage.error(error?.message || '全部保存失败');
  } finally {
    saving.value = false;
  }
}

/** 提交复核 */
async function submitReview() {
  for (const m of visibleModules.value) {
    const ok = await moduleApi(m.key)?.validate();
    if (!ok) {
      scrollToModule(m.key);
      return;
    }
  }
  const all = collectAll();
  if (!all) return;
  saving.value = true;
  try {
    try {
      detail.value = await submitAgreement(all);
    } catch {
      detail.value = {
        ...cloneJson(all),
        status: 'review',
        statusValue: '待复核',
      };
      ElMessage.warning('接口暂不可用，已在本页标记为待复核');
      clearDirty();
      return;
    }
    clearDirty();
    ElMessage.success('已提交复核');
  } catch (error: any) {
    ElMessage.error(error?.message || '提交失败');
  } finally {
    saving.value = false;
  }
}

/** 返回列表（按来源场景回电子协议/信息查询） */
function onBack() {
  const activePath = String(route.query.activePath || '').trim();
  const scene = String(route.query.scene || 'entry');
  router.push({
    path: activePath || getAgreeListPathByScene(scene),
  });
}

/**
 * 按来源列表同步侧栏高亮（兜底；主逻辑在 router/guard.ts）
 */
function syncMenuActivePath() {
  const fromQuery = String(route.query.activePath || '').trim();
  const scene = String(route.query.scene || 'entry');
  const activePath = fromQuery || getAgreeListPathByScene(scene);
  if (route.meta.activePath !== activePath) {
    (route.meta as Record<string, any>).activePath = activePath;
  }
}

watch(
  () => [route.query.scene, route.query.activePath, route.fullPath] as const,
  () => syncMenuActivePath(),
  { immediate: true },
);

// 协议号或场景配置变化时重新加载
watch(
  () =>
    [
      agreementNo.value,
      route.query.schemaId,
      route.query.scene,
    ] as const,
  () => loadDetail(),
  { immediate: true },
);

// loading 结束或可见模块变化后重建 spy
watch(
  () =>
    [
      loading.value,
      !!detail.value,
      visibleModules.value.map((m) => m.key).join(','),
    ] as const,
  async ([isLoading, hasDetail]) => {
    if (isLoading || !hasDetail) {
      teardownSectionObserver();
      return;
    }
    await bindScrollSpyWhenReady();
  },
);

onBeforeUnmount(() => {
  teardownSectionObserver();
  if (scrollUnlockTimer) clearTimeout(scrollUnlockTimer);
});
</script>

<template>
  <Page :title="`协议详情 · ${agreementNo || '-'}`">
    <ElEmpty v-if="!detail && !loading" description="暂无详情数据" />
    <div v-else-if="loading" v-loading="true" class="min-h-40" />

    <template v-else-if="detail">
      <!-- 顶栏摘要 -->
      <div
        class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200/80 bg-white px-4 py-3"
      >
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span class="font-medium text-gray-800">{{ detail.agreementNo }}</span>
          <ElTag size="small" type="info">{{ detail.signType }}</ElTag>
          <ElTag
            size="small"
            :type="detail.status === 'review' ? 'warning' : 'info'"
          >
            {{ detail.statusValue }}
          </ElTag>
          <ElTag
            size="small"
            effect="plain"
            :type="detail.isSigned === '已签约' ? 'success' : 'info'"
          >
            {{ detail.isSigned }}
          </ElTag>
          <span class="text-xs text-gray-400">整页通览 · 左侧目录固定</span>
        </div>
        <ElButton @click="onBack">返回列表</ElButton>
      </div>

      <div class="agree-browse flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <!-- 左侧：本页目录固定；桌面端不随右侧内容滚动 -->
        <aside class="toc-aside w-full shrink-0 lg:w-48">
          <div
            class="toc-panel overflow-hidden rounded-lg border border-gray-200/80 bg-white"
          >
            <div class="border-b border-gray-100 px-3 py-2">
              <div class="text-xs font-medium text-gray-600">本页目录</div>
              <div class="mt-0.5 text-[11px] text-gray-400">
                固定显示 · 点击定位章节
              </div>
            </div>
            <div
              v-if="visibleModules.length"
              class="flex gap-1 overflow-x-auto p-2 lg:block lg:max-h-[calc(100%-3rem)] lg:overflow-y-auto lg:overflow-x-visible lg:p-0"
            >
              <button
                v-for="m in visibleModules"
                :key="m.key"
                type="button"
                class="toc-nav-item"
                :class="{ 'is-active': active === m.key }"
                @click="scrollToModule(m.key)"
              >
                <span class="flex items-center gap-1.5">
                  <span>{{ m.label }}</span>
                  <i
                    v-if="moduleDirty(m.key)"
                    class="dirty-dot"
                    title="未保存"
                  />
                </span>
                <span class="hidden text-xs text-gray-400 lg:inline">
                  {{ m.desc }}
                </span>
              </button>
            </div>
            <div v-else class="p-3 text-xs text-gray-400">暂无可见区域</div>
          </div>
        </aside>

        <!-- 右侧：长页通览（桌面端独立滚动） -->
        <div
          ref="mainScrollRef"
          class="agree-browse-main min-w-0 flex-1 space-y-4"
        >
          <ElEmpty
            v-if="!visibleModules.length"
            description="当前角色无权查看任何详情区域，请在角色管理勾选「区域-*」权限"
          />

          <section
            v-if="isModuleShown('basic')"
            :id="sectionId('basic')"
            class="agree-section scroll-mt-4 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
          >
            <div class="border-b border-gray-100 px-4 py-2.5">
              <div class="text-sm font-medium text-gray-800">基础信息</div>
              <div class="text-xs text-gray-400">权利人 / 房屋</div>
            </div>
            <div class="p-4">
              <BasicModule
                ref="basicRef"
                :detail="detail"
                @dirty="onModuleDirty('basic')"
              />
              <ElButton
                class="mt-3"
                type="primary"
                :loading="saving"
                @click="saveModule('basic')"
              >
                保存本模块
              </ElButton>
            </div>
          </section>

          <section
            v-if="isModuleShown('signing')"
            :id="sectionId('signing')"
            class="agree-section scroll-mt-4 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
          >
            <div class="border-b border-gray-100 px-4 py-2.5">
              <div class="text-sm font-medium text-gray-800">签约信息</div>
              <div class="text-xs text-gray-400">签约要素 / 通讯</div>
            </div>
            <div class="p-4">
              <SigningModule
                ref="signingRef"
                :detail="detail"
                @dirty="onModuleDirty('signing')"
              />
              <ElButton
                class="mt-3"
                type="primary"
                :loading="saving"
                @click="saveModule('signing')"
              >
                保存本模块
              </ElButton>
            </div>
          </section>

          <section
            v-if="isModuleShown('signMaterial')"
            :id="sectionId('signMaterial')"
            class="agree-section scroll-mt-4 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
          >
            <div class="border-b border-gray-100 px-4 py-2.5">
              <div class="text-sm font-medium text-gray-800">签约材料</div>
              <div class="text-xs text-gray-400">材料清单</div>
            </div>
            <div class="p-4">
              <MaterialModule
                ref="signMatRef"
                :detail="detail"
                field="signMaterials"
                title="签约材料"
                subtitle="签约所需材料清单"
                @dirty="onModuleDirty('signMaterial')"
              />
              <ElButton
                class="mt-3"
                type="primary"
                :loading="saving"
                @click="saveModule('signMaterial')"
              >
                保存本模块
              </ElButton>
            </div>
          </section>

          <section
            v-if="isModuleShown('certifyMaterial')"
            :id="sectionId('certifyMaterial')"
            class="agree-section scroll-mt-4 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
          >
            <div class="border-b border-gray-100 px-4 py-2.5">
              <div class="text-sm font-medium text-gray-800">认定材料</div>
              <div class="text-xs text-gray-400">资格认定</div>
            </div>
            <div class="p-4">
              <MaterialModule
                ref="certifyMatRef"
                :detail="detail"
                field="certifyMaterials"
                title="认定材料"
                subtitle="资格认定相关材料"
                @dirty="onModuleDirty('certifyMaterial')"
              />
              <ElButton
                class="mt-3"
                type="primary"
                :loading="saving"
                @click="saveModule('certifyMaterial')"
              >
                保存本模块
              </ElButton>
            </div>
          </section>

          <section
            v-if="isModuleShown('compensation')"
            :id="sectionId('compensation')"
            class="agree-section scroll-mt-4 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
          >
            <div class="border-b border-gray-100 px-4 py-2.5">
              <div class="text-sm font-medium text-gray-800">补偿安置</div>
              <div class="text-xs text-gray-400">安置与金额</div>
            </div>
            <div class="p-4">
              <CompensationModule
                ref="compensationRef"
                :detail="detail"
                @dirty="onModuleDirty('compensation')"
              />
              <ElButton
                class="mt-3"
                type="primary"
                :loading="saving"
                @click="saveModule('compensation')"
              >
                保存本模块
              </ElButton>
            </div>
          </section>

          <div
            v-if="visibleModules.length"
            class="agree-browse-actions flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <ElButton @click="onBack">返回</ElButton>
            <ElButton type="primary" plain :loading="saving" @click="saveAll">
              全部保存
            </ElButton>
            <ElButton type="primary" :loading="saving" @click="submitReview">
              提交复核
            </ElButton>
          </div>
        </div>
      </div>
    </template>
  </Page>
</template>

<style scoped>
/* 桌面：锁定浏览区高度，左侧目录固定、右侧独立滚动 */
@media (min-width: 1024px) {
  .agree-browse {
    /* 扣掉 Page 标题区 + 摘要条 + 内边距，避免整页一起滚导致目录消失 */
    height: calc(var(--vben-content-height) - 11.5rem);
    min-height: 360px;
    overflow: hidden;
  }

  .toc-aside {
    height: 100%;
  }

  .toc-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .agree-browse-main {
    height: 100%;
    padding-right: 2px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .agree-browse-actions {
    position: sticky;
    bottom: 0;
    z-index: 10;
    background: rgb(255 255 255 / 95%);
    box-shadow: 0 -4px 12px rgb(15 23 42 / 6%);
    backdrop-filter: blur(4px);
  }
}

/* 目录项：轻量当前态，避免强 Tab 换页感 */
.toc-nav-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  cursor: pointer;
  color: #374151;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;
}

@media (max-width: 1023px) {
  .toc-nav-item {
    width: auto;
    white-space: nowrap;
    border-left: none;
    border-radius: 6px;
  }

  .toc-nav-item.is-active {
    color: #1d4ed8;
    background: #eff6ff;
  }
}

@media (min-width: 1024px) {
  .toc-nav-item:hover {
    background: #f8fafc;
  }

  .toc-nav-item.is-active {
    background: transparent;
    border-left-color: #2563eb;
  }

  .toc-nav-item.is-active span:first-child {
    font-weight: 600;
    color: #1d4ed8;
  }
}

.dirty-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #f59e0b;
  border-radius: 50%;
}
</style>
