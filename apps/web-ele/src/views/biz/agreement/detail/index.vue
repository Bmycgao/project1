<script lang="ts" setup>
/**
 * 协议签约详情：全宽信息架构（无页内目录）
 * 上：顶栏 + 摘要卡 + 基础信息；下：其余模块 Tab（顺序来自页面配置拖拽）
 */
import type { AgreementDetail, AgreementModuleKey } from '../types';

import { computed, nextTick, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  ElButton,
  ElEmpty,
  ElMessage,
  ElTabPane,
  ElTabs,
  ElTag,
} from 'element-plus';

import {
  getAgreementDetail,
  saveAgreementAll,
  saveAgreementModule,
  submitAgreement,
} from '#/api';

import { cloneJson } from '../clone';
import { buildAgreementDetail } from '../mock-data';
import {
  resolveAgreeModulesForPage,
  type AgreeModuleMount,
} from '../module-access';
import {
  buildDefaultBasicModuleInner,
  buildDefaultCompensationModuleInner,
  buildDefaultHousesModuleInner,
  buildDefaultPopulationModuleInner,
  buildDefaultRewardsModuleInner,
  type BasicModuleInnerConfig,
  type ModuleInnerConfig,
} from '../module-inner-config';
import { loadAgreeDetailPageConfig } from '../resolve-runtime';
import { getAgreeListPathByScene } from '../scene-paths';
import { useProvideAgreeFieldRules } from '../use-field-access';
import BasicModule from '../modules/basic-module.vue';
import CompensationModule from '../modules/compensation-module.vue';
import HousesModule from '../modules/houses-module.vue';
import PopulationModule from '../modules/population-module.vue';
import RewardsModule from '../modules/rewards-module.vue';

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();

/** 加载列模板 fieldRules 并注入给子模块 */
useProvideAgreeFieldRules('PS_AGREE_COLS');

const loading = ref(false);
const saving = ref(false);
const detail = ref<AgreementDetail | null>(null);
/** 场景挂载的模块配置（来自 page-schema.modules） */
const moduleMounts = ref<AgreeModuleMount[] | null>(null);
/** 基础信息内部字段配置 */
const basicInnerConfig = ref<BasicModuleInnerConfig>(
  buildDefaultBasicModuleInner(),
);
provide('agreeModuleInnerBasic', basicInnerConfig);
const housesInnerConfig = ref<ModuleInnerConfig>(
  buildDefaultHousesModuleInner(),
);
provide('agreeModuleInnerHouses', housesInnerConfig);
const compensationInnerConfig = ref<ModuleInnerConfig>(
  buildDefaultCompensationModuleInner(),
);
provide('agreeModuleInnerCompensation', compensationInnerConfig);
const rewardsInnerConfig = ref<ModuleInnerConfig>(
  buildDefaultRewardsModuleInner(),
);
provide('agreeModuleInnerRewards', rewardsInnerConfig);
const populationInnerConfig = ref<ModuleInnerConfig>(
  buildDefaultPopulationModuleInner(),
);
provide('agreeModuleInnerPopulation', populationInnerConfig);

/** 各模块未保存标记 */
const dirtyMap = ref<Record<AgreementModuleKey, boolean>>({
  basic: false,
  houses: false,
  compensation: false,
  rewards: false,
  population: false,
});

const basicRef = ref<InstanceType<typeof BasicModule>>();
const housesRef = ref<InstanceType<typeof HousesModule>>();
const compensationRef = ref<InstanceType<typeof CompensationModule>>();
const rewardsRef = ref<InstanceType<typeof RewardsModule>>();
const populationRef = ref<InstanceType<typeof PopulationModule>>();

/** 当前 Tab（非基础信息模块） */
const activeTab = ref<AgreementModuleKey>('houses');

/** 协议编号（路由参数） */
const agreementNo = computed(() =>
  decodeURIComponent(String(route.params.agreementNo || '')),
);

/**
 * 当前可见区域 = 场景挂载 ∩ 角色 Agree:Module:*（已按 order 排序）
 */
const visibleModules = computed(() =>
  resolveAgreeModulesForPage(moduleMounts.value, accessStore.accessCodes),
);

/** 基础信息单独置顶（有则展示整块） */
const showBasic = computed(() => isModuleShown('basic'));

/** Tab 区模块：除基础信息外，按配置顺序 */
const tabModules = computed(() =>
  visibleModules.value.filter((m) => m.key !== 'basic'),
);

/** 顶栏摘要指标 */
const summaryCards = computed(() => {
  const d = detail.value;
  if (!d) return [];
  const amount = Number(d.basic?.amount ?? 0);
  const amountText = Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : String(d.basic?.amount ?? '-');
  return [
    {
      key: 'amount',
      label: '协议总金额',
      value: `¥ ${amountText}`,
      tone: 'purple',
    },
    {
      key: 'houses',
      label: '房屋数量',
      value: String(d.houses?.length ?? 0),
      tone: 'pink',
    },
    {
      key: 'family',
      label: '家庭人口',
      value: String(d.population?.familySize ?? 0),
      tone: 'blue',
    },
    {
      key: 'items',
      label: '补偿/奖励项',
      value: `${d.compensationItems?.length ?? 0}/${d.rewardItems?.length ?? 0}`,
      tone: 'green',
    },
  ];
});

