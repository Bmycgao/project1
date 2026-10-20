<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- The inspector intentionally edits the parent-owned reactive draft; change events record undo history. */
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
  WorkflowOptions,
} from './model';

import type { WorkflowButtonResource } from '#/api/system/workflow-button';

import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElDatePicker,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElOptionGroup,
  ElSelect,
  ElSwitch,
  ElTag,
} from 'element-plus';

import { getWorkflowButtonResources } from '#/api/system/workflow-button';

import {
  actionSources,
  actionTargets,
  bindingSources,
  bindingTargets,
  compatibleBindingTypes,
  modulesForNode,
  nodeConfigurationIssues,
  fieldsForNode as nodeFields,
  removeConfigurationIssues,
} from './configuration';
import {
  CATEGORIES,
  DATA_ACTION_KIND_LABELS,
  DATA_ACTION_KINDS,
  DATA_ACTION_POLICIES,
  DATA_ACTION_POLICY_LABELS,
  DATA_ACTION_WHEN_LABELS,
  DATA_ACTION_WHENS,
  effectiveWorkflowDetailViewId,
  NODE_LABELS,
  STANDARD_BUTTONS,
  WORKFLOW_FIELD_CATALOG,
  WORKFLOW_PERSON_FIELDS,
  workflowButtonAction,
  workflowButtonConfig,
  workflowNodeDetailMode,
  workflowNodeDetailViewId,
  workflowNodeSupplementFormId,
} from './model';

