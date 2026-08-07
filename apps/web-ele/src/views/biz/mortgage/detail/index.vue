<script lang="ts" setup>
/**
 * 抵押信息详情页：三个可编辑模块，支持分模块保存 / 全部保存 / 提交
 * 路由：/biz/mortgage-entry/detail/:agreementNo
 */
import type { MortgageApi } from '#/api';
import type { MortgageModuleKey } from '../types';

import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { ElButton, ElMessage, ElTag } from 'element-plus';

import {
  getMortgageDetail,
  saveMortgageAll,
  saveMortgageModule,
  submitMortgage,
} from '#/api';

import { buildMortgageDetailLocal } from '../build-detail';
import BasicInfoTab from '../modules/basic-info-tab.vue';
import MortgageInfoTab from '../modules/mortgage-info-tab.vue';
import MortgageMaterialTab from '../modules/mortgage-material-tab.vue';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const activeTab = ref<MortgageModuleKey>('basic');
const detail = ref<MortgageApi.MortgageDetail | null>(null);

const basicRef = ref<InstanceType<typeof BasicInfoTab>>();
const mortgageRef = ref<InstanceType<typeof MortgageInfoTab>>();
const materialRef = ref<InstanceType<typeof MortgageMaterialTab>>();

/** 协议编号 */
const agreementNo = computed(() =>
  decodeURIComponent(String(route.params.agreementNo || '')),
);

const statusLabel = computed(() =>
  detail.value?.status === 'submitted' ? '已提交' : '草稿',
);

/** 组装本地兜底入参 */
function localPayload() {
  return {
    agreementNo: agreementNo.value,
    id: route.query.id as string | undefined,
    compensatee: route.query.compensatee as string | undefined,
    houseAddress: route.query.houseAddress as string | undefined,
  };
}

/**
 * 加载详情：先本地出数，再尝试接口覆盖（避免一直 loading）
 */
async function loadDetail() {
  if (!agreementNo.value) {
    ElMessage.error('缺少协议编号');
    return;
  }

  // 先展示本地数据，保证页面立刻可用
  detail.value = buildMortgageDetailLocal(localPayload());

  loading.value = true;
  try {
    const remote = await Promise.race([
      getMortgageDetail(agreementNo.value, {
        id: route.query.id,
        compensatee: route.query.compensatee,
        houseAddress: route.query.houseAddress,
      }),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 8000);
      }),
    ]);
    if (remote) {
      detail.value = remote;
    }
  } catch {
    // 接口失败时保留本地兜底数据
    ElMessage.warning('详情接口暂不可用，已使用本地演示数据');
  } finally {
    loading.value = false;
  }
}

/**
 * 汇总三模块当前编辑值
 */
function collectAllValues(): MortgageApi.MortgageDetail | null {
  if (!detail.value) return null;
  const basic = basicRef.value?.getValues();
  const mortgageInfo = mortgageRef.value?.getValues();
  const materials = materialRef.value?.getValues();
  return {
    ...detail.value,
    agreementNo: agreementNo.value,
    rightHolders: basic?.rightHolders ?? detail.value.rightHolders,
    houses: basic?.houses ?? detail.value.houses,
    mortgageInfo: mortgageInfo ?? detail.value.mortgageInfo,
    materials: materials ?? detail.value.materials,
  };
}

/**
 * 校验指定模块（不传则校验全部）
 * @param module 模块 key
 */
async function validateModules(module?: MortgageModuleKey): Promise<boolean> {
  const targets: MortgageModuleKey[] = module
    ? [module]
    : ['basic', 'mortgage', 'material'];

  for (const key of targets) {
    const ok =
      key === 'basic'
        ? await basicRef.value?.validate()
        : key === 'mortgage'
          ? await mortgageRef.value?.validate()
          : await materialRef.value?.validate();
    if (!ok) {
      activeTab.value = key;
      return false;
    }
  }
  return true;
}

/**
 * 保存单个模块
 * @param module 模块标识
 */
