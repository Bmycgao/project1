<script lang="ts" setup>
/**
 * 协议签约详情整页：左侧模块导航 + 分存 / 合存 / 提交复核
 * 保存走接口，mock 内存持久化（刷新同会话可回读）
 */
import type { AgreementDetail, AgreementModuleKey } from '../types';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

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
  type AgreeModuleLayoutItem,
  type AgreeModuleMount,
} from '../module-access';
import { loadAgreeDetailModules } from '../resolve-runtime';
import { useProvideAgreeFieldRules } from '../use-field-access';
import BasicModule from '../modules/basic-module.vue';
import CompensationModule from '../modules/compensation-module.vue';
import MaterialModule from '../modules/material-module.vue';
import SigningModule from '../modules/signing-module.vue';

import { useAccessStore } from '@vben/stores';

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();

/** 加载列模板 fieldRules 并注入给子模块 */
useProvideAgreeFieldRules('PS_AGREE_COLS');

const active = ref<AgreementModuleKey>('basic');
const loading = ref(false);
const saving = ref(false);
const detail = ref<AgreementDetail | null>(null);
/** 场景挂载的模块配置（来自 page-schema.modules） */
const moduleMounts = ref<AgreeModuleMount[] | null>(null);
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

/** 加载详情：优先接口，失败回退本地演示数据 */
async function loadDetail() {
  if (!agreementNo.value) {
    detail.value = null;
    ElMessage.error('缺少协议编号');
    return;
  }
  loading.value = true;
  try {
    // 先拉场景模块挂载（schemaId / scene）
    moduleMounts.value = await loadAgreeDetailModules({
      schemaId: String(route.query.schemaId || ''),
      scene: String(route.query.scene || 'entry'),
    });

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
    loading.value = false;
  }
}

/**
 * 切换模块：高亮并滚动到对应区块
 * @param key 目标模块
 */