const props = defineProps<{
  buttons: { code: string; label: string }[];
  document: WorkflowDocument;
  edge?: WorkflowEdge;
  focusIssue?: { message: string; nodeId: string; sequence: number };
  node?: WorkflowNode;
  options: WorkflowOptions;
  optionsError: boolean;
  optionsLoaded?: boolean;
  readOnly?: boolean;
}>();
const emit = defineEmits<{
  duplicate: [];
  remove: [];
  retry: [];
  selectEdge: [id: string];
}>();
const resourcesReady = computed(
  () => props.optionsLoaded !== false && !props.optionsError,
);
const fieldKey = ref('');
const advancedDetailOpen = ref(false);
const activeNodeTab = ref<'basic' | 'buttons' | 'materials' | 'rules'>('basic');
const inspectorBody = ref<HTMLElement>();
const buttonRolesDetails = ref<HTMLDetailsElement>();
const nodeRolesDetails = ref<HTMLDetailsElement>();
const configurationProblems = ref<HTMLElement>();
const dataActionsDetails = ref<HTMLDetailsElement>();
const showAllModules = ref(false);
const selectedButtonAction = ref('');
const resources = ref<WorkflowButtonResource[]>([]);
async function loadResources() {
  try {
    resources.value = await getWorkflowButtonResources();
  } catch {
    resources.value = [];
  }
}
onMounted(() => void loadResources());
onActivated(() => void loadResources());
const unconfiguredButtons = computed(() =>
  resources.value.filter(
    (resource) =>
      resource.status === 1 &&
      !props.document.buttonCatalog?.some(
        (item) => (item.code || item.action) === resource.code,
      ),
  ),
);
function addButtonConfig() {
  const resource = unconfiguredButtons.value.find(
    (item) => item.code === selectedButtonAction.value,
  );
  if (!resource) return;
  const { status: _status, builtIn: _builtIn, ...snapshot } = resource;
  props.document.buttonCatalog ||= [];
  props.document.buttonCatalog.push(structuredClone(snapshot));
  selectedButtonAction.value = '';
}
function removeButtonConfig(code: string) {
  props.document.buttonCatalog = (props.document.buttonCatalog || []).filter(
    (item) => (item.code || item.action) !== code,
  );
}
function bindResources(codes: string[]) {
  if (!props.node) return;
  const builtin = props.node.buttons.filter(
    (code) =>
      STANDARD_BUTTONS.some((item) => item.code === code) &&
      !['recall', 'transfer'].includes(
        workflowButtonAction(props.document, code) || '',
      ),
  );
  const capabilityButtons = props.node.buttons.filter((code) =>
    ['recall', 'transfer'].includes(
      workflowButtonAction(props.document, code) || '',
    ),
  );
  props.node.buttons = [...builtin, ...codes, ...capabilityButtons];
  if (
    codes.some(
      (code) =>
        resources.value.find((item) => item.code === code)?.action ===
        'transfer',
    )
  )
    props.node.allowTransfer = true;
  if (
    codes.some(
      (code) =>
        resources.value.find((item) => item.code === code)?.action === 'recall',
    )
  )
    props.node.allowRecall = true;
  for (const code of codes) {
    const resource = resources.value.find(
      (item) => item.code === code && item.status === 1,
    );
    if (!resource) continue;
    const { status: _status, builtIn: _builtIn, ...snapshot } = resource;
    props.document.buttonCatalog ||= [];
    const index = props.document.buttonCatalog.findIndex(
      (item) => (item.code || item.action) === code,
    );
    if (index === -1)
      props.document.buttonCatalog.push(structuredClone(snapshot));
  }
}
function buttonResourcesFor(action: 'recall' | 'transfer') {
  return resources.value.filter(
    (item) =>
      item.status === 1 && item.action === action && item.code !== action,
  );
}
function boundButtonResource(action: 'recall' | 'transfer') {
  if (!props.node) return '';
  const code =
    props.node.buttons.find(
      (code) => workflowButtonAction(props.document, code) === action,
    ) || '';
  return code === action ? '' : code;
}
function setCapabilityButtonResource(
  action: 'recall' | 'transfer',
  code: unknown,
  preserveRoleRules = true,
) {
  if (!props.node) return;
  const nextCode = typeof code === 'string' ? code : '';
  const previousCodes = props.node.buttons.filter(
    (item) => workflowButtonAction(props.document, item) === action,
  );
  const previousRoleKey = previousCodes[0] || action;
  const allowedRoles = props.node.buttonRoleIds?.[previousRoleKey];
  const deniedRoles = props.node.buttonDeniedRoleIds?.[previousRoleKey];
  for (const key of new Set([...previousCodes, action])) {
    if (props.node.buttonRoleIds)
      Reflect.deleteProperty(props.node.buttonRoleIds, key);
    if (props.node.buttonDeniedRoleIds)
      Reflect.deleteProperty(props.node.buttonDeniedRoleIds, key);
  }
  props.node.buttons = props.node.buttons.filter(
    (item) => workflowButtonAction(props.document, item) !== action,
  );
  const nextRoleKey = nextCode || action;
  if (preserveRoleRules && allowedRoles?.length) {
    props.node.buttonRoleIds ||= {};
    props.node.buttonRoleIds[nextRoleKey] = allowedRoles;
  }
  if (preserveRoleRules && deniedRoles?.length) {
    props.node.buttonDeniedRoleIds ||= {};
    props.node.buttonDeniedRoleIds[nextRoleKey] = deniedRoles;
  }
  if (!nextCode) return;
  props.node.buttons.push(nextCode);
  const resource = resources.value.find(
    (item) => item.code === nextCode && item.status === 1,
  );
  if (!resource) return;
  const { status: _status, builtIn: _builtIn, ...snapshot } = resource;
  props.document.buttonCatalog ||= [];
  const index = props.document.buttonCatalog.findIndex(
    (item) => (item.code || item.action) === nextCode,
  );
  if (index === -1)
    props.document.buttonCatalog.push(structuredClone(snapshot));
}
watch(
  () => props.node?.id,
  () => {
    advancedDetailOpen.value = false;
    showAllModules.value = false;
    activeNodeTab.value = 'basic';
    inspectorBody.value?.scrollTo({ top: 0 });
  },
);
function selectNodeTab(tab: typeof activeNodeTab.value) {
  activeNodeTab.value = tab;
  inspectorBody.value?.scrollTo({ top: 0 });
}
watch(
  () => props.focusIssue?.sequence,
  () => {
    const issue = props.focusIssue;
    if (!issue || issue.nodeId !== props.node?.id) return;
    const message = issue.message;
    if (/字段取值|模块权限|字段权限|数据动作/.test(message)) {
      selectNodeTab(/数据动作/.test(message) ? 'rules' : 'materials');
      if (/数据动作/.test(message) && dataActionsDetails.value)
        dataActionsDetails.value.open = true;
      nextTick(() =>
        configurationProblems.value?.scrollIntoView?.({ block: 'nearest' }),
      );
    } else if (/按钮/.test(message)) {
      selectNodeTab('buttons');
      if (/角色|权限/.test(message) && buttonRolesDetails.value)
        buttonRolesDetails.value.open = true;
    } else if (/允许办理的角色|禁止办理的角色/.test(message)) {
      selectNodeTab('basic');
      if (nodeRolesDetails.value) nodeRolesDetails.value.open = true;
    } else if (/撤回|转办/.test(message)) selectNodeTab('buttons');
    else if (/数据动作|时限|提醒|驳回|流转|路径|连线/.test(message))
      selectNodeTab('rules');
    else if (/字段|模块|详情|页面|表单|模板/.test(message)) {
      selectNodeTab('materials');
      if (/详情|页面/.test(message)) advancedDetailOpen.value = true;
    } else selectNodeTab('basic');
  },
  { flush: 'post' },
);
const defaultDetailViewId = computed({
  get: () => props.document.defaultDetailViewId || '',
  set: (value: string) => {
    if (props.readOnly || !resourcesReady.value) return;
    if (value === (props.document.defaultDetailViewId || '')) return;
    props.document.defaultDetailViewId = value || '';
  },
});
function setStartRoles(ids: string[]) {
  props.document.startRoleIds = ids.length > 0 ? ids : undefined;
}
function setStartDeniedRoles(ids: string[]) {
  props.document.startDeniedRoleIds = ids.length > 0 ? ids : undefined;
}
function setHandleRoles(ids: string[]) {
  if (props.node) props.node.handleRoleIds = ids.length > 0 ? ids : undefined;
}
function setHandleDeniedRoles(ids: string[]) {
  if (props.node)
    props.node.handleDeniedRoleIds = ids.length > 0 ? ids : undefined;
}
function setButtonRoles(button: string, ids: string[]) {
  if (!props.node) return;
  props.node.buttonRoleIds ||= {};
  if (ids.length > 0) props.node.buttonRoleIds[button] = ids;
  else Reflect.deleteProperty(props.node.buttonRoleIds, button);
}
function setButtonDeniedRoles(button: string, ids: string[]) {
  if (!props.node) return;
  props.node.buttonDeniedRoleIds ||= {};
  if (ids.length > 0) props.node.buttonDeniedRoleIds[button] = ids;
  else Reflect.deleteProperty(props.node.buttonDeniedRoleIds, button);
}
const permissionButtons = computed(() => {
  const node = props.node;
  if (!node) return [];
  return [
    ...new Set([
      ...node.buttons.filter(
        (code) => !!workflowButtonAction(props.document, code),
      ),
      ...(node.allowTransfer &&
      !node.buttons.some(
        (code) => workflowButtonAction(props.document, code) === 'transfer',
      )
        ? ['transfer']
        : []),
      ...(node.allowRecall &&
      !node.buttons.some(
        (code) => workflowButtonAction(props.document, code) === 'recall',
      )
        ? ['recall']
        : []),
    ]),
  ];
});
const missingDefaultDetailView = computed(
  () =>
    !!defaultDetailViewId.value &&
    !props.options.views.some(
      (view) => view.type === 'page' && view.id === defaultDetailViewId.value,
    ),
);
/** 从当前详情页或补充表单的真实字段中追加权限，默认只读。 */
function addFieldAccess() {
  const key = fieldKey.value.trim();
  if (
    !props.node ||
    props.readOnly ||
    !resourcesReady.value ||
    !availablePermissionFields.value.some((field) => field.key === key) ||
    !/^[A-Za-z_][\w.]*$/.test(key) ||
    key
      .split('.')
      .some((p) => ['__proto__', 'constructor', 'prototype'].includes(p))
  )
    return;
  props.node.fieldAccess ||= {};
  props.node.fieldAccess[key] = 'readonly';
  fieldKey.value = '';
}
/** 开关转办；关闭转办时一并关掉转回 */
function setAllowTransfer(enabled: boolean | number | string) {
  if (!props.node) return;
  props.node.allowTransfer = !!enabled;
  if (!enabled) {
    props.node.transferReturn = false;
    setCapabilityButtonResource('transfer', '', false);
  }
}
function setAllowRecall(enabled: boolean | number | string) {
  if (!props.node) return;
  props.node.allowRecall = !!enabled;
  if (!enabled) setCapabilityButtonResource('recall', '', false);
}
/** 切换审批办理方式；选比例会签时补上默认 50% */
function setApproveMode(mode: WorkflowNode['approveMode']) {
  if (!props.node) return;
  props.node.approveMode = mode;
  if (mode === 'ratio' && !props.node.approveRatio)
    props.node.approveRatio = 50;
}
/** 追加一条空的数据动作，默认按节点类型选提交或通过 */
function addDataAction() {
  if (!props.node) return;
  props.node.dataActions ||= [];
  if (props.node.dataActions.length >= 20) return;
  props.node.dataActions.push({
    when: props.node.type === 'approve' ? 'pass' : 'submit',
    kind: 'set',
    policy: 'always',
    field: '',
    value: '',
    from: '',
  });
}
const human = computed(
  () => props.node && ['approve', 'cc', 'task'].includes(props.node.type),
);
/** 办理人策略对应的候选列表：角色 / 人员 / 部门 */
const candidates = computed(() => {
  switch (props.node?.assignee.type) {
    case 'departmentLeader': {
      return props.options.departments;
    }
    case 'role': {
      return props.options.roles;
    }
    case 'user': {
      return props.options.users;
    }
    default: {
      return [];
    }
  }
});
function migrateLegacyNodeBindings(node: WorkflowNode) {
  node.detailMode = workflowNodeDetailMode(node);
  node.detailViewId ||= workflowNodeDetailViewId(node);
  node.supplementFormId ||= workflowNodeSupplementFormId(node);
  node.form = { type: 'page', id: '' };
}
const detailMode = computed({
  get: () => (props.node ? workflowNodeDetailMode(props.node) : 'inherit'),
  set: (value: WorkflowNode['detailMode']) => {
    if (!props.node || !value || props.readOnly || !resourcesReady.value)
      return;
    migrateLegacyNodeBindings(props.node);
    props.node.detailMode = value;
  },
});
function resetToDefaultDetail() {
  if (!props.node || props.readOnly || !resourcesReady.value) return;
  detailMode.value = 'inherit';
  props.node.detailViewId = '';
}
const detailViewId = computed({
  get: () => (props.node ? workflowNodeDetailViewId(props.node) : ''),
  set: (value: string) => {
    if (!props.node || props.readOnly || !resourcesReady.value) return;
    migrateLegacyNodeBindings(props.node);
    props.node.detailViewId = value || '';
  },
});
const supplementFormId = computed({
  get: () => (props.node ? workflowNodeSupplementFormId(props.node) : ''),
  set: (value: string) => {
    if (!props.node || props.readOnly || !resourcesReady.value) return;
    migrateLegacyNodeBindings(props.node);
    props.node.supplementFormId = value || '';
  },
});
const bindingTargetFields = computed(() =>
  props.node ? bindingTargets(props.node, props.options) : [],
);
const bindingSourceFields = computed(() =>
  bindingSources(props.document, props.options),
);
function bindingSourcesFor(target: (typeof bindingTargetFields.value)[number]) {
  return bindingSourceFields.value.filter(
    (source) =>
      source.key !== target.key && compatibleBindingTypes(target, source),
  );
}
function setFieldBinding(target: string, source: string) {
  if (!props.node || props.readOnly || !resourcesReady.value) return;
  const next = { ...props.node.fieldBindings };
  if (source) next[target] = source;
  else Reflect.deleteProperty(next, target);
  props.node.fieldBindings = next;
}
const effectiveDetailViewId = computed(() =>
  props.node ? effectiveWorkflowDetailViewId(props.document, props.node) : '',
);
const effectiveDetailViewName = computed(
  () =>
    props.options.views.find(
      (view) => view.type === 'page' && view.id === effectiveDetailViewId.value,
    )?.name || '内置协议详情',
);
function fieldsForNode(candidate: WorkflowNode) {
  return nodeFields(props.document, candidate, props.options);
}
const availableModules = computed(() =>
  props.node ? modulesForNode(props.document, props.node, props.options) : [],
);
const configurationIssues = computed(() =>
  !props.readOnly && resourcesReady.value && props.node
    ? nodeConfigurationIssues(props.document, props.node, props.options)
    : [],
);
function clearInvalidConfiguration(
  kind?: (typeof configurationIssues.value)[number]['kind'],
  key?: string,
) {
  if (!props.node || props.readOnly || !resourcesReady.value) return;
  removeConfigurationIssues(
    props.node,
    configurationIssues.value.filter(
      (issue) =>
        (!kind || issue.kind === kind) &&
        (key === undefined || issue.key === key),
    ),
  );
}
function repairConfiguration(
  kind: (typeof configurationIssues.value)[number]['kind'],
) {
  selectNodeTab(kind === 'dataAction' ? 'rules' : 'materials');
  if (kind === 'dataAction' && dataActionsDetails.value)
    dataActionsDetails.value.open = true;
}
const overriddenModules = computed(() =>
  availableModules.value.filter((module) => {
    const value = props.node?.moduleAccess?.[module.key];
    return value && value !== 'inherit';
  }),
);
const displayedModules = computed(() =>
  showAllModules.value ? availableModules.value : overriddenModules.value,
);
const staleModules = computed(() =>
  configurationIssues.value
    .filter((issue) => issue.kind === 'moduleAccess')
    .map((issue) => issue.key),
);
const modulePreview = computed(() =>
  availableModules.value.map((module) => {
    const configured = props.node?.moduleAccess?.[module.key] || 'inherit';
    const effective =
      configured === 'inherit'
        ? props.node?.type === 'approve'
          ? 'readonly'
          : 'edit'
        : configured;
    return {
      ...module,
      effective,
      status:
        effective === 'hidden'
          ? '不显示'
          : effective === 'readonly'
            ? '显示 · 只读'
            : '显示 · 可编辑',
    };
  }),
);
function setModuleAccess(key: string, value: unknown) {
  if (!props.node || props.readOnly || !resourcesReady.value) return;
  const next = { ...props.node.moduleAccess };
  if (value === 'inherit') Reflect.deleteProperty(next, key);
  else next[key] = value as 'edit' | 'hidden' | 'readonly';
  props.node.moduleAccess = next;
}
const missingDetailView = computed(
  () =>
    detailMode.value !== 'formOnly' &&
    !!effectiveDetailViewId.value &&
    !props.options.views.some(
      (v) => v.id === effectiveDetailViewId.value && v.type === 'page',
    ),
);
const missingSupplementForm = computed(
  () =>
    !!supplementFormId.value &&
    !props.options.views.some(
      (v) => v.id === supplementFormId.value && v.type === 'form',
    ),
);
const availablePermissionFields = computed(() =>
  props.node ? fieldsForNode(props.node) : [],
);
const permissionFieldGroups = computed(() => [
  ...new Set(availablePermissionFields.value.map((item) => item.group)),
]);
const staleFieldAccess = computed(() =>
  configurationIssues.value
    .filter((issue) => issue.kind === 'fieldAccess')
    .map((issue) => issue.key),
);
const missingAssignees = computed(
  () =>
    props.node?.assignee.ids.filter(
      (id) => !candidates.value.some((c) => c.id === id),
    ) || [],
);
const outgoing = computed(() =>
  props.document.edges.filter((e) => e.source === props.node?.id),
);
/** 数据动作目标只能写当前节点真实存在、非表格且已接入持久化的字段。 */
const dataActionTargetFields = computed(() =>
  props.node ? actionTargets(props.document, props.node, props.options) : [],
);
const dataActionTargetGroups = computed(() => [
  ...new Set(dataActionTargetFields.value.map((item) => item.group)),
]);
/** 来源可读取协议基础数据，以及流程中任一节点已经正式定义的补充字段。 */
const dataActionSourceFields = computed(() =>
  actionSources(props.document, props.options),
);
const dataActionSourceGroups = computed(() => [
  ...new Set(dataActionSourceFields.value.map((item) => item.group)),
]);
const staleDataActions = computed(() =>
  configurationIssues.value.filter((issue) => issue.kind === 'dataAction'),
);
function dataActionTarget(key: string) {
  return dataActionTargetFields.value.find((field) => field.key === key);
}
function resetDataActionValue(
  action: NonNullable<WorkflowNode['dataActions']>[number],
) {
  action.value = '';
}
function setDataActionWhen(
  action: NonNullable<WorkflowNode['dataActions']>[number],
  when: unknown,
) {
  action.when = when as typeof action.when;
  if (action.when !== 'arrive' && action.policy === 'firstArrival')
    action.policy = 'always';
}
function setDataActionPolicy(
  action: NonNullable<WorkflowNode['dataActions']>[number],
  policy: unknown,
) {
  action.policy = policy as NonNullable<typeof action.policy>;
}
/** 字段权限行展示名 */
function fieldAccessLabel(key: string) {
  return (
    availablePermissionFields.value.find((item) => item.key === key)?.label ||
    WORKFLOW_FIELD_CATALOG.find((item) => item.key === key)?.label ||
    key
  );
}
</script>

