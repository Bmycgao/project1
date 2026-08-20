<script lang="ts" setup>
/**
 * 页面字段配置表单：
 * - entity / template：编辑列与查询条件
 * - scene：引用列模板 + 可覆盖列表列 + 只能勾选动作库中已实现的动作
 */
import type { PageSchemaApi } from '#/api';

import { computed, nextTick, ref, watch } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElCollapse,
  ElCollapseItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import {
  createPageSchema,
  getPageSchema,
  getPageSchemaHistory,
  getRoleAccessCodes,
  getRoleList,
  rollbackPageSchema,
  updatePageSchema,
  type PageSchemaHistorySummary,
  type SystemRoleApi,
} from '#/api';

import {
  groupAgreeActions,
  resolveToolbarButtons,
  type AgreeButtonBind,
} from '../../../biz/agreement/actions';
import {
  DEFAULT_AGREE_FIELD_RULES,
  type AgreeFieldRule,
} from '../../../biz/agreement/field-access';
import {
  AGREE_DETAIL_MODULES,
  buildAgreeModuleMounts,
  inferCustomWidgetKind,
  isCustomAgreeModule,
  metaFromMount,
  normalizeAgreeModuleMounts,
  normalizeModuleSpan,
  type AgreeModuleMount,
} from '../../../biz/agreement/module-access';

import {
  getDefaultColumns,
  getDefaultQueryFields,
  useFormSchema,
} from '../data';
import {
  buildSchemaPreview,
  type SchemaPreviewResult,
} from '../preview-runtime';
import { type ModuleLayoutEditRow } from './module-layout-editor.vue';
import DetailDesigner from './detail-designer.vue';
import {
  buildDefaultBasicModuleInner,
  buildDefaultCompensationModuleInner,
  buildDefaultCustomFormInner,
  buildDefaultCustomTableInner,
  buildDefaultHousesModuleInner,
  buildDefaultPopulationModuleInner,
  buildDefaultRewardsModuleInner,
  normalizeBasicModuleInner,
  normalizeCompensationModuleInner,
  normalizeCustomFormInner,
  normalizeCustomTableInner,
  normalizeHousesModuleInner,
  normalizePopulationModuleInner,
  normalizeRewardsModuleInner,
  type BasicModuleInnerConfig,
  type ModuleInnerConfig,
} from '../../../biz/agreement/module-inner-config';

const emits = defineEmits<{ success: [] }>();

const formData = ref<PageSchemaApi.PageSchema>();
const id = ref<string>();
const columns = ref<PageSchemaApi.Column[]>([]);
const queryFields = ref<PageSchemaApi.QueryField[]>([]);
/** 字段显隐/可编辑规则（列模板） */
const fieldRules = ref<AgreeFieldRule[]>([]);
/** 场景勾选的动作码（仅动作库内） */
const selectedActionCodes = ref<string[]>([]);
/** 每个动作码的差异化绑定 */
const actionBinds = ref<Record<string, AgreeButtonBind>>({});
/** 场景数据范围：允许的状态 */
const selectedStatusIn = ref<string[]>([]);
/** 场景详情模块布局（勾选/顺序/占比，可视化拖拽编辑） */
const moduleLayoutRows = ref<ModuleLayoutEditRow[]>(
  createDefaultModuleLayoutRows(),
);
/** 基础信息模块内部字段配置 */
const basicInnerConfig = ref<BasicModuleInnerConfig>(
  buildDefaultBasicModuleInner(),
);
const housesInnerConfig = ref<ModuleInnerConfig>(
  buildDefaultHousesModuleInner(),
);
/** 补偿安置内部列配置 */
const compensationInnerConfig = ref<ModuleInnerConfig>(
  buildDefaultCompensationModuleInner(),
);
/** 奖励补贴内部列配置 */
const rewardsInnerConfig = ref<ModuleInnerConfig>(
  buildDefaultRewardsModuleInner(),
);
/** 协议人口表单配置 */
const populationInnerConfig = ref<ModuleInnerConfig>(
  buildDefaultPopulationModuleInner(),
);
/** 配置台新建业务组件的内部配置 */
const customInnerMap = ref<Record<string, ModuleInnerConfig>>({});
/** 当前配置类型（与表单 schemaKind 同步） */
const schemaKind = ref<'entity' | 'scene' | 'template'>('entity');

/** —— 可视化预览 —— */
const roleOptions = ref<SystemRoleApi.SystemRole[]>([]);
const previewRoleId = ref('R_VIEWER');
const previewStatus = ref('待复核');
/** 按角色验权限：默认收起，避免当成页面预览 */
const previewCollapse = ref<string[]>([]);
const previewLoading = ref(false);
const previewRoleName = ref('');
const previewResult = ref<SchemaPreviewResult | null>(null);

/** 配置历史（回滚） */
const historyLoading = ref(false);
const historyList = ref<PageSchemaHistorySummary[]>([]);

/** 常见状态（场景数据范围勾选） */
const STATUS_OPTIONS = [
  '告知单',
  '待复核',
  '草稿',
  '组长已复核',
  '项目经理已审核',
  '签约已确认',
];

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  /**
   * 同步 schemaKind，切换实体/场景编辑区
   * @param values 表单当前值
   */
  handleValuesChange(values) {
    const kind = (values?.schemaKind || 'entity') as typeof schemaKind.value;
    schemaKind.value = kind;
  },
});

const cellTypeOptions = [
  { label: '文本', value: 'text' },
  { label: '状态', value: 'status' },
  { label: '标签', value: 'tag' },
];

const queryCompOptions = [
  { label: '输入框', value: 'Input' },
  { label: '下拉框', value: 'Select' },
];

