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
import BasicModule from '../modules/basic-module.vue';
import CompensationModule from '../modules/compensation-module.vue';
import MaterialModule from '../modules/material-module.vue';
import SigningModule from '../modules/signing-module.vue';

const route = useRoute();
const router = useRouter();

const active = ref<AgreementModuleKey>('basic');
const loading = ref(false);
const saving = ref(false);
const detail = ref<AgreementDetail | null>(null);
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

/** 模块导航配置 */
const modules: {
  key: AgreementModuleKey;
  label: string;
  desc: string;
}[] = [
  { key: 'basic', label: '基础信息', desc: '权利人 / 房屋' },
  { key: 'signing', label: '签约信息', desc: '签约要素 / 通讯' },
  { key: 'signMaterial', label: '签约材料', desc: '材料清单' },
  { key: 'certifyMaterial', label: '认定材料', desc: '资格认定' },
  { key: 'compensation', label: '补偿安置', desc: '安置与金额' },
];

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
    active.value = 'basic';
    clearDirty();
  } catch (error: any) {
    detail.value = null;
    ElMessage.error(error?.message || '加载详情失败');
  } finally {
    loading.value = false;
  }
}

/**
 * 切换模块
 * @param key 目标模块
 */
function switchModule(key: AgreementModuleKey) {
  if (key === active.value) return;
  if (moduleDirty(active.value)) {
    ElMessage.info('当前模块有未保存修改，可点「保存本模块」或稍后「全部保存」');
  }
  active.value = key;
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
    ElMessage.success(`「${modules.find((m) => m.key === key)?.label}」已保存`);
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 全部保存 */
async function saveAll() {
  for (const m of modules) {
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
  for (const m of modules) {
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
  const scene = String(route.query.scene || 'entry');
  const pathMap: Record<string, string> = {
    entry: '/e-agree/entry',
    lawyer_audit: '/e-agree/lawyer-audit',
    preview: '/e-query/preview',
    view: '/e-query/view',
  };
  router.push({ path: pathMap[scene] || '/e-agree/entry' });
}

// 协议号变化时立即加载（避免只依赖 onMounted 导致空白）
watch(agreementNo, () => loadDetail(), { immediate: true });
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
            信息模块
          </div>
          <div class="flex gap-1 overflow-x-auto p-2 lg:block lg:overflow-visible lg:p-0">
            <button
              v-for="m in modules"
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
        </aside>

        <!-- 右侧内容 -->
        <div
          class="min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
        >
          <div class="p-4">
            <div v-show="active === 'basic'">
              <BasicModule
                ref="basicRef"
                :detail="detail"
                @dirty="onModuleDirty('basic')"
              />
              <ElButton
                type="primary"
                :loading="saving"
                @click="saveModule('basic')"
              >
                保存本模块
              </ElButton>
            </div>
            <div v-show="active === 'signing'">
              <SigningModule
                ref="signingRef"
                :detail="detail"
                @dirty="onModuleDirty('signing')"
              />
              <ElButton
                type="primary"
                :loading="saving"
                @click="saveModule('signing')"
              >
                保存本模块
              </ElButton>
            </div>
            <div v-show="active === 'signMaterial'">
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
                :loading="saving"
                @click="saveModule('signMaterial')"
              >
                保存本模块
              </ElButton>
            </div>
            <div v-show="active === 'certifyMaterial'">
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
                :loading="saving"
                @click="saveModule('certifyMaterial')"
              >
                保存本模块
              </ElButton>
            </div>
            <div v-show="active === 'compensation'">
              <CompensationModule
                ref="compensationRef"
                :detail="detail"
                @dirty="onModuleDirty('compensation')"
              />
              <ElButton
                type="primary"
                :loading="saving"
                @click="saveModule('compensation')"
              >
                保存本模块
              </ElButton>
            </div>
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