<template>
  <aside class="inspector">
    <div class="inspector-title">
      <div class="inspector-title-main">
        <span>{{
          node
            ? `${NODE_LABELS[node.type]}节点`
            : edge
              ? '连线设置'
              : '流程设置'
        }}</span>
        <b>{{
          node
            ? node.name || '未命名节点'
            : edge
              ? edge.label || '未命名连线'
              : document.name
        }}</b>
      </div>
      <ElTag
        v-if="node"
        size="small"
        effect="plain"
        :type="readOnly ? 'info' : 'success'"
      >
        {{ readOnly ? '只读' : '配置中' }}
</ElTag><ElTag v-else-if="edge" size="small" effect="plain">
        {{ edge.type === 'reject' ? '驳回路径' : '流转路径' }}
      </ElTag>
    </div>
    <div ref="inspectorBody" class="inspector-body">
      <ElAlert
        v-if="optionsError"
        type="warning"
        :closable="false"
        title="可选资源加载失败，已保存的绑定仍保留。"
      >
        <ElButton link type="primary" @click="emit('retry')">
          重新加载
        </ElButton>
      </ElAlert>
      <div
        v-if="configurationIssues.length"
        ref="configurationProblems"
        class="configuration-problems"
        role="status"
      >
        <ElAlert
          :title="`本节点有 ${configurationIssues.length} 项失效配置`"
          type="warning"
          :closable="false"
          show-icon
        >
          <p>
            切换页面或表单会保留原有规则。有效规则继续使用；失效项请重新配置或明确移除后再发布。
          </p>
          <div
            v-for="issue in configurationIssues"
            :key="`${issue.kind}:${issue.key}`"
            class="configuration-problem"
          >
            <p>{{ issue.reason }}</p>
            <ElButton
              link
              type="primary"
              @click="repairConfiguration(issue.kind)"
            >
              前往配置
            </ElButton>
            <ElButton
              link
              type="danger"
              @click="clearInvalidConfiguration(issue.kind, issue.key)"
            >
              移除此项
            </ElButton>
          </div>
          <ElButton
            type="warning"
            plain
            size="small"
            @click="clearInvalidConfiguration()"
          >
            移除本节点全部失效配置
          </ElButton>
        </ElAlert>
      </div>
      <ElForm
        v-if="node"
        label-position="top"
        :disabled="readOnly"
        size="small"
        @submit.prevent
      >
        <nav
          v-if="node.type === 'task' || node.type === 'approve'"
          class="node-tabs"
          aria-label="节点属性分组"
        >
          <button
            type="button"
            :aria-pressed="activeNodeTab === 'basic'"
            :class="{ active: activeNodeTab === 'basic' }"
            @click="selectNodeTab('basic')"
          >
            基础
          </button>
          <button
            type="button"
            :aria-pressed="activeNodeTab === 'materials'"
            :class="{ active: activeNodeTab === 'materials' }"
            @click="selectNodeTab('materials')"
          >
            办理资料
          </button>
          <button
            type="button"
            :aria-pressed="activeNodeTab === 'buttons'"
            :class="{ active: activeNodeTab === 'buttons' }"
            @click="selectNodeTab('buttons')"
          >
            操作权限
          </button>
          <button
            type="button"
            :aria-pressed="activeNodeTab === 'rules'"
            :class="{ active: activeNodeTab === 'rules' }"
            @click="selectNodeTab('rules')"
          >
            流转规则
          </button>
        </nav>
        <div v-if="human" class="tab-intro">
          {{
            activeNodeTab === 'basic'
              ? '设置节点名称、办理人以及办理方式。'
              : activeNodeTab === 'materials'
                ? '决定办理人看到哪些资料，以及哪些内容可以编辑。'
                : activeNodeTab === 'buttons'
                  ? '决定办理人可以执行哪些操作；转办和撤回在这里统一启用。'
                  : '设置通过、驳回后的路径，以及少用的自动动作和时限规则。'
          }}
        </div>
        <div v-show="!human || activeNodeTab === 'basic'">
          <ElFormItem label="节点名称" required>
            <ElInput v-model="node.name" maxlength="60" />
          </ElFormItem>
          <ElFormItem label="节点编码" required>
            <ElInput v-model="node.code" maxlength="80" />
            <div class="help">流程内唯一，建议使用 N_序号。</div>
          </ElFormItem>
          <ElFormItem label="说明">
            <ElInput
              v-model="node.description"
              type="textarea"
              :rows="2"
              maxlength="500"
            />
          </ElFormItem>
        </div>
        <template v-if="human">
          <div v-show="activeNodeTab === 'basic'">
            <div class="section-title">
              {{ node.type === 'cc' ? '抄送人' : '办理人' }}
            </div>
            <ElFormItem
              :label="node.type === 'cc' ? '抄送人策略' : '办理人策略'"
              required
            >
              <ElSelect
                v-model="node.assignee.type"
                @change="
                  node.assignee.ids = [];
                  node.assignee.field = '';
                "
              >
                <ElOption label="指定角色" value="role" /><ElOption
                  label="指定人员"
                  value="user"
                /><ElOption
                  label="指定部门负责人"
                  value="departmentLeader"
                /><ElOption label="发起人本人" value="initiator" /><ElOption
                  label="表单字段取人"
                  value="field"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem
              v-if="
                ['role', 'user', 'departmentLeader'].includes(
                  node.assignee.type,
                )
              "
              :label="
                node.assignee.type === 'departmentLeader'
                  ? '负责部门'
                  : '候选范围'
              "
              required
            >
              <ElSelect
                v-model="node.assignee.ids"
                multiple
                filterable
                :disabled="!resourcesReady"
                :placeholder="
                  node.assignee.type === 'departmentLeader'
                    ? '选择要取负责人的部门'
                    : '搜索并选择'
                "
                style="width: 100%"
              >
                <ElOption
                  v-for="candidate in candidates"
                  :key="candidate.id"
                  :label="candidate.name"
                  :value="candidate.id"
                />
                <ElOption
                  v-for="id in missingAssignees"
                  :key="id"
                  :label="`已失效或不可用：${id}`"
                  :value="id"
                  disabled
                />
              </ElSelect>
              <div
                v-if="missingAssignees.length && resourcesReady"
                class="warning"
              >
                部分候选资源已失效，请重新选择。
              </div>
              <div
                v-if="node.assignee.type === 'departmentLeader'"
                class="help"
              >
                勾选部门后，办理时按组织数据解析该部门负责人；本部门未配负责人则沿上级部门上溯。负责人须具备流程办理权限。
              </div>
            </ElFormItem>
            <ElFormItem
              v-if="node.assignee.type === 'field'"
              label="人员字段"
              required
            >
              <ElSelect
                v-model="node.assignee.field"
                placeholder="选择协议上的人员字段"
                style="width: 100%"
              >
                <ElOption
                  v-for="item in WORKFLOW_PERSON_FIELDS"
                  :key="item.key"
                  :label="item.label"
                  :value="item.key"
                />
              </ElSelect>
              <div class="help">
                运行时读取协议上该字段的用户
                ID，待办落在这些有办理权限的人身上。多人用逗号或顿号分隔。字段为空或人员无效时，本次提交回滚。
              </div>
            </ElFormItem>
            <ElFormItem v-if="node.type === 'approve'" label="办理方式">
              <ElSelect
                :model-value="node.approveMode || 'any'"
                @update:model-value="setApproveMode($event)"
              >
                <ElOption label="任一人通过即可" value="any" /><ElOption
                  label="会签（全部通过）"
                  value="all"
                /><ElOption label="依次审批" value="sequential" /><ElOption
                  label="比例会签"
                  value="ratio"
                />
              </ElSelect>
              <ElInputNumber
                v-if="node.approveMode === 'ratio'"
                v-model="node.approveRatio"
                :min="1"
                :max="100"
                :step="1"
                :precision="0"
                style="width: 100%; margin-top: 8px"
              />
              <div class="help">
                {{
                  node.approveMode === 'all'
                    ? '会签时每位候选人各有一笔待办，全部通过才进入下一节点；任一人驳回即按驳回路径退回，其余会签待办作废。'
                    : node.approveMode === 'sequential'
                      ? '按候选名单顺序一人办理，上一人通过后下一人才出待办。指定人员按勾选顺序；角色按组织用户顺序。任一人驳回则整单退回，后面的人不再出待办。'
                      : node.approveMode === 'ratio'
                        ? '每人各有一笔待办。通过人数达到该百分比（向上取整）即进入下一节点，未办理的待办作废。例如 3 人、50% 需要 2 人通过。任一人驳回则整单退回。'
                        : '任一名候选人通过即可进入下一节点。'
                }}
              </div>
            </ElFormItem>
            <ElAlert
              v-if="node.type === 'cc'"
              type="info"
              :closable="false"
              title="到达本节点后立即通知抄送人，不产生待办，流程沿通过连线继续。被抄送人可在「抄送给我」中查看。"
            />
            <details
              v-if="node.type !== 'cc'"
              :key="`${node.id}:node-roles`"
              ref="nodeRolesDetails"
              class="inspector-details"
            >
              <summary>
                进一步限制办理范围<span>{{
                  (node.handleRoleIds?.length || 0) +
                  (node.handleDeniedRoleIds?.length || 0)
                    ? `已配置 ${(node.handleRoleIds?.length || 0) + (node.handleDeniedRoleIds?.length || 0)} 项`
                    : '未配置'
                }}</span>
              </summary>
              <p class="help advanced-help">
                通常只需配置办理人策略。这里用于在候选办理人基础上进一步按角色收窄范围。
              </p>
              <ElFormItem label="仅允许以下角色办理">
                <ElSelect
                  :model-value="node.handleRoleIds || []"
                  multiple
                  filterable
                  clearable
                  :disabled="!resourcesReady"
                  placeholder="留空表示不额外限制"
                  style="width: 100%"
                  @update:model-value="setHandleRoles($event)"
                >
                  <ElOption
                    v-for="role in options.roles"
                    :key="role.id"
                    :label="role.name"
                    :value="role.id"
                  />
                </ElSelect>
                <div class="help">
                  候选办理人还需拥有这里选择的任一角色；留空时只按办理人策略和全局权限判断。
                </div>
              </ElFormItem>
              <ElFormItem label="禁止以下角色办理">
                <ElSelect
                  :model-value="node.handleDeniedRoleIds || []"
                  multiple
                  filterable
                  clearable
                  :disabled="!resourcesReady"
                  placeholder="留空表示不额外禁止"
                  style="width: 100%"
                  @update:model-value="setHandleDeniedRoles($event)"
                >
                  <ElOption
                    v-for="role in options.roles"
                    :key="role.id"
                    :label="role.name"
                    :value="role.id"
                  />
                </ElSelect>
                <div class="help">
                  用户同时命中允许和禁止角色时，以禁止为准。
                </div>
              </ElFormItem>
            </details>
          </div>
          <template v-if="node.type !== 'cc'">
            <div v-show="activeNodeTab === 'materials'">
              <div class="section-title">页面与表单</div>
              <ElFormItem label="业务详情">
                <div class="detail-source-summary">
                  <ElTag
                    size="small"
                    effect="plain"
                    :type="detailMode === 'inherit' ? 'success' : 'warning'"
                  >
                    {{
                      detailMode === 'inherit'
                        ? '使用流程默认页面'
                        : detailMode === 'override'
                          ? '已调整当前节点页面'
                          : '使用独立办理表单'
                    }}
                  </ElTag>
                  <span v-if="detailMode !== 'formOnly'">
                    {{ effectiveDetailViewName }}
                  </span>
                  <span v-else>不显示协议详情</span>
                </div>
                <div class="help">
                  {{
                    detailMode === 'formOnly'
                      ? '当前节点只提交节点表单数据，不读取或修改协议主体。'
                      : '数据始终来自当前流程绑定的同一条协议；详情页只决定布局，节点权限决定可编辑、只读或隐藏。'
                  }}
                </div>
              </ElFormItem>
              <ElAlert
                v-if="missingDetailView && resourcesReady"
                type="warning"
                :closable="false"
                :title="
                  detailMode === 'override'
                    ? '当前节点使用的页面已失效，请在高级页面设置中重新选择。'
                    : '流程默认办理详情已失效，请到流程属性中重新选择。'
                "
              />
              <ElFormItem
                :label="
                  detailMode === 'formOnly' ? '独立办理表单' : '追加办理信息'
                "
                :required="detailMode === 'formOnly'"
              >
                <ElSelect
                  v-model="supplementFormId"
                  clearable
                  filterable
                  :disabled="!resourcesReady"
                  :placeholder="
                    detailMode === 'formOnly'
                      ? '请选择办理表单'
                      : '可选；追加在业务详情下方'
                  "
                  style="width: 100%"
                >
                  <ElOption
                    v-for="view in options.views.filter(
                      (v) => v.type === 'form',
                    )"
                    :key="view.id"
                    :value="view.id"
                    :label="view.name"
                  />
                  <ElOption
                    v-if="missingSupplementForm"
                    :value="supplementFormId"
                    :label="`已失效或不可用：${supplementFormId}`"
                    disabled
                  />
                </ElSelect>
                <div
                  v-if="missingSupplementForm && resourcesReady"
                  class="warning"
                >
                  节点表单已失效，请重新选择。
                </div>
                <div v-else class="help">
                  {{
                    detailMode === 'formOnly'
                      ? '当前节点只显示并提交此表单，字段保存为流程扩展数据。'
                      : '可选。用于增加当前节点需要查看或填写的信息，保存在流程扩展数据中，不替换原有业务资料。'
                  }}
                </div>
              </ElFormItem>
              <div
                v-if="
                  bindingTargetFields.length ||
                  Object.keys(node.fieldBindings || {}).length
                "
                class="node-module-access"
              >
                <div class="section-title">节点表单 · 已有字段取值</div>
                <p class="help">
                  可把此表单字段绑定到协议头或其他节点已填写的字段。绑定后只读展示，来源尚未填写时显示为空；不计算汇总，也不修改来源数据。发布新版本后对新实例生效。
                </p>
                <div
                  v-for="field in bindingTargetFields"
                  :key="field.key"
                  class="module-access-row"
                >
                  <span>{{ field.label }}</span>
                  <ElSelect
                    :model-value="node.fieldBindings?.[field.key] || ''"
                    :disabled="readOnly || !resourcesReady"
                    placeholder="本字段独立填写"
                    style="flex: 1"
                    @update:model-value="
                      setFieldBinding(field.key, String($event))
                    "
                  >
                    <ElOption value="" label="本字段独立填写" />
                    <ElOption
                      v-for="source in bindingSourcesFor(field)"
                      :key="source.key"
                      :value="source.key"
                      :label="`${source.label}（${source.key}）`"
                    />
                    <ElOption
                      v-if="
                        node.fieldBindings?.[field.key] &&
                        !bindingSourcesFor(field).some(
                          (source) =>
                            source.key === node?.fieldBindings?.[field.key],
                        )
                      "
                      :value="node.fieldBindings[field.key]!"
                      :label="`已失效或类型不匹配：${node.fieldBindings[field.key]}`"
                      disabled
                    />
                  </ElSelect>
                </div>
              </div>
              <div v-if="availableModules.length" class="node-module-access">
                <div class="section-title">页面内容与编辑权限</div>
                <p class="help">
                  继承：填报可编辑、审批只读。模块隐藏不删除资料；模块明确只读时，字段不能放宽。角色与模板限制始终生效。
                </p>
                <div class="module-access-toolbar">
                  <span>{{
                    overriddenModules.length
                      ? `已调整 ${overriddenModules.length} 个模块`
                      : '全部继承默认权限'
                  }}</span>
                  <ElButton
                    link
                    type="primary"
                    @click="showAllModules = !showAllModules"
                  >
                    {{ showAllModules ? '只看已调整' : '修改模块权限' }}
                  </ElButton>
                </div>
                <div
                  v-for="module in displayedModules"
                  :key="module.key"
                  class="module-access-row"
                >
                  <span>{{ module.label }}</span>
                  <ElSelect
                    :model-value="node.moduleAccess?.[module.key] || 'inherit'"
                    :aria-label="`${module.label}访问方式`"
                    @change="setModuleAccess(module.key, $event)"
                  >
                    <ElOption value="inherit" label="继承" /><ElOption
                      value="hidden"
                      label="隐藏"
                    />
                    <ElOption value="readonly" label="只读" /><ElOption
                      value="edit"
                      label="可编辑"
                    />
                  </ElSelect>
                </div>
                <details
                  :key="`${node.id}:module-preview`"
                  class="module-preview"
                >
                  <summary class="module-preview-title">
                    查看节点模块配置预览
                  </summary>
                  <p class="help">
                    此处未按办理人角色过滤；实际办理页还需具备对应模块授权。
                  </p>
                  <div
                    v-for="module in modulePreview"
                    :key="`preview:${module.key}`"
                    class="module-preview-row"
                    :class="{ 'is-hidden': module.effective === 'hidden' }"
                  >
                    <span>{{ module.label }}</span>
                    <ElTag
                      size="small"
                      effect="plain"
                      :type="
                        module.effective === 'hidden'
                          ? 'info'
                          : module.effective === 'readonly'
                            ? 'warning'
                            : 'success'
                      "
                    >
                      {{ module.status }}
                    </ElTag>
                  </div>
                </details>
              </div>
              <ElAlert
                v-if="staleModules.length"
                type="warning"
                :closable="false"
                :title="`以下模块已不在视图内，请重新绑定视图或移除旧规则：${staleModules.join('、')}`"
              >
                <ElButton
                  :disabled="readOnly || !resourcesReady"
                  link
                  @click="clearInvalidConfiguration('moduleAccess')"
                >
                  移除失效模块规则
                </ElButton>
              </ElAlert>
              <div class="advanced-detail-entry">
                <ElButton
                  link
                  type="primary"
                  @click="advancedDetailOpen = !advancedDetailOpen"
                >
                  {{ advancedDetailOpen ? '收起高级页面设置' : '高级页面设置' }}
                </ElButton>
                <ElTag
                  v-if="detailMode !== 'inherit'"
                  size="small"
                  type="warning"
                  effect="plain"
                >
                  当前节点已启用
                </ElTag>
              </div>
              <div v-if="advancedDetailOpen" class="advanced-detail-panel">
                <ElAlert
                  type="warning"
                  :closable="false"
                  title="通常无需修改。调整当前节点页面只改变内容布局，数据仍来自同一条业务记录；独立办理表单适用于不需要查看原业务资料的特殊节点。"
                />
                <ElFormItem label="节点页面模式">
                  <ElSelect
                    v-model="detailMode"
                    :disabled="!resourcesReady"
                    style="width: 100%"
                  >
                    <ElOption
                      value="inherit"
                      label="使用流程默认页面（推荐）"
                    />
                    <ElOption value="override" label="调整当前节点页面" />
                    <ElOption
                      value="formOnly"
                      label="使用独立办理表单（特殊节点）"
                    />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem
                  v-if="detailMode === 'override'"
                  label="当前节点使用的页面"
                  required
                >
                  <ElSelect
                    v-model="detailViewId"
                    filterable
                    :disabled="!resourcesReady"
                    placeholder="选择同一协议数据的其他布局"
                    style="width: 100%"
                  >
                    <ElOption
                      v-for="view in options.views.filter(
                        (v) => v.type === 'page',
                      )"
                      :key="view.id"
                      :value="view.id"
                      :label="view.name"
                    />
                    <ElOption
                      v-if="missingDetailView"
                      :value="detailViewId"
                      :label="`已失效或不可用：${detailViewId}`"
                      disabled
                    />
                  </ElSelect>
                  <div class="help">
                    数据源不会随页面改变，仍然是流程绑定的当前协议。
                  </div>
                  <div
                    v-if="missingDetailView && resourcesReady"
                    class="warning"
                  >
                    当前节点使用的页面已失效，请重新选择。
                  </div>
                </ElFormItem>
                <div v-if="detailMode === 'formOnly'" class="help">
                  请在上方“独立办理表单”中选择必填模板；该节点不会展示协议详情。
                </div>
                <ElButton
                  v-if="detailMode !== 'inherit'"
                  plain
                  size="small"
                  :disabled="!resourcesReady"
                  @click="resetToDefaultDetail"
                >
                  恢复使用流程默认页面
                </ElButton>
              </div>
            </div>
            <div v-show="activeNodeTab === 'buttons'">
              <div class="section-title section-title-first">常用操作</div>
              <ElFormItem label="显示以下操作">
                <p class="help">
                  勾选后，办理人会在当前节点看到对应按钮。按钮顺序可在下方调整。
                </p>
                <ElCheckboxGroup
                  v-model="node.buttons"
                  class="standard-buttons"
                >
                  <ElCheckbox
                    v-for="button in STANDARD_BUTTONS.filter(
                      (item) => item.code !== 'recall',
                    )"
                    :key="button.code"
                    :value="button.code"
                  >
                    {{ workflowButtonConfig(document, button.code).label }}
                  </ElCheckbox>
                </ElCheckboxGroup>
                <ElSelect
                  v-if="
                    resources.some(
                      (resource) =>
                        resource.status === 1 &&
                        !['recall', 'transfer'].includes(resource.action) &&
                        !STANDARD_BUTTONS.some(
                          (item) => item.code === resource.code,
                        ),
                    ) || buttons.length
                  "
                  :model-value="
                    node.buttons.filter(
                      (b) =>
                        !STANDARD_BUTTONS.some((s) => s.code === b) &&
                        !['recall', 'transfer'].includes(
                          workflowButtonAction(document, b) || '',
                        ),
                    )
                  "
                  multiple
                  filterable
                  collapse-tags
                  placeholder="从按钮管理选择可复用按钮"
                  style="width: 100%; margin-top: 8px"
                  @update:model-value="bindResources($event)"
                >
                  <ElOption
                    v-for="resource in resources.filter(
                      (item) =>
                        item.status === 1 &&
                        !['recall', 'transfer'].includes(item.action) &&
                        !STANDARD_BUTTONS.some(
                          (standard) => standard.code === item.code,
                        ),
                    )"
                    :key="resource.code"
                    :value="resource.code"
                    :label="`${resource.label}（${resource.code} · ${resource.action}）`"
                  />
                  <ElOption
                    v-for="button in buttons"
                    :key="button.code"
                    :value="button.code"
                    :label="button.label"
                  />
                </ElSelect>
              </ElFormItem>
              <div
                v-if="
                  node.buttons.some(
                    (code) =>
                      !['recall', 'transfer'].includes(
                        workflowButtonAction(document, code) || '',
                      ),
                  )
                "
                class="button-order"
              >
                <div
                  v-for="(button, i) in node.buttons.filter(
                    (code) =>
                      !['recall', 'transfer'].includes(
                        workflowButtonAction(document, code) || '',
                      ),
                  )"
                  :key="button"
                >
                  <span>{{
                    (workflowButtonAction(document, button)
                      ? workflowButtonConfig(document, button).label
                      : '') ||
                    buttons.find((b) => b.code === button)?.label ||
                    button
                  }}</span><ElButton
                    link
                    :disabled="i === 0"
                    @click="
                      node.buttons.splice(
                        node.buttons.indexOf(button) - 1,
                        0,
                        node.buttons.splice(
                          node.buttons.indexOf(button),
                          1,
                        )[0]!,
                      )
                    "
                  >
                    上移
