<script lang="ts" setup>
import type { EpicPageSchema } from '../epic/types';
import type { FcRuleMap } from '../fc/types';
import type { AgreeModuleLayoutItem, AgreeModuleMount } from '../module-access';
import type {
  BasicModuleInnerConfig,
  ModuleInnerConfig,
} from '../module-inner-config';
/**
 * 协议签约详情：默认浏览；顶栏「切换到编辑」后整页可改
 * 浏览为表单文字 + 展示表；编辑为控件 + 行抽屉；全部保存一次提交
 */
import type { AgreementDetail, AgreementModuleKey } from '../types';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
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

import { canOperateAgreeAction } from '../actions';
import { cloneJson } from '../clone';
import { buildDefaultBasicEpicPageSchema } from '../epic/basic-page-schema';
import { cloneEpicPageSchema, isEpicPageSchema } from '../epic/types';
import { buildDefaultFcRuleMap } from '../fc/default-rules';
import { buildAgreementDetail } from '../mock-data';
import {
  isCustomAgreeModule,
  resolveAgreeModulesForPage,
} from '../module-access';
import {
  buildDefaultBasicModuleInner,
  buildDefaultCompensationModuleInner,
  buildDefaultHousesModuleInner,
  buildDefaultPopulationModuleInner,
  buildDefaultRewardsModuleInner,
} from '../module-inner-config';
import BasicModule from '../modules/basic-module.vue';
import CompensationModule from '../modules/compensation-module.vue';
import CustomFormModule from '../modules/custom-form-module.vue';
import CustomTableModule from '../modules/custom-table-module.vue';
import HousesModule from '../modules/houses-module.vue';
import PopulationModule from '../modules/population-module.vue';
import RewardsModule from '../modules/rewards-module.vue';
import { loadAgreeDetailPageConfig } from '../resolve-runtime';
import { getAgreeListPathByScene } from '../scene-paths';
import {
  useProvideAgreeDetailEditable,
  useProvideAgreeFieldRules,
} from '../use-field-access';

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
/** 基础信息 Epic 表单 Schema（页面配置 epicSchemas.basic） */
const epicBasicSchema = ref<EpicPageSchema>(buildDefaultBasicEpicPageSchema());
provide('agreeEpicBasicSchema', epicBasicSchema);
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

const basicRef = ref<InstanceType<typeof BasicModule>>();
const housesRef = ref<InstanceType<typeof HousesModule>>();
const compensationRef = ref<InstanceType<typeof CompensationModule>>();
const rewardsRef = ref<InstanceType<typeof RewardsModule>>();
const populationRef = ref<InstanceType<typeof PopulationModule>>();
const customApis = ref<
  Record<string, { getValues: () => any; validate: () => Promise<boolean> }>
>({});

/**
 * 绑定自定义模块组件实例
 * 注意：ref 回调在每次更新都会触发，若每次都 new 对象会触发「Maximum recursive updates」
 * @param key 模块
 * @param el 组件实例
 */
function bindCustomApi(key: string, el: any) {
  if (el) {
    // 同一实例重复回调时直接跳过，避免 Recursive updates
    if (customApis.value[key] === el) return;
    customApis.value[key] = el;
    return;
  }
  if (!(key in customApis.value)) return;
  const next = { ...customApis.value };
  customApis.value = Object.fromEntries(
    Object.entries(next).filter(([k]) => k !== key),
  );
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

/** 明细 Tab（基础信息固定在上方，不进胶囊） */
const tabModules = computed(() =>
  visibleModules.value.filter((m) => m.key !== 'basic'),
);

/** 主胶囊：内置模块（房屋/补偿/奖励/人口） */
const primaryTabModules = computed(() =>
  tabModules.value.filter((m) => !isCustomAgreeModule(String(m.key))),
);

/** 「更多」：配置台自定义模块 */
const moreTabModules = computed(() =>
  tabModules.value.filter((m) => isCustomAgreeModule(String(m.key))),
);

/** 是否展示基础信息块 */
const showBasicBlock = computed(() => isModuleShown('basic'));

/** 配置台新建的表单模块 */
const customFormModules = computed(() =>
  tabModules.value.filter(
    (m) => isCustomAgreeModule(String(m.key)) && m.widgetKind === 'form',
  ),
);

/** 配置台新建的表格模块 */
const customTableModules = computed(() =>
  tabModules.value.filter(
    (m) => isCustomAgreeModule(String(m.key)) && m.widgetKind === 'table',
  ),
);

/** 当前展示的模块元数据（明细 Tab） */
const currentModule = computed<AgreeModuleLayoutItem | undefined>(() =>
  tabModules.value.find((m) => m.key === activeModule.value),
);

/** 当前 Tab 是否属于「更多」里的自定义 */
const activeInMore = computed(() =>
  moreTabModules.value.some((m) => m.key === activeModule.value),
);

/**
 * 当前 Tab 右侧是否显示「保存本模块」（编辑态且本块有改动时的次入口）
 */
const showPaneSave = computed(() => {
  if (!isEditing.value || !currentModule.value) return false;
  return moduleDirty(currentModule.value.key);
});

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
  tabModules,
  (list) => {
    if (list.length === 0) return;
    if (!list.some((m) => m.key === activeModule.value)) {
      const first = list[0];
      if (first) activeModule.value = first.key;
    }
    nextTick(() => updatePillsScrollState());
  },
  { immediate: true },
);