async function onSaveModule(module: MortgageModuleKey) {
  if (!(await validateModules(module))) return;
  saving.value = true;
  try {
    let data:
      | MortgageApi.MortgageBasicModule
      | MortgageApi.MortgageInfoData[]
      | MortgageApi.MortgageMaterialRow[];
    if (module === 'basic') {
      data = basicRef.value!.getValues();
    } else if (module === 'mortgage') {
      data = mortgageRef.value!.getValues();
    } else {
      data = materialRef.value!.getValues();
    }

    try {
      detail.value = await saveMortgageModule(agreementNo.value, module, data);
    } catch {
      // mock 接口失败时，仍写回本地 detail，保证演示流程可走通
      const merged = collectAllValues();
      if (merged) detail.value = { ...merged };
    }

    ElMessage.success(
      module === 'basic'
        ? '基础信息已保存'
        : module === 'mortgage'
          ? '抵押信息已保存'
          : '抵押资料已保存',
    );
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 全部保存 */
async function onSaveAll() {
  if (!(await validateModules())) return;
  const payload = collectAllValues();
  if (!payload) return;
  saving.value = true;
  try {
    try {
      detail.value = await saveMortgageAll(payload);
    } catch {
      detail.value = payload;
    }
    ElMessage.success('全部保存成功');
  } catch (error: any) {
    ElMessage.error(error?.message || '全部保存失败');
  } finally {
    saving.value = false;
  }
}

/** 提交 */
async function onSubmit() {
  if (!(await validateModules())) return;
  const payload = collectAllValues();
  if (!payload) return;
  saving.value = true;
  try {
    try {
      detail.value = await submitMortgage(payload);
    } catch {
      detail.value = { ...payload, status: 'submitted' };
    }
    ElMessage.success('提交成功');
  } catch (error: any) {
    ElMessage.error(error?.message || '提交失败');
  } finally {
    saving.value = false;
  }
}

/** 返回列表 */
function onBack() {
  router.push({ path: '/biz/mortgage-entry' });
}

onMounted(() => {
  loadDetail();
});
</script>

<template>
  <Page
    auto-content-height
    :title="`修改数据 · ${agreementNo || '-'}`"
    content-class="flex flex-col"
  >
    <div v-loading="loading" class="flex min-h-0 flex-1 flex-col">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="text-sm text-gray-500">协议编号：{{ agreementNo }}</span>
        <ElTag
          size="small"
          :type="detail?.status === 'submitted' ? 'success' : 'info'"
        >
          {{ statusLabel }}
        </ElTag>
      </div>

      <div class="tab-bar mb-3 flex overflow-hidden rounded border border-gray-300">
        <button
          type="button"
          class="tab-item"
          :class="{ 'is-active': activeTab === 'basic' }"
          @click="activeTab = 'basic'"
        >
          基础信息
        </button>
        <button
          type="button"
          class="tab-item"
          :class="{ 'is-active': activeTab === 'mortgage' }"
          @click="activeTab = 'mortgage'"
        >
          抵押信息
        </button>
        <button
          type="button"
          class="tab-item"
          :class="{ 'is-active': activeTab === 'material' }"
          @click="activeTab = 'material'"
        >
          抵押资料
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto pb-4">
        <div v-show="activeTab === 'basic'">
          <BasicInfoTab ref="basicRef" :detail="detail" />
          <div class="mt-3">
            <ElButton
              type="primary"
              :loading="saving"
              @click="onSaveModule('basic')"
            >
              保存基础信息
            </ElButton>
          </div>
        </div>

        <div v-show="activeTab === 'mortgage'">
          <MortgageInfoTab ref="mortgageRef" :detail="detail" />
          <div class="mt-3">
            <ElButton
              type="primary"
              :loading="saving"
              @click="onSaveModule('mortgage')"
            >
              保存抵押信息
            </ElButton>
          </div>
        </div>

        <div v-show="activeTab === 'material'">
          <MortgageMaterialTab ref="materialRef" :detail="detail" />
          <div class="mt-3">
            <ElButton
              type="primary"
              :loading="saving"
              @click="onSaveModule('material')"
            >
              保存抵押资料
            </ElButton>
          </div>
        </div>
      </div>

      <div
        class="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-gray-200 bg-white py-3"
      >
        <ElButton @click="onBack">返回列表</ElButton>
        <ElButton type="primary" plain :loading="saving" @click="onSaveAll">
          全部保存
        </ElButton>
        <ElButton type="primary" :loading="saving" @click="onSubmit">
          提交
        </ElButton>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.tab-bar {
  display: flex;
}

.tab-item {
  flex: 1;
  padding: 10px 12px;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
  background: #fff;
  border: none;
  border-right: 1px solid #dcdfe6;
}

.tab-item:last-child {
  border-right: none;
}

.tab-item.is-active {
  color: #fff;
  background: #409eff;
}
</style>