</ElButton><ElButton
                    link
                    :disabled="
                      i ===
                      node.buttons.filter(
                        (code) =>
                          !['recall', 'transfer'].includes(
                            workflowButtonAction(document, code) || '',
                          ),
                      ).length -
                        1
                    "
                    @click="
                      node.buttons.splice(
                        node.buttons.indexOf(button) + 1,
                        0,
                        node.buttons.splice(
                          node.buttons.indexOf(button),
                          1,
                        )[0]!,
                      )
                    "
                  >
                    下移
                  </ElButton>
                </div>
              </div>
              <div class="section-title">特殊操作</div>
              <section
                class="capability-card"
                :class="{ enabled: node.allowRecall }"
              >
                <div class="capability-heading">
                  <div>
                    <b>撤回</b>
                    <p>提交到下一节点后，在对方尚未办理时收回任务。</p>
                  </div>
                  <div class="capability-switch">
                    <span>{{ node.allowRecall ? '已开启' : '已关闭' }}</span><ElSwitch
                      :model-value="!!node.allowRecall"
                      @update:model-value="setAllowRecall"
                    />
                  </div>
                </div>
                <div v-if="node.allowRecall" class="capability-body">
                  <ElFormItem label="自定义撤回按钮">
                    <ElSelect
                      :model-value="boundButtonResource('recall')"
                      clearable
                      placeholder="使用系统默认按钮"
                      @update:model-value="
                        setCapabilityButtonResource('recall', $event)
                      "
                    >
                      <ElOption
                        v-for="resource in buttonResourcesFor('recall')"
                        :key="resource.code"
                        :label="`${resource.label}（${resource.code}）`"
                        :value="resource.code"
                      />
                    </ElSelect>
                    <div class="help">
                      不选择时使用系统默认的“撤回”按钮；这里只改变名称、样式和显示条件。
                    </div>
                  </ElFormItem>
                </div>
              </section>
              <section
                class="capability-card"
                :class="{ enabled: node.allowTransfer }"
              >
                <div class="capability-heading">
                  <div>
                    <b>转办</b>
                    <p>将当前待办转给其他具有流程办理权限的人员。</p>
                  </div>
                  <div class="capability-switch">
                    <span>{{ node.allowTransfer ? '已开启' : '已关闭' }}</span><ElSwitch
                      :model-value="!!node.allowTransfer"
                      @update:model-value="setAllowTransfer"
                    />
                  </div>
                </div>
                <div v-if="node.allowTransfer" class="capability-body">
                  <ElFormItem label="自定义转办按钮">
                    <ElSelect
                      :model-value="boundButtonResource('transfer')"
                      clearable
                      placeholder="使用系统默认按钮"
                      @update:model-value="
                        setCapabilityButtonResource('transfer', $event)
                      "
                    >
                      <ElOption
                        v-for="resource in buttonResourcesFor('transfer')"
                        :key="resource.code"
                        :label="`${resource.label}（${resource.code}）`"
                        :value="resource.code"
                      />
                    </ElSelect>
                    <div class="help">
                      不选择时使用系统默认的“转办”按钮；这里只改变名称、样式和显示条件。
                    </div>
                  </ElFormItem>
                  <ElFormItem label="对方办完后返回给原办理人">
                    <ElSwitch
                      :model-value="!!node.transferReturn"
                      @update:model-value="node.transferReturn = !!$event"
                    />
                    <div class="help">
                      开启后，对方提交或通过后，任务回到转办人继续办理；驳回仍按驳回路径处理。
                    </div>
                  </ElFormItem>
                </div>
              </section>
              <details
                v-if="permissionButtons.length"
                :key="`${node.id}:button-roles`"
                ref="buttonRolesDetails"
                class="inspector-details"
              >
                <summary>
                  高级：限制按钮使用角色<span>{{
                    Object.keys(node.buttonRoleIds || {}).length +
                    Object.keys(node.buttonDeniedRoleIds || {}).length
                      ? `已配置 ${Object.keys(node.buttonRoleIds || {}).length + Object.keys(node.buttonDeniedRoleIds || {}).length} 项`
                      : '未配置'
                  }}</span>
                </summary>
                <p class="help advanced-help">
                  默认情况下，当前节点的办理人都可以使用已启用的按钮。只有需要进一步限制时才配置这里。
                </p>
                <ElFormItem
                  v-for="button in permissionButtons"
                  :key="`permission-${button}`"
                  :label="`${workflowButtonConfig(document, button).label} · 允许操作的角色`"
                >
                  <ElSelect
                    :model-value="node.buttonRoleIds?.[button] || []"
                    multiple
                    filterable
                    clearable
                    :disabled="!resourcesReady"
                    placeholder="留空表示当前节点办理人均可操作"
                    style="width: 100%"
                    @update:model-value="setButtonRoles(button, $event)"
                  >
                    <ElOption
                      v-for="role in options.roles"
                      :key="role.id"
                      :label="role.name"
                      :value="role.id"
                    />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem
                  v-for="button in permissionButtons"
                  :key="`permission-denied-${button}`"
                  :label="`${workflowButtonConfig(document, button).label} · 禁止操作的角色`"
                >
                  <ElSelect
                    :model-value="node.buttonDeniedRoleIds?.[button] || []"
                    multiple
                    filterable
                    clearable
                    :disabled="!resourcesReady"
                    placeholder="留空表示不额外禁止"
                    style="width: 100%"
                    @update:model-value="setButtonDeniedRoles(button, $event)"
                  >
                    <ElOption
                      v-for="role in options.roles"
                      :key="role.id"
                      :label="role.name"
                      :value="role.id"
                    />
                  </ElSelect>
                </ElFormItem>
              </details>
            </div>
            <div v-show="activeNodeTab === 'materials'">
              <div class="section-title">字段权限</div>
              <p class="help">
                这里只控制当前页面和“追加办理信息”中已经存在的字段，不会创建新字段。办理节点默认可编辑，审批节点默认只读；模板只读、模块权限和角色限制优先。
              </p>
              <div
                v-for="(_, key) in node.fieldAccess"
                :key="key"
                style="display: flex; gap: 6px; margin: 8px 0"
              >
                <span
                  style="width: 95px; font-size: 11px; overflow-wrap: anywhere"
                  >{{ fieldAccessLabel(key) }}</span><ElSelect v-model="node.fieldAccess![key]" style="flex: 1">
                  <ElOption value="edit" label="可编辑" /><ElOption
                    value="readonly"
                    label="只读"
                  /><ElOption value="hidden" label="隐藏" />
