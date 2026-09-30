<script lang="ts" setup>
import type { AgreeModuleMount } from '../access/module-access';
import type {
  BasicModuleInnerConfig,
  ModuleInnerConfig,
} from '../config/module-inner-config';
import type { FcRuleMap } from '../fc/types';
/**
 * 协议签约详情：默认浏览；顶栏「切换到编辑」后整页可改
 * 浏览为表单文字 + 展示表；编辑为控件 + 行抽屉；全部保存一次提交
 */
import type { AgreementDetail, AgreementModuleKey } from '../types';

import { computed, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  ElButton,
  ElEmpty,
  ElMessage,
  ElMessageBox,
  ElTag,
} from 'element-plus';

import {
  getAgreementDetail,
  saveAgreementAll,
  saveAgreementModule,
  submitAgreement,
} from '#/api';
import { hasWorkflowRuntimeAccess } from '#/api/workflow-runtime';

import {
  isCustomAgreeModule,
  resolveAgreeModulesForPage,
} from '../access/module-access';
import {
  useProvideAgreeDetailEditable,
  useProvideAgreeFieldRules,
} from '../access/use-field-access';
import { canOperateAgreeAction } from '../actions';
import { cloneJson } from '../clone';
import DetailLayout from '../components/detail-layout.vue';
import DetailModule from '../components/detail-module.vue';
import {
  buildDefaultBasicModuleInner,
  buildDefaultCompensationModuleInner,
  buildDefaultHousesModuleInner,
  buildDefaultPopulationModuleInner,
  buildDefaultRewardsModuleInner,
} from '../config/module-inner-config';
import { loadAgreeDetailPageConfig } from '../config/resolve-runtime';
import { getAgreeListPathByScene } from '../config/scene-paths';
import { buildAgreementDetail } from '../data/mock-data';
import { buildDefaultFcRuleMap } from '../fc/default-rules';

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
/** 是否整页编辑（对齐参考图：浏览 / 切换到编辑） */
const editing = ref(false);
/** 列表带入的详情模式：edit / view / audit */
const detailMode = computed(() => {
  const mode = String(route.query.mode || 'view');
  if (mode === 'edit' || mode === 'audit' || mode === 'view') return mode;
  return 'view';
});
/**
 * 是否允许改数（审核态不允许）
 */
const canEnterEdit = computed(() => {
  if (detailMode.value === 'audit') return false;
  if (detailMode.value === 'edit') return true;
  return canOperateAgreeAction('edit', accessStore.accessCodes);
});
/** 注入给子模块：仅整页编辑态可改 */
const pageEditable = ref(false);
watch(
  [editing, canEnterEdit],
  () => {
    pageEditable.value = editing.value && canEnterEdit.value;
  },
  { immediate: true },
);
useProvideAgreeDetailEditable(pageEditable);

/** 当前是否处于可改状态 */
const isEditing = computed(() => pageEditable.value);

const detail = ref<AgreementDetail | null>(null);
/** 场景挂载的模块配置（来自 page-schema.modules） */
const moduleMounts = ref<AgreeModuleMount[] | null>(null);
/** 基础信息内部字段配置 */
const basicInnerConfig = ref<BasicModuleInnerConfig>(
  buildDefaultBasicModuleInner(),
);
provide('agreeModuleInnerBasic', basicInnerConfig);
/** FormCreate 各块 rule（页面配置 fcRules） */
const fcRules = ref<FcRuleMap>(buildDefaultFcRuleMap());
provide('agreeFcRules', fcRules);
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

/** 是否有未保存改动 */
const hasDirty = computed(() => Object.values(dirtyMap.value).some(Boolean));

const layoutRef = ref<InstanceType<typeof DetailLayout>>();
const moduleApis = new Map<string, InstanceType<typeof DetailModule>>();
function bindModuleApi(key: string, el: any) {
  if (el) moduleApis.set(key, el);
  else moduleApis.delete(key);
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

const tabModules = computed(() =>
  visibleModules.value.filter((m) => m.region === 'tabs'),
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
      value: `${isModuleShown('compensation') ? (d.compensationItems?.length ?? 0) : '—'}/${isModuleShown('rewards') ? (d.rewardItems?.length ?? 0) : '—'}`,
      tone: 'green',
      target: isModuleShown('compensation')
        ? 'compensation'
        : isModuleShown('rewards')
          ? 'rewards'
          : undefined,
    },
  ].filter((card) => card.target);
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

function moduleApi(key: AgreementModuleKey) {
  return moduleApis.get(key);
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
  void layoutRef.value?.focusModule(key);
}

/**
 * 进入整页编辑
 */
function enterEdit() {
  if (!canEnterEdit.value) {
    ElMessage.warning('当前场景或角色无权编辑');
    return;
  }
  editing.value = true;
}

/**
 * 退出编辑：有未保存改动则确认并重新加载
 */
async function cancelEdit() {
  if (hasDirty.value) {
    try {
      await ElMessageBox.confirm(
        '有未保存的修改，确定放弃并返回浏览？',
        '取消编辑',
        { type: 'warning' },
      );
    } catch {
      return;
    }
    await loadDetail();
  }
  editing.value = false;
  clearDirty();
}

/**
 * 定位到模块：切换目录并滚到工作区
 * @param key 模块
 */