/** 胶囊滚动容器 */
const pillsRef = ref<HTMLElement | null>(null);
/** 是否可向左滚 */
const canScrollLeft = ref(false);
/** 是否可向右滚 */
const canScrollRight = ref(false);

/**
 * 根据滚动位置更新左右箭头显隐（仅在值变化时写入，避免箭头占位抖动死循环）
 */
function updatePillsScrollState() {
  const el = pillsRef.value;
  if (!el) {
    if (canScrollLeft.value) canScrollLeft.value = false;
    if (canScrollRight.value) canScrollRight.value = false;
    return;
  }
  const max = el.scrollWidth - el.clientWidth;
  const left = el.scrollLeft > 2;
  const right = max > 2 && el.scrollLeft < max - 2;
  if (canScrollLeft.value !== left) canScrollLeft.value = left;
  if (canScrollRight.value !== right) canScrollRight.value = right;
}

/**
 * 横向滚动胶囊列表
 * @param dir -1 向左 / 1 向右
 */
function scrollPills(dir: -1 | 1) {
  const el = pillsRef.value;
  if (!el) return;
  const step = Math.max(160, Math.floor(el.clientWidth * 0.6));
  el.scrollBy({ left: dir * step, behavior: 'smooth' });
}

/**
 * 把当前激活胶囊滚进可视区
 */
function scrollActivePillIntoView() {
  const root = pillsRef.value;
  if (!root) return;
  const active = root.querySelector(
    '.agree-pill.is-active',
  ) as HTMLElement | null;
  active?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest',
  });
  nextTick(() => updatePillsScrollState());
}

watch(activeModule, () => {
  nextTick(() => scrollActivePillIntoView());
});

onMounted(() => {
  nextTick(() => updatePillsScrollState());
  window.addEventListener('resize', updatePillsScrollState);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePillsScrollState);
});