</ElSelect><ElButton
                  link
                  type="danger"
                  @click="delete node.fieldAccess![key]"
                >
                  移除
                </ElButton>
              </div>
              <div style="display: flex; gap: 6px">
                <ElSelect
                  v-model="fieldKey"
                  filterable
                  placeholder="选择当前页面中已有的字段"
                  style="flex: 1"
                >
                  <ElOptionGroup
                    v-for="group in permissionFieldGroups"
                    :key="group"
                    :label="group"
                  >
                    <ElOption
                      v-for="item in availablePermissionFields.filter(
                        (field) =>
                          field.group === group &&
                          !Object.hasOwn(node?.fieldAccess || {}, field.key),
                      )"
                      :key="item.key"
                      :label="`${item.label}（${item.key}）`"
                      :value="item.key"
                    />
                  </ElOptionGroup>
                </ElSelect>
                <ElButton :disabled="!fieldKey" @click="addFieldAccess">
                  添加
                </ElButton>
              </div>
              <ElAlert
                v-if="!availablePermissionFields.length"
                type="info"
                :closable="false"
                title="当前页面没有可单独配置的字段；请先在页面配置或“追加办理信息”的表单模板中定义字段。"
              />
              <ElAlert
                v-if="staleFieldAccess.length"
                type="warning"
                :closable="false"
                :title="`以下权限字段已不在当前页面或补充表单中：${staleFieldAccess.map(fieldAccessLabel).join('、')}`"
              >
                <ElButton
                  link
                  type="warning"
                  :disabled="readOnly || !resourcesReady"
                  @click="clearInvalidConfiguration('fieldAccess')"
                >
                  移除失效字段权限
                </ElButton>
              </ElAlert>
            </div>
            <div v-show="activeNodeTab === 'rules'">
              <div class="section-title section-title-first">驳回规则</div>
              <ElFormItem label="驳回到哪里">
                <ElSelect v-model="node.rejectMode">
                  <ElOption label="上一个办理节点" value="previous" />
                  <ElOption label="发起人填报节点" value="initiator" />
                  <ElOption
                    label="指定上游节点（按驳回连线）"
                    value="specified"
                  />
                </ElSelect>
                <div class="help">
                  需要在画布上绘制允许的驳回连线，发布校验会检查目标是否为上游节点。
                </div>
              </ElFormItem>
              <ElFormItem label="修改后重新提交到哪里">
                <ElSelect v-model="node.resubmitMode">
                  <ElOption label="直接回到驳回节点" value="return" />
                  <ElOption label="从退回节点重新流转" value="restart" />
                </ElSelect>
              </ElFormItem>
              <details ref="dataActionsDetails" class="inspector-details">
                <summary>
                  高级：数据动作<span>{{
                    node.dataActions?.length
                      ? `已配置 ${node.dataActions.length} 项`
                      : '未配置'
                  }}</span>
                </summary>
                <p class="help">
                  在节点到达、提交、通过或驳回时自动写入数据。目标只能选择当前节点真实存在且已接入存储的字段；失败时本次办理整单回滚。
                  到达节点时修改经办人或协办人，只影响后续节点，不改变当前节点已经解析出的办理人。
                  “驳回时”仅在本节点配置驳回按钮后可选；指从本节点执行驳回，不是沿驳回连线到达本节点。
                </p>
                <ElAlert
                  v-if="staleDataActions.length"
                  :closable="false"
                  show-icon
                  title="存在已失效的数据动作字段，请重新选择或移除后再发布。"
                  type="warning"
                />
                <div
                  v-for="(action, i) in node.dataActions || []"
                  :key="i"
                  class="data-action"
                >
                  <ElSelect
                    :model-value="action.when"
                    style="width: 110px"
                    @update:model-value="setDataActionWhen(action, $event)"
                  >
                    <ElOption
                      v-for="when in DATA_ACTION_WHENS.filter(
                        (w) =>
                          w === 'arrive' ||
                          node?.buttons.some(
                            (code) =>
                              workflowButtonAction(document, code) === w,
                          ),
                      )"
                      :key="when"
                      :label="DATA_ACTION_WHEN_LABELS[when]"
                      :value="when"
                    />
                  </ElSelect>
                  <ElSelect
                    :model-value="action.policy || 'always'"
                    style="width: 120px"
                    @update:model-value="setDataActionPolicy(action, $event)"
                  >
                    <ElOption
                      v-for="policy in DATA_ACTION_POLICIES.filter(
                        (item) =>
                          item !== 'firstArrival' || action.when === 'arrive',
                      )"
                      :key="policy"
                      :label="DATA_ACTION_POLICY_LABELS[policy]"
                      :value="policy"
                    />
                  </ElSelect>
                  <ElSelect v-model="action.kind" style="width: 110px">
                    <ElOption
                      v-for="kind in DATA_ACTION_KINDS"
                      :key="kind"
                      :label="DATA_ACTION_KIND_LABELS[kind]"
                      :value="kind"
                    />
                  </ElSelect>
                  <ElSelect
                    v-model="action.field"
                    filterable
                    default-first-option
                    placeholder="目标字段"
                    style="flex: 1"
                    @change="resetDataActionValue(action)"
                  >
                    <ElOptionGroup
                      v-for="group in dataActionTargetGroups"
                      :key="group"
                      :label="group"
                    >
                      <ElOption
                        v-for="item in dataActionTargetFields.filter(
                          (c) => c.group === group,
                        )"
                        :key="item.key"
                        :label="`${item.label}（${item.key}）`"
                        :value="item.key"
                      />
                    </ElOptionGroup>
                  </ElSelect>
                  <ElInputNumber
                    v-if="
                      action.kind === 'set' &&
                      dataActionTarget(action.field)?.type === 'number'
                    "
                    :max="dataActionTarget(action.field)?.max"
                    :min="dataActionTarget(action.field)?.min"
                    :model-value="
                      typeof action.value === 'number'
                        ? action.value
                        : undefined
                    "
                    controls-position="right"
                    placeholder="固定数值"
                    style="flex: 1"
                    @update:model-value="action.value = $event ?? ''"
                  />
                  <ElDatePicker
                    v-else-if="
                      action.kind === 'set' &&
                      dataActionTarget(action.field)?.type === 'date'
                    "
                    :model-value="
                      typeof action.value === 'string' ? action.value : ''
                    "
                    :type="
                      dataActionTarget(action.field)?.dateMode === 'datetime'
                        ? 'datetime'
                        : 'date'
                    "
                    :value-format="
                      dataActionTarget(action.field)?.dateMode === 'datetime'
                        ? 'YYYY-MM-DDTHH:mm:ss'
                        : 'YYYY-MM-DD'
                    "
                    placeholder="固定日期"
                    style="flex: 1"
                    @update:model-value="
                      action.value = typeof $event === 'string' ? $event : ''
                    "
                  />
                  <ElSelect
                    v-else-if="
                      action.kind === 'set' &&
                      dataActionTarget(action.field)?.type === 'boolean'
                    "
                    v-model="action.value"
                    placeholder="固定值"
                    style="flex: 1"
                  >
                    <ElOption label="是" :value="true" />
                    <ElOption label="否" :value="false" />
                  </ElSelect>
                  <ElSelect
                    v-else-if="
                      action.kind === 'set' &&
                      dataActionTarget(action.field)?.type === 'select'
                    "
                    v-model="action.value"
                    placeholder="固定选项"
                    style="flex: 1"
                  >
                    <ElOption
                      v-for="option in dataActionTarget(action.field)
                        ?.options || []"
                      :key="String(option.value)"
                      :label="option.label"
                      :value="option.value"
                    />
                  </ElSelect>
                  <ElInput
                    v-else-if="action.kind === 'set'"
                    :model-value="
                      typeof action.value === 'boolean' ? '' : action.value
                    "
                    placeholder="固定值"
                    maxlength="2000"
                    style="flex: 1"
                    @update:model-value="action.value = $event"
                  />
                  <ElSelect
                    v-else
                    v-model="action.from"
                    filterable
                    default-first-option
                    placeholder="来源字段"
                    style="flex: 1"
                  >
                    <ElOptionGroup
                      v-for="group in dataActionSourceGroups"
                      :key="group"
                      :label="group"
                    >
                      <ElOption
                        v-for="item in dataActionSourceFields.filter(
                          (c) => c.group === group,
                        )"
                        :key="item.key"
                        :label="`${item.label}（${item.key}）`"
                        :value="item.key"
                      />
                    </ElOptionGroup>
                  </ElSelect>
                  <ElButton
                    link
                    type="danger"
                    @click="node.dataActions?.splice(i, 1)"
                  >
                    移除
                  </ElButton>
                </div>
                <ElButton
                  style="margin-top: 8px"
                  :disabled="(node.dataActions?.length || 0) >= 20"
                  @click="addDataAction"
                >
                  添加数据动作
                </ElButton>
              </details>
              <details class="inspector-details">
                <summary>
                  高级：时限与提醒<span>{{
                    node.sla?.durationHours
                      ? `${node.sla.durationHours} 小时`
                      : '未配置'
                  }}</span>
                </summary>
                <ElFormItem label="办理时限（小时）">
                  <ElInputNumber
                    :model-value="node.sla?.durationHours || 0"
                    :min="0"
                    :max="8760"
                    :step="1"
                    @update:model-value="
                      node.sla = {
                        overtime: 'remind',
                        ...node.sla,
                        durationHours: Number($event) || 0,
                      }
                    "
                  /><span class="help" style="margin-left: 8px">0 表示不限。按自然小时，24 即 1
                    个自然日；不支持工作日历。</span>
                </ElFormItem>
                <ElFormItem label="临期提醒（小时）">
                  <ElInputNumber
                    :model-value="node.sla?.warnHours || 0"
                    :min="0"
                    :max="8760"
                    :step="1"
                    :disabled="!node.sla?.durationHours"
                    @update:model-value="
                      node.sla = {
                        overtime: 'remind',
                        ...node.sla,
                        warnHours: Number($event) || 0,
                      }
                    "
                  /><span class="help" style="margin-left: 8px">截止前多少小时通知办理人。须小于办理时限。</span>
                </ElFormItem>
                <ElFormItem label="超时策略">
                  <ElSelect
                    :model-value="node.sla?.overtime || 'remind'"
                    :disabled="!node.sla?.durationHours"
                    style="width: 220px"
                    @update:model-value="
                      node.sla = { ...node.sla, overtime: $event }
                    "
                  >
                    <ElOption label="仅提醒（默认）" value="remind" /><ElOption
                      label="催办（写催办记录并通知）"
                      value="urge"
                    />
                  </ElSelect>
                  <div class="help">
                    超时只提醒或催办，不会自动通过。挂起期间暂停计时。
                  </div>
                </ElFormItem>
              </details>
            </div>
          </template>
        </template>
        <ElAlert
          v-if="node.type === 'condition'"
          title="为各出口设置条件，并保留一条“否则”分支。点击连线编辑条件。"
          type="info"
          :closable="false"
        />
        <ElAlert
          v-if="node.type === 'parallel'"
          title="分叉网关画出至少两条通过连线，另放一个汇聚网关收集各路后再往下走。两路同时产生待办，全部到达汇聚才继续。"
          type="info"
          :closable="false"
        />
        <template v-if="node.type === 'subflow'">
          <div class="section-title">子流程</div>
          <ElFormItem label="调用已发布流程" required>
            <ElSelect
              v-model="node.subflowCode"
              filterable
              clearable
              placeholder="选择同基地已发布流程"
              style="width: 100%"
            >
              <ElOption
                v-for="item in (options.workflows || []).filter(
                  (w) => w.code !== document.code,
                )"
                :key="item.id"
                :label="item.name"
                :value="item.code"
              />
            </ElSelect>
            <div class="help">
              到达本节点后发起该流程的新实例（同一协议），子流程结束后沿通过连线继续。不能调用自身。
            </div>
          </ElFormItem>
        </template>
        <div
          v-if="outgoing.length && (!human || activeNodeTab === 'basic')"
          class="section-title"
        >
          流出路径
        </div>
        <button
          v-for="line in !human || activeNodeTab === 'basic' ? outgoing : []"
          :key="line.id"
          class="outgoing"
          @click="emit('selectEdge', line.id)"
        >
          <span :class="{ reject: line.type === 'reject' }">{{
            line.isDefault ? '否则' : line.label || '通过'
          }}</span><span>→
            {{
              document.nodes.find((n) => n.id === line.target)?.name ||
              '目标丢失'
            }}</span>
        </button>
      </ElForm>
      <ElForm
        v-else-if="edge"
        label-position="top"
        :disabled="readOnly"
        size="small"
        @submit.prevent
      >
        <ElFormItem label="连线名称">
          <ElInput
            v-model="edge.label"
            maxlength="80"
            placeholder="例如：通过 / 金额达标 / 驳回"
          />
        </ElFormItem>
        <ElFormItem label="流转类型">
          <ElSelect
            v-model="edge.type"
            @change="
              edge.isDefault = false;
              edge.condition = '';
            "
          >
            <ElOption label="通过" value="pass" /><ElOption
              label="驳回（红色虚线）"
              value="reject"
            /><ElOption label="条件分支" value="condition" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="来源节点">
          <ElSelect v-model="edge.source" filterable>
            <ElOption
              v-for="item in document.nodes"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="目标节点">
          <ElSelect v-model="edge.target" filterable>
            <ElOption
              v-for="item in document.nodes.filter(
                (n) => n.id !== edge!.source,
              )"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </ElSelect>
        </ElFormItem>
        <template v-if="edge.type === 'condition'">
          <ElFormItem label="“否则”兜底分支">
            <ElSwitch v-model="edge.isDefault" @change="edge.condition = ''" />
          </ElFormItem>
          <ElFormItem v-if="!edge.isDefault" label="条件表达式" required>
            <ElInput
              v-model="edge.condition"
              type="textarea"
              :rows="4"
              maxlength="1000"
              placeholder="例如：BuChangJinE >= 1000000"
            />
            <div class="help">
              第一阶段保存表达式并检查是否填写或重复；表达式语义与互斥性由后续服务端校验。
            </div>
          </ElFormItem>
        </template>
        <ElAlert
          v-if="edge.type === 'reject'"
          type="warning"
          :closable="false"
          title="只能退回正向路径上已到达的办理或审批节点，不能退回开始、条件或结束节点。"
        />
      </ElForm>
      <ElForm
        v-else
        label-position="top"
        :disabled="readOnly"
        size="small"
        @submit.prevent
      >
        <ElFormItem label="流程名称" required>
          <ElInput v-model="document.name" maxlength="80" />
        </ElFormItem>
        <ElFormItem label="流程编码" required>
          <ElInput v-model="document.code" maxlength="80" />
        </ElFormItem>
        <ElFormItem label="所属基地编码" required>
          <ElInput v-model="document.base" maxlength="80" />
        </ElFormItem>
        <ElFormItem label="允许发起的角色">
          <ElSelect
            :model-value="document.startRoleIds || []"
            multiple
            filterable
            clearable
            :disabled="!resourcesReady"
            placeholder="留空表示拥有全局发起权限的用户均可发起"
            style="width: 100%"
            @update:model-value="setStartRoles($event)"
          >
            <ElOption
              v-for="role in options.roles"
              :key="role.id"
              :label="role.name"
              :value="role.id"
            />
          </ElSelect>
          <div class="help">
            这里只进一步限制发起范围；用户仍须拥有全局流程发起权限。
          </div>
        </ElFormItem>
        <ElFormItem label="禁止发起的角色">
          <ElSelect
            :model-value="document.startDeniedRoleIds || []"
            multiple
            filterable
            clearable
            :disabled="!resourcesReady"
            placeholder="留空表示不额外禁止"
            style="width: 100%"
            @update:model-value="setStartDeniedRoles($event)"
          >
            <ElOption
              v-for="role in options.roles"
              :key="role.id"
              :label="role.name"
              :value="role.id"
            />
          </ElSelect>
          <div class="help">同时命中允许和禁止角色时，以禁止为准。</div>
        </ElFormItem>
        <ElFormItem label="业务分类">
          <ElSelect v-model="document.category">
            <ElOption
              v-for="item in CATEGORIES"
              :key="item"
              :value="item"
              :label="item"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="业务数据源" required>
          <ElSelect v-model="document.businessTable">
            <ElOption label="协议业务（XieYi）" value="XieYi" />
            <ElOption
              v-if="document.businessTable !== 'XieYi'"
              :label="`未支持的数据源：${document.businessTable}`"
              :value="document.businessTable"
              disabled
            />
          </ElSelect>
          <div class="help">
            一条流程实例始终绑定同一条协议；所有节点共享这份业务数据。
          </div>
        </ElFormItem>
        <ElFormItem label="流程默认详情页">
          <ElSelect
            v-model="defaultDetailViewId"
            clearable
            filterable
            :disabled="!resourcesReady"
            placeholder="留空使用内置协议详情"
            style="width: 100%"
          >
            <ElOption
              v-for="view in options.views.filter((v) => v.type === 'page')"
              :key="view.id"
              :value="view.id"
              :label="view.name"
            />
            <ElOption
              v-if="missingDefaultDetailView"
              :value="defaultDetailViewId"
              :label="`已失效或不可用：${defaultDetailViewId}`"
              disabled
            />
          </ElSelect>
          <div
            v-if="missingDefaultDetailView && resourcesReady"
            class="warning"
          >
            默认办理详情已失效，请重新选择。
          </div>
          <div v-else class="help">
            全流程只需在这里选择一次，人工节点默认继承。页面只决定协议详情的布局，不改变数据来源，也不使用列表列、查询条件和列表按钮。
          </div>
          <div v-if="!readOnly" class="help">
            <RouterLink
              :to="{ path: '/system/page-schema', query: { create: 'detail' } }"
              target="_blank"
              class="text-primary"
            >
              新建办理详情
            </RouterLink>
            <ElButton
              link
              type="primary"
              :disabled="optionsLoaded === false"
              @click="emit('retry')"
            >
              刷新资源
            </ElButton>
            保存后返回此处，刷新资源再选择；发布时冻结，已有流程版本不受后续修改影响。
          </div>
        </ElFormItem>
        <ElFormItem label="流程说明">
          <ElInput
            v-model="document.description"
            type="textarea"
            maxlength="500"
            :rows="4"
          />
        </ElFormItem>
        <div class="button-catalog">
          <h3>按钮资源（F6）</h3>
          <p class="help">
            从“按钮管理”导入资源，再在节点绑定；这里可调整当前流程的快照。发布后版本冻结，按钮库后续修改不会影响已发布实例。
          </p>
          <div class="button-catalog-add">
            <ElSelect
              v-model="selectedButtonAction"
              placeholder="选择要配置的动作"
              :disabled="readOnly"
              clearable
            >
              <ElOption
                v-for="resource in unconfiguredButtons"
                :key="resource.code"
                :value="resource.code"
                :label="`${resource.label}（${resource.code}）`"
              />
            </ElSelect>
            <ElButton
              :disabled="readOnly || !selectedButtonAction"
              @click="addButtonConfig"
            >
              添加配置
            </ElButton>
          </div>
          <div
            v-for="button in document.buttonCatalog || []"
            :key="button.code || button.action"
            class="button-catalog-item"
          >
            <div class="button-catalog-heading">
              <b>{{ button.label }}（{{ button.code || button.action }} ·
                {{ button.action }}）</b>
              <ElButton
                link
                type="danger"
                :disabled="readOnly"
                @click="removeButtonConfig(button.code || button.action)"
              >
                移除快照
              </ElButton>
            </div>
            <ElFormItem label="显示名称">
              <ElInput v-model="button.label" maxlength="80" />
            </ElFormItem>
            <ElFormItem label="按钮位置">
              <ElSelect v-model="button.placement">
                <ElOption label="办理意见区顶部" value="top" />
                <ElOption label="办理意见区底部" value="bottom" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="按钮样式">
              <ElSelect v-model="button.style">
                <ElOption label="普通" value="default" />
                <ElOption label="主要" value="primary" />
                <ElOption label="警告" value="warning" />
                <ElOption label="危险" value="danger" />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="显示条件">
              <ElInput
                v-model="button.visibleWhen"
                placeholder="留空始终显示，例如 BuChangJinE >= 1000000"
              />
            </ElFormItem>
            <ElFormItem label="启用条件">
              <ElInput
                v-model="button.enabledWhen"
                placeholder="留空始终可用，例如 nodeCode == 'N_2'"
              />
            </ElFormItem>
            <ElFormItem label="条件不满足时提示">
              <ElInput v-model="button.disabledReason" maxlength="200" />
            </ElFormItem>
            <ElFormItem label="二次确认文案">
              <ElInput
                v-model="button.confirmText"
                placeholder="留空使用原有确认规则"
                maxlength="300"
              />
            </ElFormItem>
            <ElFormItem label="办理意见必填">
              <ElSwitch
                v-model="button.requireOpinion"
                :disabled="button.action === 'reject'"
              />
              <span v-if="button.action === 'reject'" class="help">驳回意见始终必填</span>
            </ElFormItem>
          </div>
          <p class="help">
            条件读取已保存的业务字段和
            nodeCode、instanceStatus、actorId、initiatorId；修改字段后先保存，按钮条件才会更新。
          </p>
        </div>
        <ElAlert
          type="info"
          title="点击画布中的节点或连线，编辑对应配置。未完成的流程也可以保存为草稿。"
          :closable="false"
        />
      </ElForm>
    </div>
    <div v-if="!readOnly && (node || edge)" class="inspector-footer">
      <ElButton
        v-if="node && !['start', 'end'].includes(node.type)"
        size="small"
        @click="emit('duplicate')"
      >
        复制节点