/** 动作库分组（配置页勾选） */
const actionGroups = groupAgreeActions();

/** 是否场景类型：模块/按钮 + 可覆盖列表列 */
const isScene = computed(() => schemaKind.value === 'scene');

/** 安全拷贝列配置（避免非数组脏数据） */
function cloneColumns(list: unknown): PageSchemaApi.Column[] {
  return Array.isArray(list)
    ? structuredClone(list)
    : getDefaultColumns();
}

/** 安全拷贝查询配置 */
function cloneQueryFields(list: unknown): PageSchemaApi.QueryField[] {
  return Array.isArray(list)
    ? structuredClone(list)
    : getDefaultQueryFields();
}

/**
 * 从详情 buttons 提取已注册动作码
 * @param buttons 接口返回的按钮
 */
function codesFromButtons(
  buttons: PageSchemaApi.PageSchema['buttons'],
): string[] {
  const codes = (buttons || []).map((b) => b.code);
  // 只保留动作库中存在的，防止脏数据带入
  return resolveToolbarButtons(codes).map((b) => b.code);
}

/**
 * 从详情 buttons 还原 bind 配置
 * @param buttons 接口按钮
 */
function bindsFromButtons(
  buttons: PageSchemaApi.PageSchema['buttons'],
): Record<string, AgreeButtonBind> {
  const map: Record<string, AgreeButtonBind> = {};
  for (const b of buttons || []) {
    if (b.bind && Object.keys(b.bind).length) {
      map[b.code] = {
        api: b.bind.api || '',
        method: b.bind.method || 'POST',
        confirmText: b.bind.confirmText || '',
        successMsg: b.bind.successMsg || '',
        redirect: b.bind.redirect || '',
        showWhenStatusIn: b.bind.showWhenStatusIn
          ? [...b.bind.showWhenStatusIn]
          : [],
      };
    }
  }
  return map;
}

/**
 * 确保勾选动作有 bind 槽位
 * @param codes 勾选的动作码
 */
function ensureBindsForCodes(codes: string[]) {
  for (const code of codes) {
    if (!actionBinds.value[code]) {
      actionBinds.value[code] = {
        api: '',
        method: 'POST',
        confirmText: '',
        successMsg: '',
        redirect: '',
        showWhenStatusIn: [],
      };
    }
  }
}

watch(
  selectedActionCodes,
  (codes) => {
    ensureBindsForCodes(codes);
  },
  { deep: true },
);

/** 已勾选动作的绑定编辑行 */
const bindRows = computed(() =>
  selectedActionCodes.value.map((code) => {
    const def = resolveToolbarButtons([code])[0];
    return {
      code,
      label: def?.label || code,
      bind: actionBinds.value[code] || {
        api: '',
        method: 'POST' as const,
        confirmText: '',
        successMsg: '',
        redirect: '',
        showWhenStatusIn: [] as string[],
      },
    };
  }),
);
/**
 * 默认模块布局行（全部启用、默认顺序、整行）
 */
function createDefaultModuleLayoutRows(): ModuleLayoutEditRow[] {
  return buildAgreeModuleMounts().map((m) => {
    const meta = AGREE_DETAIL_MODULES.find((x) => x.key === m.key)!;
    return {
      key: m.key,
      label: meta.label,
      authCode: meta.authCode,
      enabled: m.enabled,
      order: m.order ?? 10,
      span: normalizeModuleSpan(m.span),
      widgetKind: meta.widgetKind,
      custom: false,
      desc: meta.desc,
    };
  });
}

/**
 * 组装场景 modules 挂载配置（含 order / span）
 */
function buildSceneModules(): AgreeModuleMount[] {
  return moduleLayoutRows.value.map((row) => ({
    key: row.key,
    enabled: row.enabled,
    order: row.order,
    span: normalizeModuleSpan(row.span),
    label: row.label,
    desc: row.desc,
    widgetKind: row.widgetKind,
    custom: row.custom,
    authCode: row.authCode,
  }));
}

/**
 * 从详情还原模块布局表
 * @param modules 接口 modules
 */
function rowsFromModules(
  modules: PageSchemaApi.PageSchema['modules'],
): ModuleLayoutEditRow[] {
  const normalized = normalizeAgreeModuleMounts(
    modules as AgreeModuleMount[] | undefined,
  );
  return normalized
    .map((m) => {
      const meta = metaFromMount(m);
      return {
        key: m.key,
        label: meta.label,
        authCode: meta.authCode,
        enabled: m.enabled,
        order: m.order ?? 10,
        span: normalizeModuleSpan(m.span),
        widgetKind: meta.widgetKind,
        custom: isCustomAgreeModule(String(m.key)),
        desc: meta.desc,
      };
    })
    .sort((a, b) => a.order - b.order);
}

/** 页面配置里不算自定义业务组件的 moduleInner key */
const BUILTIN_INNER_KEYS = new Set([
  'basic',
  'houses',
  'compensation',
  'rewards',
  'population',
  'rightHolders',
  'signing',
  'material',
  'signMaterial',
  'certifyMaterial',
]);

/**
 * 从已存 moduleInner 抽出自定义组件配置
 * @param inner 场景 moduleInner
 * @param layouts 布局行（用于推断表单/表格）
 */