/** 取某模块组件 ref */
function moduleApi(key: AgreementModuleKey) {
  switch (key) {
    case 'basic': {
      return basicRef.value;
    }
    case 'compensation': {
      return compensationRef.value;
    }
    case 'houses': {
      return housesRef.value;
    }
    case 'population': {
      return populationRef.value;
    }
    case 'rewards': {
      return rewardsRef.value;
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
  if (key === 'basic') {
    nextTick(() => {
      document
        .querySelector('#agree-basic-block')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }
  activeModule.value = key;
  nextTick(() => {
    document
      .querySelector('#agree-detail-workspace')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
  if (key === 'basic') {
    nextTick(() => {
      document
        .querySelector('#agree-basic-block')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }
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
    const basicEpic = pageCfg.epicSchemas?.basic;
    epicBasicSchema.value = isEpicPageSchema(basicEpic)
      ? cloneEpicPageSchema(basicEpic)
      : buildDefaultBasicEpicPageSchema();
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
    // 基础信息已固定在上方，默认选中下方第一个 Tab，避免内容区全隐藏
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
  const basic = await Promise.resolve(basicRef.value?.getValues());
  const houses = await Promise.resolve(housesRef.value?.getValues());
  const compensation = await Promise.resolve(
    compensationRef.value?.getValues(),
  );
  const rewards = await Promise.resolve(rewardsRef.value?.getValues());
  const population = await Promise.resolve(populationRef.value?.getValues());
  const extraForms = { ...detail.value.extraForms };
  const extraTables = { ...detail.value.extraTables };
  for (const m of customFormModules.value) {
    const customFormValues = await Promise.resolve(
      customApis.value[m.key]?.getValues(),
    );
    const part = customFormValues?.extraForms;
    if (part) Object.assign(extraForms, part);
  }
  for (const m of customTableModules.value) {
    const customTableValues = await Promise.resolve(
      customApis.value[m.key]?.getValues(),
    );
    const part = customTableValues?.extraTables;
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

      <ElEmpty
        v-if="!visibleModules.length"
        description="当前角色无权查看任何详情区域，请在角色管理勾选「区域-*」权限"
      />

      <!-- 基础信息：固定在上；随整页浏览/编辑切换 -->
      <section
        v-if="showBasicBlock"
        id="agree-basic-block"
        class="agree-basic-card mb-3"
      >
        <div class="agree-basic-card__head">
          <span class="font-medium text-gray-800">基础信息</span>
        </div>
        <div class="agree-basic-card__body">
          <BasicModule
            ref="basicRef"
            :detail="detail"
            :editable="isEditing"
            @dirty="onModuleDirty('basic')"
          />
        </div>
      </section>

      <!-- 明细 Tab：主胶囊 + 更多；表格抽屉 / 表单块编辑 -->
      <section
        v-if="tabModules.length"
        id="agree-detail-workspace"
        class="agree-pane"
      >
        <header class="agree-pane-head">
          <div class="agree-pills-wrap">
            <button
              type="button"
              class="agree-pills-arrow"
              :class="{ 'is-hidden': !canScrollLeft }"
              aria-label="向左滚动模块"
              @click="scrollPills(-1)"
            >
              ‹
            </button>
            <nav
              ref="pillsRef"
              class="agree-pills"
              aria-label="协议明细模块"
              @scroll.passive="updatePillsScrollState"
            >
              <button
                v-for="m in primaryTabModules"
                :key="m.key"
                type="button"
                class="agree-pill"
                :class="{ 'is-active': activeModule === m.key }"
                :title="m.label"
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
                ></i>
              </button>
              <ElDropdown
                v-if="moreTabModules.length"
                trigger="click"
                @command="selectModule"
              >
                <button
                  type="button"
                  class="agree-pill"
                  :class="{ 'is-active': activeInMore }"
                >
                  <span class="agree-pill__label">更多</span>
                  <span class="nav-badge">{{ moreTabModules.length }}</span>
                </button>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem
                      v-for="m in moreTabModules"
                      :key="m.key"
                      :command="m.key"
                    >
                      {{ m.label }}
                      <span
                        v-if="moduleDirty(m.key)"
                        class="ml-1 text-orange-500"
                      >
                        ●
                      </span>
                    </ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
            </nav>
            <button
              type="button"
              class="agree-pills-arrow"
              :class="{ 'is-hidden': !canScrollRight }"
              aria-label="向右滚动模块"
              @click="scrollPills(1)"
            >
              ›
            </button>
          </div>
          <div v-if="isEditing && currentModule" class="agree-pane-actions">
            <i
              v-if="moduleDirty(currentModule.key)"
              class="dirty-dot"
              title="未保存"
            ></i>
            <ElButton
              v-if="showPaneSave"
              size="small"
              type="primary"
              plain
              :loading="saving"
              @click="saveModule(currentModule.key)"
            >
              保存本模块
            </ElButton>
          </div>
        </header>

        <div class="agree-pane-body">
          <div
            v-if="isModuleShown('houses')"
            v-show="activeModule === 'houses'"
          >
            <HousesModule
              ref="housesRef"
              :detail="detail"
              :can-edit="isEditing"
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
              :can-edit="isEditing"
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
              :can-edit="isEditing"
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
              :editable="isEditing"
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
              :editable="isEditing"
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
              :can-edit="isEditing"
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

.agree-basic-card {
  overflow: hidden;
  background: #fff;
  border: 1px solid rgb(229 231 235 / 80%);
  border-radius: 10px;
}

.agree-basic-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #f3f4f6;
}

.agree-basic-card__body {
  padding: 12px 16px 16px;
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

/** 胶囊区：中间可滚，两侧箭头，与右侧保存按钮隔离 */
.agree-pills-wrap {
  display: flex;
  flex: 1;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.agree-pills-arrow {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 20px;
  line-height: 1;
  color: #4b5563;
  cursor: pointer;
  user-select: none;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.agree-pills-arrow:hover {
  color: #1d4ed8;
  background: #eff6ff;
  border-color: rgb(37 99 235 / 25%);
}

/** 占位隐藏：避免 v-show 导致宽度跳动 → 滚动状态抖动 */
.agree-pills-arrow.is-hidden {
  visibility: hidden;
  pointer-events: none;
}

.agree-pills {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  padding: 2px 0;
  overflow-x: auto;
  scroll-behavior: smooth;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.agree-pills::-webkit-scrollbar {
  display: none;
}

.agree-pill {
  display: inline-flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  max-width: 12em;
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agree-pane-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  padding-left: 4px;
  border-left: 1px solid #f3f4f6;
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

  .agree-pills-wrap {
    width: 100%;
  }

  .agree-pane-actions {
    justify-content: flex-end;
    width: 100%;
    padding-top: 4px;
    padding-left: 0;
    margin-left: auto;
    border-top: 1px solid #f3f4f6;
    border-left: none;
  }
}
</style>