</ElButton><ElButton size="small" type="danger" plain @click="emit('remove')">
        {{ node ? '删除节点' : '删除连线' }}
      </ElButton>
    </div>
  </aside>
</template>

<style scoped>
.configuration-problems {
  margin-bottom: 14px;
  overflow-wrap: anywhere;
}

.configuration-problem {
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.configuration-problem:last-of-type {
  margin-bottom: 10px;
}

.detail-source-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  font-size: 12px;
}

.advanced-detail-entry {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0;
}

.advanced-detail-panel {
  padding: 12px;
  margin-bottom: 17px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 7px;
}

.advanced-detail-panel :deep(.el-alert) {
  margin-bottom: 14px;
}

.module-access-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 8px;
  align-items: center;
  margin: 10px 0;
  font-size: 12px;
}

.module-access-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.module-preview {
  padding: 10px;
  margin-top: 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 7px;
}

.module-preview-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

.module-preview-title::before,
.inspector-details summary::before {
  display: inline-block;
  margin-right: 5px;
  content: '▸';
}

.module-preview[open] .module-preview-title::before,
.inspector-details[open] summary::before {
  transform: rotate(90deg);
}

.module-preview[open] .module-preview-title {
  margin-bottom: 7px;
}

.module-preview-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
  font-size: 12px;
}

