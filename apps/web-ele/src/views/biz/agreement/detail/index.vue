<script lang="ts" setup>
/**
 * 协议签约详情：吸顶胶囊导航 + 全宽内容（一次一块，模块保活）
 * 上：顶栏 + 一行摘要；模块顺序来自页面配置，超出横向滚动不换行
 */
import type { AgreementDetail, AgreementModuleKey } from '../types';

import { computed, nextTick, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElButton, ElEmpty, ElMessage, ElTag } from 'element-plus';

import {
  getAgreementDetail,
  saveAgreementAll,
  saveAgreementModule,
  submitAgreement,
} from '#/api';

import { cloneJson } from '../clone';
import { buildAgreementDetail } from '../mock-data';
import {
  isCustomAgreeModule,
  resolveAgreeModulesForPage,
  type AgreeModuleLayoutItem,
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
import CustomFormModule from '../modules/custom-form-module.vue';
import CustomTableModule from '../modules/custom-table-module.vue';
import HousesModule from '../modules/houses-module.vue';
import PopulationModule from '../modules/population-module.vue';
import RewardsModule from '../modules/rewards-module.vue';

/** 顶栏摘要卡：指标 + 点击后切到的模块 */
interface SummaryCardItem {
  key: string;
  label: string;
  value: string;
  tone: string;
  /** 点击跳转目标；空则仅展示 */
  target?: AgreementModuleKey;
}

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
const customInnerMap = ref<Record<string, ModuleInnerConfig>>({});
provide('agreeModuleInnerCustom', customInnerMap);

/** 各模块未保存标记 */
const dirtyMap = ref<Record<string, boolean>>({});

const basicRef = ref<InstanceType<typeof BasicModule>>();
const housesRef = ref<InstanceType<typeof HousesModule>>();
const compensationRef = ref<InstanceType<typeof CompensationModule>>();
const rewardsRef = ref<InstanceType<typeof RewardsModule>>();
const populationRef = ref<InstanceType<typeof PopulationModule>>();
const customApis = ref<Record<string, { getValues: () => any; validate: () => Promise<boolean> }>>(
  {},
);

/**
 * 绑定自定义模块组件实例
 * @param key 模块
 * @param el 组件实例
 */
function bindCustomApi(key: string, el: any) {
  if (el) customApis.value[key] = el;
  else delete customApis.value[key];
}

/** 当前胶囊选中的模块（含基础信息） */
const activeModule = ref<AgreementModuleKey>('basic');

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

/** 配置台新建的表单模块 */
const customFormModules = computed(() =>
  visibleModules.value.filter(
    (m) => isCustomAgreeModule(String(m.key)) && m.widgetKind === 'form',
  ),
);

/** 配置台新建的表格模块 */
const customTableModules = computed(() =>
  visibleModules.value.filter(
    (m) => isCustomAgreeModule(String(m.key)) && m.widgetKind === 'table',
  ),
);

/** 当前展示的模块元数据 */
const currentModule = computed<AgreeModuleLayoutItem | undefined>(() =>
  visibleModules.value.find((m) => m.key === activeModule.value),
);

/** 顶栏摘要指标（可点击跳转对应模块） */
const summaryCards = computed<SummaryCardItem[]>(() => {
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
      target: isModuleShown('basic') ? 'basic' : undefined,
    },
    {
      key: 'houses',
      label: '房屋数量',
      value: String(d.houses?.length ?? 0),
      tone: 'pink',
      target: isModuleShown('houses') ? 'houses' : undefined,
    },
    {
      key: 'family',
      label: '家庭人口',
      value: String(d.population?.familySize ?? 0),
      tone: 'blue',
      target: isModuleShown('population') ? 'population' : undefined,
    },
    {
      key: 'items',
      label: '补偿/奖励项',
      value: `${d.compensationItems?.length ?? 0}/${d.rewardItems?.length ?? 0}`,
      tone: 'green',
      target: isModuleShown('compensation')
        ? 'compensation'
        : isModuleShown('rewards')
          ? 'rewards'
          : undefined,
    },
  ];
});

/** 模块是否在当前页展示 */
function isModuleShown(key: AgreementModuleKey) {
  return visibleModules.value.some((m) => m.key === key);
}

/**
 * 胶囊数量角标（基础信息无条数则空）
 * @param key 模块
 */
function navBadge(key: AgreementModuleKey) {
  const d = detail.value;
  if (!d) return '';
  if (key === 'houses') return String(d.houses?.length ?? 0);
  if (key === 'compensation') return String(d.compensationItems?.length ?? 0);
  if (key === 'rewards') return String(d.rewardItems?.length ?? 0);
  if (key === 'population') return String(d.population?.familySize ?? 0);
  const meta = visibleModules.value.find((m) => m.key === key);
  if (meta?.widgetKind === 'table' && isCustomAgreeModule(String(key))) {
    return String(d.extraTables?.[key]?.length ?? 0);
  }
  return '';
}