function focusModule(key: AgreementModuleKey) {
  selectModule(key);
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
  editing.value = false;
  clearDirty();
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
    fcRules.value = pageCfg.fcRules || buildDefaultFcRuleMap();

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
    // 按配置选择第一个标签；内容区模块始终展开。
    const firstTab = tabModules.value[0]?.key;
    if (firstTab) activeModule.value = firstTab;
    clearDirty();
  } catch (error: any) {
    detail.value = null;
    ElMessage.error(error?.message || '加载详情失败');
  } finally {
    loading.value = false;
  }
}

async function collectAll(): Promise<AgreementDetail | null> {
  if (!detail.value) return null;
  const next = cloneJson(detail.value);
  for (const item of visibleModules.value) {
    const values = await Promise.resolve(moduleApi(item.key)?.getValues());
    if (!values) continue;
    const { extraForms, extraTables, ...fields } = values;
    Object.assign(next, fields);
    if (extraForms) next.extraForms = { ...next.extraForms, ...extraForms };
    if (extraTables) next.extraTables = { ...next.extraTables, ...extraTables };
  }
  return next;
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
    const values = await Promise.resolve(api.getValues());
    const current = detail.value;
    if (!current) return;
    try {
      detail.value = await saveAgreementModule(agreementNo.value, key, values);
    } catch {
      const next = cloneJson(current) as AgreementDetail;
      if (values.extraForms) {
        next.extraForms = { ...next.extraForms, ...values.extraForms };
      }
      if (values.extraTables) {
        next.extraTables = {
          ...next.extraTables,
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
    const label = visibleModules.value.find((m) => m.key === key)?.label || key;
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
  const all = await collectAll();
  if (!all) return;
  saving.value = true;
  try {
    try {
      detail.value = await saveAgreementAll(all);
    } catch {
      detail.value = cloneJson(all);
      ElMessage.warning('接口暂不可用，已保存到本页内存');
      clearDirty();
      editing.value = false;
      return;
    }
    clearDirty();
    editing.value = false;
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
  const all = await collectAll();
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
  () => [agreementNo.value, route.query.schemaId, route.query.scene] as const,
  () => loadDetail(),
  { immediate: true },
);
</script>

<template>
  <!-- 不传 title：避免与多页签、下方操作栏重复占高 -->
  <Page>
    <ElEmpty v-if="!detail && !loading" description="暂无详情数据" />
    <div v-else-if="loading" v-loading="true" class="min-h-40"></div>

    <template v-else-if="detail">
      <!-- 顶栏：返回 + 协议名称；浏览 / 切换到编辑 -->
      <div
        class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200/80 bg-white px-4 py-3"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <ElButton size="small" @click="onBack">返回列表</ElButton>
            <span class="text-base font-semibold text-gray-900">
              {{ detail.basic?.agreementName || detail.agreementNo }}
            </span>
            <ElTag
              size="small"
              :type="detail.status === 'review' ? 'warning' : 'info'"
            >
              {{ detail.statusValue }}
            </ElTag>
          </div>
          <div class="mt-1 text-xs text-gray-400">
            协议编号：{{ detail.agreementNo }}
            <span class="mx-2">·</span>
            签订日期：{{ detail.basic?.signDate || '—' }}
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <ElButton
            v-if="hasWorkflowRuntimeAccess(accessStore.accessCodes, 'start')"
            @click="
              router.push({
                path: '/workflow',
                query: { agreementNo },
              })
            "
          >
            发起配置流程
          </ElButton>
          <template v-if="!isEditing">
            <ElButton
              v-if="canEnterEdit"
              type="warning"
              :loading="saving"
              @click="enterEdit"
            >
              切换到编辑
            </ElButton>
            <ElButton
              v-if="detailMode === 'edit'"
              type="primary"
              :loading="saving"
              @click="submitReview"
            >
              提交复核
            </ElButton>
          </template>
          <template v-else>
            <ElButton :loading="saving" @click="cancelEdit">取消编辑</ElButton>
            <ElButton type="primary" :loading="saving" @click="saveAll">
              全部保存
            </ElButton>
            <ElButton
              v-if="detailMode === 'edit'"
              type="primary"
              plain
              :loading="saving"
              @click="submitReview"
            >
              提交复核
            </ElButton>
          </template>
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

      <DetailLayout
        ref="layoutRef"
        v-model:active="activeModule"
        :modules="visibleModules"
      >
        <template #badge="{ item }">
          <span v-if="navBadge(item.key) !== ''" class="nav-badge">{{
            navBadge(item.key)
          }}</span>
          <i v-if="moduleDirty(item.key)" class="dirty-dot" title="未保存"></i>
        </template>
        <template #actions="{ item }">
          <ElButton
            v-if="isEditing && moduleDirty(item.key)"
            size="small"
            type="primary"
            plain
            :loading="saving"
            @click="saveModule(item.key)"
            >
保存本模块
</ElButton>
        </template>
        <template #default="{ item }">
          <DetailModule
            :ref="(el) => bindModuleApi(item.key, el)"
            :item="item"
            :detail="detail"
            :editable="isEditing"
            @dirty="onModuleDirty(item.key)"
          />
        </template>
      </DetailLayout>
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
  gap: 4px;
  min-width: 140px;
  padding: 12px 16px;
  text-align: left;
  background: #fff;
  border: 1px solid rgb(229 231 235 / 90%);
  border-left-width: 4px;
  border-radius: 10px;
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

:deep(.detail-tab.is-active) .nav-badge {
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
</style>