.module-preview-row.is-hidden > span {
  color: var(--el-text-color-placeholder);
  text-decoration: line-through;
}

.inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color-lighter);
}

.inspector-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.inspector-title-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.inspector-title-main span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.inspector-title-main b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.inspector-body {
  flex: 1;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
}

.node-tabs {
  position: sticky;
  top: -18px;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
  padding: 8px 0 10px;
  margin: -10px 0 14px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.node-tabs button {
  min-width: 0;
  padding: 7px 1px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
}

.node-tabs button:hover,
.node-tabs button.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.node-tabs button.active {
  font-weight: 600;
}

.tab-intro {
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 7px;
}

.inspector-details {
  padding: 11px 12px;
  margin: 12px 0;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 7px;
}

.inspector-details summary {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.inspector-details summary span {
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.inspector-details[open] summary {
  margin-bottom: 14px;
}

.advanced-help {
  padding-bottom: 10px;
  margin-top: -4px;
}

.inspector-body :deep(.el-select) {
  width: 100%;
}

.inspector-body :deep(.el-form-item) {
  margin-bottom: 17px;
}

.help {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.warning {
  margin-top: 5px;
  font-size: 11px;
  color: var(--el-color-danger);
}

.section-title {
  padding-top: 16px;
  margin: 20px 0 14px;
  font-size: 12px;
  font-weight: 600;
  border-top: 1px solid var(--el-border-color-lighter);
}

.section-title-first {
  padding-top: 0;
  margin-top: 4px;
  border-top: 0;
}

.capability-card {
  padding: 12px;
  margin: 10px 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.capability-card.enabled {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}

.capability-heading,
.capability-switch {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.capability-heading > div:first-child {
  min-width: 0;
}

.capability-heading b {
  font-size: 12px;
}

.capability-heading p {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.capability-switch {
  flex-shrink: 0;
  gap: 6px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.capability-body {
  padding-top: 13px;
  margin-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.capability-body :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.data-action {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 8px 0;
}

.standard-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
}

.standard-buttons :deep(.el-checkbox) {
  margin-right: 0;
}

.button-order > div {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
  font-size: 11px;
}

.button-order span {
  flex: 1;
}

.outgoing {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  width: 100%;
  padding: 9px;
  margin-bottom: 6px;
  font-size: 11px;
  cursor: pointer;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}

.reject {
  color: #dc5964;
}

.inspector-footer {
  display: flex;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.button-catalog {
  padding-top: 14px;
  margin: 18px 0;
  border-top: 1px solid var(--el-border-color);
}

.button-catalog h3 {
  margin-bottom: 8px;
  font-size: 14px;
}

.button-catalog-add,
.button-catalog-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0;
}

.button-catalog-add :deep(.el-select) {
  flex: 1;
}

.button-catalog-item {
  padding: 12px;
  margin: 12px 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
</style>