function extractCustomInnerMap(
  inner: PageSchemaApi.PageSchema['moduleInner'] | undefined,
  layouts: ModuleLayoutEditRow[],
): Record<string, ModuleInnerConfig> {
  const map: Record<string, ModuleInnerConfig> = {};
  for (const [key, block] of Object.entries(inner || {})) {
    if (BUILTIN_INNER_KEYS.has(key) || !block) continue;
    const row = layouts.find((r) => r.key === key);
    const kind =
      row?.widgetKind || inferCustomWidgetKind(key);
    const label = row?.label || '自定义组件';
    map[key] =
      kind === 'table'
        ? normalizeCustomTableInner(block as ModuleInnerConfig, label)
        : normalizeCustomFormInner(block as ModuleInnerConfig, label);
  }
  for (const row of layouts) {
    if (!row.custom && !isCustomAgreeModule(String(row.key))) continue;
    if (map[row.key]) continue;
    map[row.key] =
      row.widgetKind === 'table'
        ? buildDefaultCustomTableInner(row.label)
        : buildDefaultCustomFormInner(row.label);
  }
  return map;
}

/**
 * 组装保存用的 buttons（含 bind）
 */
function buildSceneButtons() {
  return selectedActionCodes.value.map((code) => {
    const base = resolveToolbarButtons([code])[0]!;
    const raw = actionBinds.value[code] || {};
    const bind: AgreeButtonBind = {};
    if (raw.api?.trim()) bind.api = raw.api.trim();
    if (raw.method) bind.method = raw.method;
    if (raw.confirmText?.trim()) bind.confirmText = raw.confirmText.trim();
    if (raw.successMsg?.trim()) bind.successMsg = raw.successMsg.trim();
    if (raw.redirect?.trim()) bind.redirect = raw.redirect.trim();
    if (raw.showWhenStatusIn?.length) {
      bind.showWhenStatusIn = [...raw.showWhenStatusIn];
    }
    return {
      ...base,
      ...(Object.keys(bind).length ? { bind } : {}),
    };
  });
}

/** 新增一列表字段 */
function addColumn() {
  const maxOrder = columns.value.reduce(
    (m, c) => Math.max(m, c.order ?? 0),
    0,
  );
  columns.value.push({
    field: `field${columns.value.length + 1}`,
    title: '新字段',
    visible: true,
    width: 120,
    cellType: 'text',
    order: maxOrder + 10,
  });
}

/** 删除列 */
function removeColumn(index: number) {
  columns.value.splice(index, 1);
}

/**
 * 按 order 重排并写回（编辑后保证顺序一致）
 */
function resortColumns() {
  columns.value = [...columns.value].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999),
  );
}

/**
 * 上移/下移列
 * @param index 当前下标（已按 order 展示）
 * @param dir -1 上移 / 1 下移
 */
function moveColumn(index: number, dir: -1 | 1) {
  resortColumns();
  const target = index + dir;
  if (target < 0 || target >= columns.value.length) return;
  const cur = columns.value[index]!;
  const other = columns.value[target]!;
  const curOrder = cur.order ?? (index + 1) * 10;
  const otherOrder = other.order ?? (target + 1) * 10;
  cur.order = otherOrder;
  other.order = curOrder;
  resortColumns();
}

/** 新增查询项 */
function addQueryField() {
  queryFields.value.push({
    field: `q${queryFields.value.length + 1}`,
    title: '查询项',
    component: 'Input',
  });
}

/** 删除查询项 */
function removeQueryField(index: number) {
  queryFields.value.splice(index, 1);
}

/** 新增字段规则行 */
function addFieldRule() {
  fieldRules.value.push({
    field: '',
    hidden: false,
    visibleCodes: [],
    editableCodes: [],
    remark: '',
    displayFormat: { type: 'text' },
  });
}

/**
 * 确保规则有 displayFormat 对象便于表格编辑
 * @param row 规则行
 */
function ensureDisplayFormat(row: AgreeFieldRule) {
  if (!row.displayFormat) {
    row.displayFormat = { type: 'text' };
  }
  return row.displayFormat;
}

/**
 * 删除字段规则
 * @param index 行下标
 */
function removeFieldRule(index: number) {
  fieldRules.value.splice(index, 1);
}

/**
 * 权限码数组 ↔ 逗号分隔文案（表格编辑用）
 * @param list 权限码
 */
function codesToText(list?: string[]) {
  return (list || []).join(',');
}

/**
 * 文案 → 权限码数组
 * @param text 逗号/空格分隔
 */