/**
 * 摘要卡是否对应正在查看的模块
 * @param card 摘要卡
 */
function isSummaryActive(card: SummaryCardItem) {
  if (!card.target) return false;
  if (card.key === 'items') {
    return (
      activeModule.value === 'compensation' || activeModule.value === 'rewards'
    );
  }
  return card.target === activeModule.value;
}

watch(
  visibleModules,
  (list) => {
    if (!list.length) return;
    if (!list.some((m) => m.key === activeModule.value)) {
      activeModule.value = list[0]!.key;
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
    default: {
      return customApis.value[key];
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
 * 切换到指定模块（胶囊 / 摘要共用）
 * @param key 模块
 */
function selectModule(key: AgreementModuleKey) {
  if (!isModuleShown(key)) {
    ElMessage.warning('当前场景未挂载或无权限查看该区域');
    return;
  }
  activeModule.value = key;
}

/**
 * 定位到模块：切换目录并滚到工作区
 * @param key 模块
 */
function focusModule(key: AgreementModuleKey) {
  selectModule(key);
  nextTick(() => {
    document
      .getElementById('agree-detail-workspace')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/**
 * 点击摘要卡跳转模块
 * @param card 摘要卡
 */
function onSummaryClick(card: SummaryCardItem) {
  if (!card.target) return;
  focusModule(card.target);
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
    customInnerMap.value = pageCfg.customInners;

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
    const first = visibleModules.value[0]?.key;
    if (first) activeModule.value = first;
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
  const extraForms = { ...(detail.value.extraForms || {}) };
  const extraTables = { ...(detail.value.extraTables || {}) };
  for (const m of customFormModules.value) {
    const part = customApis.value[m.key]?.getValues()?.extraForms;
    if (part) Object.assign(extraForms, part);
  }
  for (const m of customTableModules.value) {
    const part = customApis.value[m.key]?.getValues()?.extraTables;
    if (part) Object.assign(extraTables, part);
  }

  return {
    ...detail.value,
    ...basic,
    ...houses,
    ...compensation,
    ...rewards,
    ...population,
    extraForms,
    extraTables,
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
      const next = cloneJson(detail.value!) as AgreementDetail;
      if (values.extraForms) {
        next.extraForms = { ...(next.extraForms || {}), ...values.extraForms };
      }
      if (values.extraTables) {
        next.extraTables = {
          ...(next.extraTables || {}),
          ...values.extraTables,
        };
      }
      if (!values.extraForms && !values.extraTables) {
        Object.assign(next, values);
      }
      detail.value = next;
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
  <!-- 不传 title：避免与多页签、下方操作栏重复占高 -->
  <Page>
    <ElEmpty v-if="!detail && !loading" description="暂无详情数据" />
    <div v-else-if="loading" v-loading="true" class="min-h-40" />

    <template v-else-if="detail">
      <!-- 顶栏：返回 + 关键信息 + 主操作（不再在页底重复） -->
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
            点击摘要或下方胶囊切换模块 · 顺序由页面配置决定
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

      <!-- 摘要指标：单行紧凑，可点击跳转 -->
      <div class="agree-summary mb-3">
        <button
          v-for="card in summaryCards"
          :key="card.key"
          type="button"
          class="agree-summary__item"
          :class="{
            'is-active': isSummaryActive(card),
            'is-clickable': !!card.target,
          }"
          :data-tone="card.tone"
          :disabled="!card.target"
          @click="onSummaryClick(card)"
        >
          <span class="agree-summary__label">{{ card.label }}</span>
          <span class="agree-summary__value">{{ card.value }}</span>
        </button>
      </div>

      <ElEmpty
        v-if="!visibleModules.length"
        description="当前角色无权查看任何详情区域，请在角色管理勾选「区域-*」权限"
      />

      <!-- 顶栏胶囊 + 全宽内容：模块用 v-show 保活 -->
      <section
        v-if="visibleModules.length"
        id="agree-detail-workspace"
        class="agree-pane"
      >
        <header class="agree-pane-head">
          <nav class="agree-pills" aria-label="协议模块">
            <button
              v-for="m in visibleModules"
              :key="m.key"
              type="button"
              class="agree-pill"
              :class="{ 'is-active': activeModule === m.key }"
              @click="selectModule(m.key)"
            >
              <span class="agree-pill__label">{{ m.label }}</span>
              <span v-if="navBadge(m.key) !== ''" class="nav-badge">
                {{ navBadge(m.key) }}
              </span>
              <i
                v-if="moduleDirty(m.key)"
                class="dirty-dot"
                title="未保存"
              />
            </button>
          </nav>
          <div v-if="currentModule" class="agree-pane-actions">
            <i
              v-if="moduleDirty(currentModule.key)"
              class="dirty-dot"
              title="未保存"
            />
            <ElButton
              size="small"
              type="primary"
              :loading="saving"
              @click="saveModule(currentModule.key)"
            >
              保存本模块
            </ElButton>
          </div>
        </header>

        <div class="agree-pane-body">
          <div
            v-if="isModuleShown('basic')"
            v-show="activeModule === 'basic'"
          >
            <BasicModule
              ref="basicRef"
              :detail="detail"
              @dirty="onModuleDirty('basic')"
            />
          </div>
          <div
            v-if="isModuleShown('houses')"
            v-show="activeModule === 'houses'"
          >
            <HousesModule
              ref="housesRef"
              :detail="detail"
              @dirty="onModuleDirty('houses')"
            />
          </div>
          <div
            v-if="isModuleShown('compensation')"
            v-show="activeModule === 'compensation'"
          >
            <CompensationModule
              ref="compensationRef"
              :detail="detail"
              @dirty="onModuleDirty('compensation')"
            />
          </div>
          <div
            v-if="isModuleShown('rewards')"
            v-show="activeModule === 'rewards'"
          >
            <RewardsModule
              ref="rewardsRef"
              :detail="detail"
              @dirty="onModuleDirty('rewards')"
            />
          </div>
            <div
              v-if="isModuleShown('population')"
              v-show="activeModule === 'population'"
            >
              <PopulationModule
                ref="populationRef"
                :detail="detail"
                @dirty="onModuleDirty('population')"
              />
            </div>
            <div
              v-for="m in customFormModules"
              :key="m.key"
              v-show="activeModule === m.key"
            >
              <CustomFormModule
                :ref="(el) => bindCustomApi(m.key, el)"
                :detail="detail"
                :module-key="m.key"
                :label="m.label"
                @dirty="onModuleDirty(m.key)"
              />
            </div>
            <div
              v-for="m in customTableModules"
              :key="m.key"
              v-show="activeModule === m.key"
            >
              <CustomTableModule
                :ref="(el) => bindCustomApi(m.key, el)"
                :detail="detail"
                :module-key="m.key"
                :label="m.label"
                @dirty="onModuleDirty(m.key)"
              />
            </div>
          </div>
      </section>
    </template>
  </Page>
</template>

<style scoped>
.agree-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agree-summary__item {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
  padding: 8px 12px;
  text-align: left;
  background: #fff;
  border: 1px solid rgb(229 231 235 / 90%);
  border-radius: 8px;
  border-left-width: 3px;
}

.agree-summary__item.is-clickable {
  cursor: pointer;
}

.agree-summary__item:disabled {
  cursor: default;
}

.agree-summary__item.is-clickable:hover {
  background: #f8fafc;
}

.agree-summary__item.is-active {
  background: #f8fafc;
  border-color: rgb(37 99 235 / 35%);
}

.agree-summary__item[data-tone='purple'] {
  border-left-color: #8b5cf6;
}

.agree-summary__item[data-tone='pink'] {
  border-left-color: #ec4899;
}

.agree-summary__item[data-tone='blue'] {
  border-left-color: #3b82f6;
}

.agree-summary__item[data-tone='green'] {
  border-left-color: #10b981;
}

.agree-summary__label {
  font-size: 12px;
  color: #6b7280;
}

.agree-summary__value {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.agree-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid rgb(229 231 235 / 80%);
  border-radius: 10px;
}

.agree-pane-head {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #f3f4f6;
}

.agree-pills {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.agree-pill {
  display: inline-flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1.3;
  color: #374151;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
}

.agree-pill:hover {
  background: #f8fafc;
}

.agree-pill.is-active {
  font-weight: 600;
  color: #1d4ed8;
  background: #eff6ff;
  border-color: rgb(37 99 235 / 18%);
}

.agree-pill__label {
  max-width: 10em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agree-pane-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
}

.agree-pane-body {
  padding: 12px 16px 16px;
}

/* 外壳已是卡片，去掉子模块 SectionCard 外框避免套娃 */
.agree-pane-body :deep(.agree-section) {
  margin-bottom: 0;
  border: none;
}

.nav-badge {
  min-width: 18px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 18px;
  color: #4b5563;
  text-align: center;
  background: #f3f4f6;
  border-radius: 999px;
}

.agree-pill.is-active .nav-badge {
  color: #1d4ed8;
  background: #dbeafe;
}

.dirty-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #f59e0b;
  border-radius: 50%;
}

@media (max-width: 767px) {
  .agree-pane-head {
    flex-wrap: wrap;
  }

  .agree-pills {
    width: 100%;
  }

  .agree-pane-actions {
    margin-left: auto;
  }
}
</style>