/** 模块是否在当前页展示 */
function isModuleShown(key: AgreementModuleKey) {
  return visibleModules.value.some((m) => m.key === key);
}

/** Tab 数量角标 */
function tabBadge(key: AgreementModuleKey) {
  const d = detail.value;
  if (!d) return '';
  if (key === 'houses') return String(d.houses?.length || 0);
  if (key === 'compensation') return String(d.compensationItems?.length || 0);
  if (key === 'rewards') return String(d.rewardItems?.length || 0);
  if (key === 'population') return String(d.population?.familySize || 0);
  return '';
}

watch(
  tabModules,
  (list) => {
    if (!list.length) return;
    if (!list.some((m) => m.key === activeTab.value)) {
      activeTab.value = list[0]!.key;
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
    case 'houses': {
      return housesRef.value;
    }
    case 'compensation': {
      return compensationRef.value;
    }
    case 'rewards': {
      return rewardsRef.value;
    }
    case 'population': {
      return populationRef.value;
    }
  }
}

function moduleDirty(key: AgreementModuleKey) {
  return !!dirtyMap.value[key];
}

function onModuleDirty(key: AgreementModuleKey) {
  dirtyMap.value[key] = true;
}

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
 * 定位到模块：基础信息滚到卡片；其它切 Tab
 * @param key 模块
 */
function focusModule(key: AgreementModuleKey) {
  if (!isModuleShown(key)) {
    ElMessage.warning('当前场景未挂载或无权限查看该区域');
    return;
  }
  if (key === 'basic') {
    nextTick(() => {
      document
        .getElementById('agree-section-basic')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }
  activeTab.value = key;
  nextTick(() => {
    document
      .getElementById('agree-section-tabs')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** 加载详情 */
async function loadDetail() {
  if (!agreementNo.value) {
    detail.value = null;
    ElMessage.error('缺少协议编号');
    return;
  }
  loading.value = true;
  try {
    const pageCfg = await loadAgreeDetailPageConfig({
      schemaId: String(route.query.schemaId || ''),
      scene: String(route.query.scene || 'entry'),
    });
    moduleMounts.value = pageCfg.modules;
    basicInnerConfig.value = pageCfg.basicInner;
    housesInnerConfig.value = pageCfg.housesInner;
    compensationInnerConfig.value = pageCfg.compensationInner;
    rewardsInnerConfig.value = pageCfg.rewardsInner;
    populationInnerConfig.value = pageCfg.populationInner;

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
    const firstTab = tabModules.value[0]?.key;
    if (firstTab) activeTab.value = firstTab;
    clearDirty();
  } catch (error: any) {
    detail.value = null;
    ElMessage.error(error?.message || '加载详情失败');
  } finally {
    loading.value = false;
  }
}

function collectAll(): AgreementDetail | null {
  if (!detail.value) return null;
  const basic = basicRef.value?.getValues();
  const houses = housesRef.value?.getValues();
  const compensation = compensationRef.value?.getValues();
  const rewards = rewardsRef.value?.getValues();
  const population = populationRef.value?.getValues();

  return {
    ...detail.value,
    ...basic,
    ...houses,
    ...compensation,
    ...rewards,
    ...population,
  } as AgreementDetail;
}

/**
 * 保存单个模块
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
    focusModule(key);
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

async function saveAll() {
  for (const m of visibleModules.value) {
    const ok = await moduleApi(m.key)?.validate();
    if (!ok) {
      focusModule(m.key);
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

async function submitReview() {
  for (const m of visibleModules.value) {
    const ok = await moduleApi(m.key)?.validate();
    if (!ok) {
      focusModule(m.key);
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

function onBack() {
  const activePath = String(route.query.activePath || '').trim();
  const scene = String(route.query.scene || 'entry');
  router.push({
    path: activePath || getAgreeListPathByScene(scene),
  });
}

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

watch(
  () =>
    [agreementNo.value, route.query.schemaId, route.query.scene] as const,
  () => loadDetail(),
  { immediate: true },
);
</script>

<template>
  <Page :title="`协议详情 · ${agreementNo || '-'}`">
    <ElEmpty v-if="!detail && !loading" description="暂无详情数据" />
    <div v-else-if="loading" v-loading="true" class="min-h-40" />

    <template v-else-if="detail">
      <!-- 顶栏：返回 + 关键信息 + 主操作 -->
      <div
        class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200/80 bg-white px-4 py-3"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <ElButton size="small" @click="onBack">返回列表</ElButton>
            <span class="text-base font-semibold text-gray-900">
              {{ detail.agreementNo }}
            </span>
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
          <div class="mt-1 text-xs text-gray-400">
            模块顺序与显隐由页面配置拖拽决定 · 无页内目录
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <ElButton type="primary" plain :loading="saving" @click="saveAll">
            全部保存
          </ElButton>
          <ElButton type="primary" :loading="saving" @click="submitReview">
            提交复核
          </ElButton>
        </div>
      </div>

      <!-- 摘要指标 -->
      <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div
          v-for="card in summaryCards"
          :key="card.key"
          class="summary-card"
          :data-tone="card.tone"
        >
          <div class="text-xs text-gray-500">{{ card.label }}</div>
          <div class="mt-1 truncate text-lg font-semibold text-gray-900">
            {{ card.value }}
          </div>
        </div>
      </div>

      <ElEmpty
        v-if="!visibleModules.length"
        description="当前角色无权查看任何详情区域，请在角色管理勾选「区域-*」权限"
      />

      <!-- 基础信息置顶 -->
      <section
        v-if="showBasic"
        id="agree-section-basic"
        class="mb-4 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
      >
        <div
          class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5"
        >
          <div>
            <div class="text-sm font-medium text-gray-800">基础信息</div>
            <div class="text-xs text-gray-400">协议头字段 · 顺序与占宽由页面配置决定</div>
          </div>
          <div class="flex items-center gap-2">
            <i
              v-if="moduleDirty('basic')"
              class="dirty-dot"
              title="未保存"
            />
            <ElButton
              size="small"
              type="primary"
              :loading="saving"
              @click="saveModule('basic')"
            >
              保存本模块
            </ElButton>
          </div>
        </div>
        <div class="p-4">
          <BasicModule
            ref="basicRef"
            :detail="detail"
            @dirty="onModuleDirty('basic')"
          />
        </div>
      </section>

      <!-- 其余模块：Tab，顺序=页面配置 -->
      <section
        v-if="tabModules.length"
        id="agree-section-tabs"
        class="mb-4 overflow-hidden rounded-lg border border-gray-200/80 bg-white"
      >
        <ElTabs v-model="activeTab" class="agree-detail-tabs px-2 pt-1">
          <ElTabPane
            v-for="m in tabModules"
            :key="m.key"
            :name="m.key"
          >
            <template #label>
              <span class="inline-flex items-center gap-1.5">
                {{ m.label }}
                <span
                  v-if="tabBadge(m.key)"
                  class="tab-badge"
                >
                  {{ tabBadge(m.key) }}
                </span>
                <i
                  v-if="moduleDirty(m.key)"
                  class="dirty-dot"
                  title="未保存"
                />
              </span>
            </template>

            <div class="px-2 pb-4 pt-1">
              <div class="mb-3 flex items-center justify-between gap-2">
                <div class="text-xs text-gray-400">{{ m.desc }}</div>
                <ElButton
                  size="small"
                  type="primary"
                  :loading="saving"
                  @click="saveModule(m.key)"
                >
                  保存本模块
                </ElButton>
              </div>

              <HousesModule
                v-if="m.key === 'houses'"
                ref="housesRef"
                :detail="detail"
                @dirty="onModuleDirty('houses')"
              />
              <CompensationModule
                v-else-if="m.key === 'compensation'"
                ref="compensationRef"
                :detail="detail"
                @dirty="onModuleDirty('compensation')"
              />
              <RewardsModule
                v-else-if="m.key === 'rewards'"
                ref="rewardsRef"
                :detail="detail"
                @dirty="onModuleDirty('rewards')"
              />
              <PopulationModule
                v-else-if="m.key === 'population'"
                ref="populationRef"
                :detail="detail"
                @dirty="onModuleDirty('population')"
              />
            </div>
          </ElTabPane>
        </ElTabs>
      </section>

      <div
        v-if="visibleModules.length"
        class="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3"
      >
        <ElButton @click="onBack">返回</ElButton>
        <ElButton type="primary" plain :loading="saving" @click="saveAll">
          全部保存
        </ElButton>
        <ElButton type="primary" :loading="saving" @click="submitReview">
          提交复核
        </ElButton>
      </div>
    </template>
  </Page>
</template>

<style scoped>
.summary-card {
  padding: 14px 16px;
  background: #fff;
  border: 1px solid rgb(229 231 235 / 90%);
  border-radius: 10px;
  border-left-width: 3px;
}

.summary-card[data-tone='purple'] {
  border-left-color: #8b5cf6;
}

.summary-card[data-tone='pink'] {
  border-left-color: #ec4899;
}

.summary-card[data-tone='blue'] {
  border-left-color: #3b82f6;
}

.summary-card[data-tone='green'] {
  border-left-color: #10b981;
}

.tab-badge {
  min-width: 18px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 18px;
  color: #fff;
  text-align: center;
  background: #ef4444;
  border-radius: 999px;
}

.dirty-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #f59e0b;
  border-radius: 50%;
}

.agree-detail-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}

.agree-detail-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
</style>