function textToCodes(text: string): string[] {
  return String(text || '')
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 加载角色下拉（预览用） */
async function loadRoleOptions() {
  try {
    const res = await getRoleList({ page: 1, pageSize: 100 });
    roleOptions.value = res?.items || [];
    if (
      !roleOptions.value.some((r) => String(r.id) === previewRoleId.value) &&
      roleOptions.value[0]
    ) {
      previewRoleId.value = String(roleOptions.value[0].id);
    }
  } catch {
    roleOptions.value = [];
  }
}

/**
 * 按所选角色 + 当前草稿配置生成预览
 */
async function runPreview() {
  if (!previewRoleId.value) {
    ElMessage.warning('请先选择预览角色');
    return;
  }
  previewLoading.value = true;
  previewResult.value = null;
  try {
    const roleCodes = await getRoleAccessCodes(previewRoleId.value);
    previewRoleName.value = roleCodes.roleName || previewRoleId.value;

    let previewColumns = [...columns.value]
      .filter((c) => c.visible !== false)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    let previewRules = fieldRules.value;
    const values = await formApi.getValues();

    // 场景：优先用本场景已配列；字段规则仍可从列模板继承
    if (schemaKind.value === 'scene') {
      const tplId = String(values.columnTemplateId || '').trim();
      if (tplId) {
        try {
          const tpl = await getPageSchema(tplId);
          if (!previewColumns.length && tpl?.columns?.length) {
            previewColumns = tpl.columns
              .filter((c) => c.visible !== false)
              .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
          }
          if (!previewRules.length && tpl?.fieldRules?.length) {
            previewRules = tpl.fieldRules as AgreeFieldRule[];
          }
        } catch {
          ElMessage.warning('列模板加载失败，预览仅含当前场景草稿列/按钮');
        }
      }
    }

    previewResult.value = buildSchemaPreview(
      {
        schemaKind: schemaKind.value,
        columns: previewColumns,
        fieldRules: previewRules,
        actionCodes: selectedActionCodes.value,
        actionBinds: actionBinds.value,
        sampleStatus: previewStatus.value || undefined,
        modules: buildSceneModules(),
      },
      roleCodes.codes,
    );
  } catch (error: any) {
    ElMessage.error(error?.message || '预览失败');
  } finally {
    previewLoading.value = false;
  }
}

/** 加载当前配置历史版本 */
async function loadHistory() {
  if (!id.value) {
    historyList.value = [];
    return;
  }
  historyLoading.value = true;
  try {
    historyList.value = (await getPageSchemaHistory(id.value)) || [];
  } catch {
    historyList.value = [];
  } finally {
    historyLoading.value = false;
  }
}

/**
 * 回滚到某一历史版本
 * @param versionId 版本 ID
 */
async function onRollback(versionId: string) {
  if (!id.value) return;
  try {
    await ElMessageBox.confirm(
      '回滚后当前内容会先存入历史，确认恢复到该版本？',
      '配置回滚',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    const detail = await rollbackPageSchema(id.value, versionId);
    ElMessage.success('已回滚到所选版本');
    await fillForm(detail);
    await loadHistory();
    previewResult.value = null;
    emits('success');
  } catch (error: any) {
    ElMessage.error(error?.message || '回滚失败');
  }
}

/**
 * 用详情接口回填（避免列表行被 VXE 改写 columns）
 * @param detail 页面配置详情
 */
async function fillForm(detail: PageSchemaApi.PageSchema) {
  formData.value = detail;
  id.value = detail.id;
  schemaKind.value = detail.schemaKind || 'entity';
  await formApi.setValues({
    name: detail.name,
    title: detail.title,
    status: detail.status,
    remark: detail.remark,
    schemaKind: detail.schemaKind || 'entity',
    scene: detail.scene || '',
    columnTemplateId: detail.columnTemplateId || '',
  });
  columns.value = cloneColumns(detail.columns);
  // 补齐缺失 order，并按顺序展示
  columns.value.forEach((c, i) => {
    if (c.order == null) c.order = (i + 1) * 10;
  });
  columns.value.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  queryFields.value = cloneQueryFields(detail.queryFields);
  fieldRules.value = Array.isArray(detail.fieldRules)
    ? structuredClone(detail.fieldRules) as AgreeFieldRule[]
    : [];
  selectedActionCodes.value = codesFromButtons(detail.buttons);
  actionBinds.value = bindsFromButtons(detail.buttons);
  selectedStatusIn.value = Array.isArray(detail.statusIn)
    ? [...detail.statusIn]
    : [];
  moduleLayoutRows.value = rowsFromModules(detail.modules);
  basicInnerConfig.value = normalizeBasicModuleInner(
    detail.moduleInner?.basic as BasicModuleInnerConfig | undefined,
  );
  housesInnerConfig.value = normalizeHousesModuleInner(
    (detail.moduleInner as any)?.houses as ModuleInnerConfig | undefined,
    detail.moduleInner?.basic as ModuleInnerConfig | undefined,
  );
  compensationInnerConfig.value = normalizeCompensationModuleInner(
    (detail.moduleInner as any)?.compensation as ModuleInnerConfig | undefined,
  );
  rewardsInnerConfig.value = normalizeRewardsModuleInner(
    (detail.moduleInner as any)?.rewards as ModuleInnerConfig | undefined,
  );
  populationInnerConfig.value = normalizePopulationModuleInner(
    (detail.moduleInner as any)?.population as ModuleInnerConfig | undefined,
  );
  customInnerMap.value = extractCustomInnerMap(
    detail.moduleInner,
    moduleLayoutRows.value,
  );
}

const [Drawer, drawerApi] = useVbenDrawer({
  class: 'w-[96vw] max-w-[1440px]',
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = await formApi.getValues();
    const kind = (values.schemaKind || 'entity') as typeof schemaKind.value;

    if (kind === 'scene') {
      if (!values.scene) {
        ElMessage.warning('场景类型必须填写场景码');
        return;
      }
      if (!values.columnTemplateId) {
        ElMessage.warning('场景类型必须填写列模板 ID');
        return;
      }
      if (!selectedActionCodes.value.length) {
        ElMessage.warning('请至少勾选一个已实现动作');
        return;
      }
      if (!moduleLayoutRows.value.some((r) => r.enabled)) {
        ElMessage.warning('请至少挂载一个详情模块');
        return;
      }
      // 场景可继承列模板：仅当本场景已配列时才校验至少一列可见
      if (
        columns.value.length > 0 &&
        !columns.value.some((c) => c.visible)
      ) {
        ElMessage.warning('至少保留一列可见的列表字段');
        return;
      }
    } else if (!columns.value.some((c) => c.visible)) {
      ElMessage.warning('至少保留一列可见字段');
      return;
    }

    /** 场景：按钮只存动作库解析结果；列可场景级覆盖（空则读时继承模板） */
    const payload =
      kind === 'scene'
        ? ({
            ...values,
            schemaKind: 'scene',
            columns: columns.value.map((c, i) => ({
              ...c,
              order: c.order ?? (i + 1) * 10,
            })),
            queryFields: queryFields.value,
            buttons: buildSceneButtons(),
            statusIn: selectedStatusIn.value,
            modules: buildSceneModules(),
            moduleInner: {
              basic: normalizeBasicModuleInner(basicInnerConfig.value),
              houses: normalizeHousesModuleInner(housesInnerConfig.value),
              compensation: normalizeCompensationModuleInner(
                compensationInnerConfig.value,
              ),
              rewards: normalizeRewardsModuleInner(rewardsInnerConfig.value),
              population: normalizePopulationModuleInner(
                populationInnerConfig.value,
              ),
              ...customInnerMap.value,
            },
          } as any)
        : ({
            ...values,
            schemaKind: kind,
            columns: columns.value.map((c, i) => ({
              ...c,
              order: c.order ?? (i + 1) * 10,
            })),
            queryFields: queryFields.value,
            fieldRules: fieldRules.value,
            buttons: undefined,
            scene: undefined,
            columnTemplateId: undefined,
            statusIn: undefined,
          } as any);

    drawerApi.lock();
    try {
      if (id.value) {
        await updatePageSchema(id.value, payload);
      } else {
        await createPageSchema(payload);
      }
      emits('success');
      drawerApi.close();
    } catch {
      drawerApi.unlock();
    }
  },
  onCancel() {
    // 自定义 onCancel 时 DrawerApi 不会自动 close，需手动关
    drawerApi.unlock();
    drawerApi.close();
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    const data = drawerApi.getData<PageSchemaApi.PageSchema>();
    await formApi.reset();
    columns.value = [];
    queryFields.value = [];
    fieldRules.value = [];
    selectedActionCodes.value = [];
    actionBinds.value = {};
    selectedStatusIn.value = [];
    moduleLayoutRows.value = createDefaultModuleLayoutRows();
    basicInnerConfig.value = buildDefaultBasicModuleInner();
    housesInnerConfig.value = buildDefaultHousesModuleInner();
    compensationInnerConfig.value = buildDefaultCompensationModuleInner();
    rewardsInnerConfig.value = buildDefaultRewardsModuleInner();
    populationInnerConfig.value = buildDefaultPopulationModuleInner();
    customInnerMap.value = {};
    schemaKind.value = 'entity';
    previewResult.value = null;
    previewRoleName.value = '';
    historyList.value = [];
    formData.value = data;
    id.value = data?.id;
    await nextTick();
    void loadRoleOptions();

    if (data?.id) {
      try {
        // 始终拉详情，保证 columns / queryFields 完整
        const detail = await getPageSchema(data.id);
        await fillForm(detail);
        await loadHistory();
      } catch {
        // 接口失败时尽量用行数据兜底
        await fillForm({
          ...data,
          columns: Array.isArray(data.columns) ? data.columns : [],
          queryFields: Array.isArray(data.queryFields) ? data.queryFields : [],
        });
        ElMessage.warning('详情加载失败，已尝试使用列表行数据');
      }
    } else {
      id.value = undefined;
      columns.value = getDefaultColumns();
      queryFields.value = getDefaultQueryFields();
      fieldRules.value = structuredClone(DEFAULT_AGREE_FIELD_RULES);
      await formApi.setValues({ schemaKind: 'entity', status: 1 });
    }
  },
});

const title = computed(() => {
  if (!formData.value?.id) return '新建页面配置';
  return isScene.value ? '配置场景 · 详情组装' : '配置列表字段';
});
</script>

<template>
  <Drawer :title="title">
    <Form />

    <!-- 场景：数据范围 / 模块 / 列表列 / 动作 -->
    <div v-if="isScene" class="mt-4">
      <div class="mb-2 font-medium">本岗能看的状态</div>
      <p class="mb-2 text-xs text-gray-500">
        这是列表数据白名单，不是搜索条件。勾选后本场景列表只出现这些状态（如录入岗：告知单/待复核/草稿）。不勾选则不过滤。
      </p>
      <ElCheckboxGroup v-model="selectedStatusIn" class="mb-4">
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <ElCheckbox
            v-for="s in STATUS_OPTIONS"
            :key="s"
            :value="s"
          >
            {{ s }}
          </ElCheckbox>
        </div>
      </ElCheckboxGroup>

      <div class="mb-2 mt-2 flex items-center justify-between">
        <div class="font-medium">列表表格字段</div>
        <ElButton size="small" type="primary" @click="addColumn">添加列</ElButton>
      </div>
      <p class="mb-2 text-xs text-gray-500">
        控制协议列表表头（协议编号、被补偿人等）：开关「显示」、改标题/宽度、上下调整顺序。
        首次打开若为空会从列模板带入；保存后本场景独立生效。
      </p>
      <ElTable :data="columns" border size="small" class="mb-4">
        <ElTableColumn label="字段名" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.field" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="列标题" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.title" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="类型" width="100">
          <template #default="{ row }">
            <ElSelect v-model="row.cellType" size="small" class="w-full">
              <ElOption
                v-for="opt in cellTypeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
          </template>
        </ElTableColumn>
        <ElTableColumn label="顺序" width="88" align="center">
          <template #default="{ row }">
            <ElInputNumber
              v-model="row.order"
              size="small"
              :min="1"
              :max="9999"
              controls-position="right"
              class="w-full"
              @change="resortColumns"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="宽度" width="90">
          <template #default="{ row }">
            <ElInputNumber
              v-model="row.width"
              size="small"
              :min="60"
              :max="400"
              controls-position="right"
              class="w-full"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="显示" width="70" align="center">
          <template #default="{ row }">
            <ElSwitch v-model="row.visible" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="120" align="center">
          <template #default="{ $index }">
            <ElButton
              link
              type="primary"
              size="small"
              :disabled="$index === 0"
              @click="moveColumn($index, -1)"
            >
              上
            </ElButton>
            <ElButton
              link
              type="primary"
              size="small"
              :disabled="$index >= columns.length - 1"
              @click="moveColumn($index, 1)"
            >
              下
            </ElButton>
            <ElButton
              link
              type="danger"
              size="small"
              @click="removeColumn($index)"
            >
              删
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="mb-2 font-medium">详情组装</div>
      <p class="mb-2 text-xs text-gray-500">
        先挂模块、拖胶囊排序；再点「编辑表单/表格」改字段或列。每个场景一份独立拷贝，改本场景不影响其他岗。
      </p>
      <DetailDesigner
        v-model:layouts="moduleLayoutRows"
        v-model:basic-inner="basicInnerConfig"
        v-model:houses-inner="housesInnerConfig"
        v-model:compensation-inner="compensationInnerConfig"
        v-model:rewards-inner="rewardsInnerConfig"
        v-model:population-inner="populationInnerConfig"
        v-model:custom-inners="customInnerMap"
      />

      <div class="mb-2 font-medium">工具栏动作（仅可勾选已实现）</div>
      <p class="mb-3 text-xs text-gray-500">
        新按钮需开发先在
        <code class="rounded bg-gray-100 px-1">actions.ts</code>
        注册 handler，此处才能勾选；不可自由发明动作码。
      </p>
      <div
        v-for="group in actionGroups"
        :key="group.key"
        class="mb-4 rounded-lg border border-gray-200/80 p-3"
      >
        <div class="mb-2 text-sm font-medium text-gray-700">
          {{ group.title }}
        </div>
        <ElCheckboxGroup v-model="selectedActionCodes">
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            <ElCheckbox
              v-for="act in group.items"
              :key="act.code"
              :value="act.code"
            >
              <span>{{ act.label }}</span>
              <span class="ml-1 text-xs text-gray-400">({{ act.code }})</span>
            </ElCheckbox>
          </div>
        </ElCheckboxGroup>
      </div>

      <div class="mb-2 mt-4 font-medium">差异化操作绑定（可选）</div>
      <p class="mb-3 text-xs text-gray-500">
        同一动作码在不同场景可绑不同接口 / 确认文案 / 成功提示 / 跳转 / 状态显隐。
        填写「接口」后优先走配置调用；不填则仍用动作库默认逻辑。
        「允许状态」：勾选行状态需全部命中，否则工具栏隐藏该按钮。
      </p>
      <ElTable :data="bindRows" border size="small" class="mb-4">
        <ElTableColumn label="动作" width="110" fixed>
          <template #default="{ row }">
            <div class="text-xs font-medium">{{ row.label }}</div>
            <div class="text-xs text-gray-400">{{ row.code }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="接口路径" min-width="160">
          <template #default="{ row }">
            <ElInput
              v-model="row.bind.api"
              size="small"
              placeholder="/biz/agreement/..."
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="方法" width="100">
          <template #default="{ row }">
            <ElSelect v-model="row.bind.method" size="small" class="w-full">
              <ElOption
                v-for="m in METHOD_OPTIONS"
                :key="m"
                :label="m"
                :value="m"
              />
            </ElSelect>
          </template>
        </ElTableColumn>
        <ElTableColumn label="确认文案" min-width="120">
          <template #default="{ row }">
            <ElInput
              v-model="row.bind.confirmText"
              size="small"
              placeholder="二次确认"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="成功提示" min-width="100">
          <template #default="{ row }">
            <ElInput
              v-model="row.bind.successMsg"
              size="small"
              placeholder="成功 Message"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="跳转" min-width="100">
          <template #default="{ row }">
            <ElInput
              v-model="row.bind.redirect"
              size="small"
              placeholder="path 或 detail"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="允许状态" min-width="160">
          <template #default="{ row }">
            <ElSelect
              v-model="row.bind.showWhenStatusIn"
              multiple
              clearable
              collapse-tags
              collapse-tags-tooltip
              size="small"
              class="w-full"
              placeholder="不限"
            >
              <ElOption
                v-for="s in STATUS_OPTIONS"
                :key="s"
                :label="s"
                :value="s"
              />
            </ElSelect>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <!-- 实体 / 列模板：编辑列 -->
    <template v-else>
      <div class="mb-2 mt-4 flex items-center justify-between">
        <div class="font-medium">表格字段</div>
        <ElButton size="small" type="primary" @click="addColumn">添加列</ElButton>
      </div>
      <ElTable :data="columns" border size="small" class="mb-4">
        <ElTableColumn label="字段名" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.field" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="列标题" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.title" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="类型" width="110">
          <template #default="{ row }">
            <ElSelect v-model="row.cellType" size="small" class="w-full">
              <ElOption
                v-for="opt in cellTypeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
          </template>
        </ElTableColumn>
        <ElTableColumn label="顺序" width="88" align="center">
          <template #default="{ row }">
            <ElInputNumber
              v-model="row.order"
              size="small"
              :min="1"
              :max="9999"
              controls-position="right"
              class="w-full"
              @change="resortColumns"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="宽度" width="100">
          <template #default="{ row }">
            <ElInputNumber
              v-model="row.width"
              size="small"
              :min="60"
              :max="400"
              controls-position="right"
              class="w-full"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="显示" width="70" align="center">
          <template #default="{ row }">
            <ElSwitch v-model="row.visible" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="120" align="center">
          <template #default="{ $index }">
            <ElButton
              link
              type="primary"
              size="small"
              :disabled="$index === 0"
              @click="moveColumn($index, -1)"
            >
              上
            </ElButton>
            <ElButton
              link
              type="primary"
              size="small"
              :disabled="$index >= columns.length - 1"
              @click="moveColumn($index, 1)"
            >
              下
            </ElButton>
            <ElButton
              link
              type="danger"
              size="small"
              @click="removeColumn($index)"
            >
              删
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="mb-2 mt-4 flex items-center justify-between">
        <div class="font-medium">字段权限规则</div>
        <ElButton size="small" type="primary" @click="addFieldRule">
          添加规则
        </ElButton>
      </div>
      <p class="mb-2 text-xs text-gray-500">
        配置可见/可编辑所需权限码（逗号分隔），如
        <code class="rounded bg-gray-100 px-1">Agree:Field:phone</code>
        。场景继承列模板规则；无权限则列表隐藏列、详情隐藏或只读。展示类型可配金额千分位、日期格式。
      </p>
      <ElTable :data="fieldRules" border size="small" class="mb-4">
        <ElTableColumn label="字段名" min-width="100">
          <template #default="{ row }">
            <ElInput v-model="row.field" size="small" placeholder="phone" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="强制隐藏" width="90" align="center">
          <template #default="{ row }">
            <ElSwitch v-model="row.hidden" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="可见权限码" min-width="140">
          <template #default="{ row }">
            <ElInput
              size="small"
              :model-value="codesToText(row.visibleCodes)"
              placeholder="Agree:Field:xxx"
              @update:model-value="
                (v: string) => (row.visibleCodes = textToCodes(v))
              "
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="可编辑权限码" min-width="140">
          <template #default="{ row }">
            <ElInput
              size="small"
              :model-value="codesToText(row.editableCodes)"
              placeholder="Agree:Field:xxx"
              @update:model-value="
                (v: string) => (row.editableCodes = textToCodes(v))
              "
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="展示类型" width="110">
          <template #default="{ row }">
            <ElSelect
              size="small"
              class="w-full"
              :model-value="ensureDisplayFormat(row).type || 'text'"
              @update:model-value="
                (v: string) => (ensureDisplayFormat(row).type = v as any)
              "
            >
              <ElOption label="文本" value="text" />
              <ElOption label="金额" value="money" />
              <ElOption label="日期" value="date" />
            </ElSelect>
          </template>
        </ElTableColumn>
        <ElTableColumn label="格式参数" min-width="160">
          <template #default="{ row }">
            <template v-if="ensureDisplayFormat(row).type === 'money'">
              <div class="flex flex-col gap-1">
                <ElInput
                  size="small"
                  :model-value="ensureDisplayFormat(row).prefix || ''"
                  placeholder="前缀 ¥"
                  @update:model-value="
                    (v: string) => (ensureDisplayFormat(row).prefix = v)
                  "
                />
                <ElInputNumber
                  size="small"
                  class="w-full"
                  :min="0"
                  :max="6"
                  controls-position="right"
                  :model-value="ensureDisplayFormat(row).decimals ?? 2"
                  @update:model-value="
                    (v: number | undefined) =>
                      (ensureDisplayFormat(row).decimals = v ?? 2)
                  "
                />
                <ElCheckbox
                  size="small"
                  :model-value="
                    ensureDisplayFormat(row).thousandSeparator !== false
                  "
                  @update:model-value="
                    (v: boolean | string | number) =>
                      (ensureDisplayFormat(row).thousandSeparator = !!v)
                  "
                >
                  千分位
                </ElCheckbox>
              </div>
            </template>
            <template v-else-if="ensureDisplayFormat(row).type === 'date'">
              <ElSelect
                size="small"
                class="w-full"
                :model-value="
                  ensureDisplayFormat(row).datePattern || 'YYYY-MM-DD'
                "
                @update:model-value="
                  (v: string) =>
                    (ensureDisplayFormat(row).datePattern = v as any)
                "
              >
                <ElOption label="YYYY-MM-DD" value="YYYY-MM-DD" />
                <ElOption label="YYYY年MM月DD日" value="YYYY年MM月DD日" />
              </ElSelect>
            </template>
            <span v-else class="text-xs text-gray-400">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="备注" min-width="100">
          <template #default="{ row }">
            <ElInput v-model="row.remark" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" align="center">
          <template #default="{ $index }">
            <ElButton
              link
              type="danger"
              size="small"
              @click="removeFieldRule($index)"
            >
              删
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="mb-2 flex items-center justify-between">
        <div class="font-medium">查询条件</div>
        <ElButton size="small" type="primary" @click="addQueryField">
          添加条件
        </ElButton>
      </div>
      <ElTable :data="queryFields" border size="small">
        <ElTableColumn label="字段名" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.field" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="标题" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.title" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="控件" width="120">
          <template #default="{ row }">
            <ElSelect v-model="row.component" size="small" class="w-full">
              <ElOption
                v-for="opt in queryCompOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" align="center">
          <template #default="{ $index }">
            <ElButton
              link
              type="danger"
              size="small"
              @click="removeQueryField($index)"
            >
              删
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </template>

    <!-- 配置回滚：每次保存会留下上一版快照 -->
    <div
      v-if="id"
      class="mt-6 rounded-lg border border-dashed border-amber-300/80 p-3"
    >
      <div class="mb-2 flex items-center justify-between">
        <div class="font-medium">配置历史 / 回滚</div>
        <ElButton size="small" :loading="historyLoading" @click="loadHistory">
          刷新历史
        </ElButton>
      </div>
      <p class="mb-3 text-xs text-gray-500">
        每次保存成功会自动保留上一版（最多 10 条）。回滚后当前内容也会进入历史，可再次回退。
      </p>
      <ElTable
        v-loading="historyLoading"
        :data="historyList"
        border
        size="small"
        max-height="220"
        empty-text="暂无历史（保存修改后会出现）"
      >
        <ElTableColumn prop="savedAt" label="保存时间" min-width="160" />
        <ElTableColumn prop="title" label="页面名称" min-width="120" />
        <ElTableColumn label="用途" width="100">
          <template #default="{ row }">
            {{ row.schemaKind || '—' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="列/按钮" width="100">
          <template #default="{ row }">
            {{ row.columnCount ?? 0 }} / {{ row.buttonCount ?? 0 }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }">
            <ElButton
              link
              type="warning"
              size="small"
              @click="onRollback(row.versionId)"
            >
              回滚
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <!-- 按角色验权限：列/按钮/模块是否可见（表格对照，不是页面截图） -->
    <ElCollapse v-model="previewCollapse" class="mt-6">
      <ElCollapseItem name="preview" title="按角色验权限（可选）">
      <p class="mb-3 text-xs text-gray-500">
        用角色权限码对照当前草稿：列表哪些列、哪些按钮、详情哪些模块会显示。不是页面长什么样的预览。
      </p>
      <div class="mb-3 flex flex-wrap items-end gap-3">
        <div class="min-w-[160px]">
          <div class="mb-1 text-xs text-gray-500">预览角色</div>
          <ElSelect v-model="previewRoleId" size="small" class="w-full" filterable>
            <ElOption
              v-for="r in roleOptions"
              :key="r.id"
              :label="r.name"
              :value="String(r.id)"
            />
          </ElSelect>
        </div>
        <div v-if="isScene" class="min-w-[140px]">
          <div class="mb-1 text-xs text-gray-500">模拟勾选行状态</div>
          <ElSelect
            v-model="previewStatus"
            size="small"
            class="w-full"
            clearable
            placeholder="不限"
          >
            <ElOption
              v-for="s in STATUS_OPTIONS"
              :key="s"
              :label="s"
              :value="s"
            />
          </ElSelect>
        </div>
        <ElButton
          type="primary"
          size="small"
          :loading="previewLoading"
          @click="runPreview"
        >
          生成预览
        </ElButton>
      </div>

      <ElAlert
        v-if="previewResult"
        class="mb-3"
        type="info"
        :closable="false"
        :title="`角色「${previewRoleName}」：可见列 ${previewResult.shownColumnCount} / ${previewResult.columns.length}，可见按钮 ${previewResult.shownButtonCount} / ${previewResult.buttons.length || 0}，可见模块 ${previewResult.shownModuleCount} / ${previewResult.modules.length || 0}`"
      />

      <template v-if="previewResult">
        <div class="mb-2 text-sm font-medium">列表列</div>
        <ElTable
          :data="previewResult.columns"
          border
          size="small"
          class="mb-4"
          max-height="220"
        >
          <ElTableColumn prop="title" label="列标题" min-width="100" />
          <ElTableColumn prop="field" label="字段" min-width="100" />
          <ElTableColumn label="结果" width="90" align="center">
            <template #default="{ row }">
              <ElTag :type="row.shown ? 'success' : 'info'" size="small">
                {{ row.shown ? '显示' : '隐藏' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="reason" label="说明" min-width="140" />
        </ElTable>

        <template v-if="isScene">
          <div class="mb-2 text-sm font-medium">工具栏按钮</div>
          <ElTable
            :data="previewResult.buttons"
            border
            size="small"
            class="mb-4"
            max-height="220"
          >
            <ElTableColumn prop="label" label="按钮" min-width="100" />
            <ElTableColumn prop="code" label="动作码" min-width="110" />
            <ElTableColumn label="结果" width="100" align="center">
              <template #default="{ row }">
                <ElTag
                  v-if="!row.shown"
                  type="info"
                  size="small"
                >
                  隐藏
                </ElTag>
                <ElTag
                  v-else-if="row.disabled"
                  type="warning"
                  size="small"
                >
                  禁用
                </ElTag>
                <ElTag v-else type="success" size="small">
                  可点
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="reason" label="说明" min-width="160" />
          </ElTable>

          <div class="mb-2 text-sm font-medium">详情模块</div>
          <ElTable
            :data="previewResult.modules"
            border
            size="small"
            class="mb-4"
            max-height="220"
          >
            <ElTableColumn prop="label" label="模块" min-width="100" />
            <ElTableColumn prop="key" label="标识" min-width="110" />
            <ElTableColumn prop="order" label="顺序" width="70" align="center" />
            <ElTableColumn prop="span" label="占比" width="70" align="center" />
            <ElTableColumn label="结果" width="90" align="center">
              <template #default="{ row }">
                <ElTag :type="row.shown ? 'success' : 'info'" size="small">
                  {{ row.shown ? '显示' : '隐藏' }}
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="reason" label="说明" min-width="160" />
          </ElTable>
        </template>

        <div
          v-if="previewResult.fields.length"
          class="mb-2 text-sm font-medium"
        >
          字段规则（详情/敏感项）
        </div>
        <ElTable
          v-if="previewResult.fields.length"
          :data="previewResult.fields"
          border
          size="small"
          max-height="220"
        >
          <ElTableColumn prop="field" label="字段" min-width="100" />
          <ElTableColumn prop="remark" label="备注" min-width="100" />
          <ElTableColumn prop="formatSample" label="展示样例" min-width="120" />
          <ElTableColumn label="可见" width="70" align="center">
            <template #default="{ row }">
              <ElTag :type="row.visible ? 'success' : 'info'" size="small">
                {{ row.visible ? '是' : '否' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="可编辑" width="80" align="center">
            <template #default="{ row }">
              <ElTag :type="row.editable ? 'success' : 'warning'" size="small">
                {{ row.editable ? '是' : '否' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="reason" label="说明" min-width="140" />
        </ElTable>
      </template>
      </ElCollapseItem>
    </ElCollapse>
  </Drawer>
</template>