function switchModule(key: AgreementModuleKey) {
  if (!isModuleShown(key)) {
    ElMessage.warning('当前场景未挂载或无权限查看该区域');
    return;
  }
  if (key !== active.value && moduleDirty(active.value)) {
    ElMessage.info('当前模块有未保存修改，可点「保存本模块」或稍后「全部保存」');
  }
  active.value = key;
  // 滚动到栅格中的对应模块
  requestAnimationFrame(() => {
    document
      .getElementById(`agree-mod-${key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** 取模块布局项（span） */
function moduleLayout(key: AgreementModuleKey): AgreeModuleLayoutItem | undefined {
  return visibleModules.value.find((m) => m.key === key);
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
    active.value = key;
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
      active.value = m.key;
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
      active.value = m.key;
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
        </div>
        <ElButton @click="onBack">返回列表</ElButton>
      </div>

      <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <!-- 左侧 / 顶部模块导航 -->
        <aside
          class="w-full shrink-0 overflow-hidden rounded-lg border border-gray-200/80 bg-white lg:w-48"
        >
          <div class="border-b border-gray-100 px-3 py-2 text-xs text-gray-400">
            信息模块（按配置顺序）
          </div>
          <div
            v-if="visibleModules.length"
            class="flex gap-1 overflow-x-auto p-2 lg:block lg:overflow-visible lg:p-0"
          >
            <button
              v-for="m in visibleModules"
              :key="m.key"
              type="button"
              class="module-nav-item"
              :class="{ 'is-active': active === m.key }"
              @click="switchModule(m.key)"
            >
              <span class="flex items-center gap-1.5">
                <span>{{ m.label }}</span>
                <i v-if="moduleDirty(m.key)" class="dirty-dot" title="未保存" />
              </span>
              <span class="hidden text-xs text-gray-400 lg:inline">
                {{ m.desc }}
              </span>
            </button>
          </div>
          <div v-else class="p-3 text-xs text-gray-400">暂无可见区域</div>
        </aside>

        <!-- 右侧：按 order 排列、按 span 占比的模块栅格 -->
        <div
          class="min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
        >
          <div class="p-4">
            <ElEmpty
              v-if="!visibleModules.length"
              description="当前角色无权查看任何详情区域，请在角色管理勾选「区域-*」权限"
            />
            <template v-else>
              <p class="mb-3 text-xs text-gray-400">
                模块按页面配置的顺序排列；宽度为占比（24 栅格）。点击左侧可定位。
              </p>
              <div class="module-grid">
                <div
                  v-if="isModuleShown('basic')"
                  id="agree-mod-basic"
                  class="module-grid__item"
                  :class="{ 'is-active': active === 'basic' }"
                  :style="{
                    gridColumn: `span ${moduleLayout('basic')?.span || 24}`,
                    order: moduleLayout('basic')?.order ?? 0,
                  }"
                  @click="active = 'basic'"
                >
                  <BasicModule
                    ref="basicRef"
                    :detail="detail"
                    @dirty="onModuleDirty('basic')"
                  />
                  <ElButton
                    type="primary"
                    size="small"
                    :loading="saving"
                    @click.stop="saveModule('basic')"
                  >
                    保存本模块
                  </ElButton>
                </div>
                <div
                  v-if="isModuleShown('signing')"
                  id="agree-mod-signing"
                  class="module-grid__item"
                  :class="{ 'is-active': active === 'signing' }"
                  :style="{
                    gridColumn: `span ${moduleLayout('signing')?.span || 24}`,
                    order: moduleLayout('signing')?.order ?? 0,
                  }"
                  @click="active = 'signing'"
                >
                  <SigningModule
                    ref="signingRef"
                    :detail="detail"
                    @dirty="onModuleDirty('signing')"
                  />
                  <ElButton
                    type="primary"
                    size="small"
                    :loading="saving"
                    @click.stop="saveModule('signing')"
                  >
                    保存本模块
                  </ElButton>
                </div>
                <div
                  v-if="isModuleShown('signMaterial')"
                  id="agree-mod-signMaterial"
                  class="module-grid__item"
                  :class="{ 'is-active': active === 'signMaterial' }"
                  :style="{
                    gridColumn: `span ${moduleLayout('signMaterial')?.span || 24}`,
                    order: moduleLayout('signMaterial')?.order ?? 0,
                  }"
                  @click="active = 'signMaterial'"
                >
                  <MaterialModule
                    ref="signMatRef"
                    :detail="detail"
                    field="signMaterials"
                    title="签约材料"
                    subtitle="签约所需材料清单"
                    @dirty="onModuleDirty('signMaterial')"
                  />
                  <ElButton
                    type="primary"
                    size="small"
                    :loading="saving"
                    @click.stop="saveModule('signMaterial')"
                  >
                    保存本模块
                  </ElButton>
                </div>
                <div
                  v-if="isModuleShown('certifyMaterial')"
                  id="agree-mod-certifyMaterial"
                  class="module-grid__item"
                  :class="{ 'is-active': active === 'certifyMaterial' }"
                  :style="{
                    gridColumn: `span ${moduleLayout('certifyMaterial')?.span || 24}`,
                    order: moduleLayout('certifyMaterial')?.order ?? 0,
                  }"
                  @click="active = 'certifyMaterial'"
                >
                  <MaterialModule
                    ref="certifyMatRef"
                    :detail="detail"
                    field="certifyMaterials"
                    title="认定材料"
                    subtitle="资格认定相关材料"
                    @dirty="onModuleDirty('certifyMaterial')"
                  />
                  <ElButton
                    type="primary"
                    size="small"
                    :loading="saving"
                    @click.stop="saveModule('certifyMaterial')"
                  >
                    保存本模块
                  </ElButton>
                </div>
                <div
                  v-if="isModuleShown('compensation')"
                  id="agree-mod-compensation"
                  class="module-grid__item"
                  :class="{ 'is-active': active === 'compensation' }"
                  :style="{
                    gridColumn: `span ${moduleLayout('compensation')?.span || 24}`,
                    order: moduleLayout('compensation')?.order ?? 0,
                  }"
                  @click="active = 'compensation'"
                >
                  <CompensationModule
                    ref="compensationRef"
                    :detail="detail"
                    @dirty="onModuleDirty('compensation')"
                  />
                  <ElButton
                    type="primary"
                    size="small"
                    :loading="saving"
                    @click.stop="saveModule('compensation')"
                  >
                    保存本模块
                  </ElButton>
                </div>
              </div>
            </template>
          </div>

          <div
            class="flex flex-wrap gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3"
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
.module-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.module-grid__item {
  min-width: 0;
  padding: 12px;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.module-grid__item.is-active {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.25);
}

@media (max-width: 1023px) {
  .module-grid__item {
    /* 窄屏强制整行，避免半宽过挤 */
    grid-column: 1 / -1 !important;
  }
}

.module-nav-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
}

@media (max-width: 1023px) {
  .module-nav-item {
    width: auto;
    border-left: none;
    border-radius: 6px;
  }

  .module-nav-item.is-active {
    color: #fff;
    background: #2563eb;
  }
}

@media (min-width: 1024px) {
  .module-nav-item:hover {
    background: #f8fafc;
  }

  .module-nav-item.is-active {
    background: #eff6ff;
    border-left-color: #2563eb;
  }

  .module-nav-item.is-active span:first-child {
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
