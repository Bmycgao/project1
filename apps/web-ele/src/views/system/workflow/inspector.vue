<script setup lang="ts">
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
  WorkflowOptions,
} from './model';

import { computed, ref, watch } from 'vue';

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

import { DEFAULT_WORKFLOW_MODULES } from '../../../../../shared/workflow-detail';
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
  workflowNodeDetailMode,
  workflowNodeDetailViewId,
  workflowNodeSupplementFormId,
} from './model';

const props = defineProps<{
  buttons: { code: string; label: string }[];
  document: WorkflowDocument;
  edge?: WorkflowEdge;
  node?: WorkflowNode;
  options: WorkflowOptions;
  optionsError: boolean;
  readOnly?: boolean;
}>();
const emit = defineEmits<{
  duplicate: [];
  remove: [];
  retry: [];
  selectEdge: [id: string];
}>();
const fieldKey = ref('');
const advancedDetailOpen = ref(false);
watch(
  () => props.node?.id,
  () => {
    advancedDetailOpen.value = false;
  },
);
const defaultDetailViewId = computed({
  get: () => props.document.defaultDetailViewId || '',
  set: (value: string) => {
    if (value === (props.document.defaultDetailViewId || '')) return;
    props.document.defaultDetailViewId = value || '';
    for (const candidate of props.document.nodes) {
      if (workflowNodeDetailMode(candidate) === 'inherit')
        candidate.moduleAccess = {};
    }
  },
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
  if (!enabled) props.node.transferReturn = false;
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
  node.detailViewId ||= workflowNodeDetailViewId(node);
  node.supplementFormId ||= workflowNodeSupplementFormId(node);
  node.form = { type: 'page', id: '' };
}
const detailMode = computed({
  get: () => (props.node ? workflowNodeDetailMode(props.node) : 'inherit'),
  set: (value: WorkflowNode['detailMode']) => {
    if (!props.node || !value) return;
    if (value !== detailMode.value) props.node.moduleAccess = {};
    migrateLegacyNodeBindings(props.node);
    props.node.detailMode = value;
  },
});
function resetToDefaultDetail() {
  if (!props.node) return;
  detailMode.value = 'inherit';
  props.node.detailViewId = '';
}
const detailViewId = computed({
  get: () => (props.node ? workflowNodeDetailViewId(props.node) : ''),
  set: (value: string) => {
    if (!props.node) return;
    if (value !== detailViewId.value) props.node.moduleAccess = {};
    migrateLegacyNodeBindings(props.node);
    props.node.detailViewId = value || '';
  },
});
const supplementFormId = computed({
  get: () => (props.node ? workflowNodeSupplementFormId(props.node) : ''),
  set: (value: string) => {
    if (!props.node) return;
    migrateLegacyNodeBindings(props.node);
    props.node.supplementFormId = value || '';
  },
});
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
  const mode = workflowNodeDetailMode(candidate);
  const detailId = effectiveWorkflowDetailViewId(props.document, candidate);
  const supplementId = workflowNodeSupplementFormId(candidate);
  const fields = [
    ...(mode === 'formOnly'
      ? []
      : detailId
        ? props.options.views.find(
            (view) => view.type === 'page' && view.id === detailId,
          )?.fields || []
        : props.options.defaultDetailFields || []),
    ...(props.options.views.find(
      (view) => view.type === 'form' && view.id === supplementId,
    )?.fields || []),
  ];
  return [
    ...new Map(fields.map((field) => [field.key, field] as const)).values(),
  ];
}
const availableModules = computed(() => {
  if (!props.node || detailMode.value === 'formOnly') return [];
  if (!effectiveDetailViewId.value) return [...DEFAULT_WORKFLOW_MODULES];
  return (
    props.options.views.find(
      (v) => v.type === 'page' && v.id === effectiveDetailViewId.value,
    )?.modules || []
  );
});
const staleModules = computed(() =>
  Object.keys(props.node?.moduleAccess || {}).filter(
    (key) => !availableModules.value.some((m) => m.key === key),
  ),
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
  if (!props.node || props.readOnly) return;
  const next = { ...props.node.moduleAccess };
  if (value === 'inherit') delete next[key];
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
  Object.keys(props.node?.fieldAccess || {}).filter(
    (key) =>
      !availablePermissionFields.value.some((field) => field.key === key),
  ),
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
  availablePermissionFields.value.filter(
    (field) =>
      field.actionable === true &&
      field.type !== 'table' &&
      field.key !== 'agreementNo',
  ),
);
const dataActionTargetGroups = computed(() => [
  ...new Set(dataActionTargetFields.value.map((item) => item.group)),
]);
/** 来源可读取协议基础数据，以及流程中任一节点已经正式定义的补充字段。 */
const dataActionSourceFields = computed(() => {
  const fields = [
    ...WORKFLOW_FIELD_CATALOG.filter((item) => item.persist !== 'flow').map(
      (item) => ({ ...item, actionable: true }),
    ),
    ...props.document.nodes
      .filter((item) => ['approve', 'task'].includes(item.type))
      .flatMap(fieldsForNode)
      .filter((field) => field.actionable === true && field.type !== 'table'),
  ];
  return [
    ...new Map(fields.map((field) => [field.key, field] as const)).values(),
  ];
});
const dataActionSourceGroups = computed(() => [
  ...new Set(dataActionSourceFields.value.map((item) => item.group)),
]);
const staleDataActions = computed(() =>
  (props.node?.dataActions || []).filter(
    (action) =>
      !dataActionTargetFields.value.some(
        (field) => field.key === action.field,
      ) ||
      (action.kind === 'copy' &&
        !dataActionSourceFields.value.some(
          (field) => field.key === action.from,
        )),
  ),
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
      <b>{{ node ? '节点属性' : edge ? '连线属性' : '流程属性' }}</b><ElTag v-if="node" size="small" effect="plain">
{{
        NODE_LABELS[node.type]
      }}
</ElTag><ElTag v-else-if="edge" size="small" effect="plain">
{{
        edge.type === 'reject' ? '驳回路径' : '流转路径'
      }}
</ElTag>
    </div>
    <div class="inspector-body">
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
      <ElForm
        v-if="node"
        label-position="top"
        :disabled="readOnly"
        size="small"
        @submit.prevent
      >
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
        <template v-if="human">
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
/><ElOption
                label="发起人本人"
                value="initiator"
/><ElOption
                label="表单字段取人"
                value="field"
/>
</ElSelect>
</ElFormItem>
          <ElFormItem
            v-if="
              ['role', 'user', 'departmentLeader'].includes(node.assignee.type)
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
              :disabled="optionsError"
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
              v-if="missingAssignees.length && !optionsError"
              class="warning"
            >
              部分候选资源已失效，请重新选择。
            </div>
            <div v-if="node.assignee.type === 'departmentLeader'" class="help">
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
/><ElOption
                label="依次审批"
                value="sequential"
/><ElOption label="比例会签" value="ratio" />
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
          <template v-if="node.type !== 'cc'">
            <div class="section-title">表单与按钮</div>
            <ElFormItem label="业务详情">
              <div class="detail-source-summary">
                <ElTag
                  size="small"
                  effect="plain"
                  :type="detailMode === 'inherit' ? 'success' : 'warning'"
                >
                  {{
                    detailMode === 'inherit'
                      ? '继承流程默认'
                      : detailMode === 'override'
                        ? '高级：节点覆盖'
                        : '高级：仅独立表单'
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
              v-if="missingDetailView && !optionsError"
              type="warning"
              :closable="false"
              :title="
                detailMode === 'override'
                  ? '节点覆盖的详情页已失效，请在高级设置中重新选择。'
                  : '流程默认办理详情已失效，请到流程属性中重新选择。'
              "
            />
            <ElFormItem
              :label="
                detailMode === 'formOnly' ? '独立办理表单' : '节点补充表单'
              "
              :required="detailMode === 'formOnly'"
            >
              <ElSelect
                v-model="supplementFormId"
                clearable
                filterable
                :disabled="optionsError"
                :placeholder="
                  detailMode === 'formOnly'
                    ? '请选择办理表单'
                    : '可选；显示在协议详情下方'
                "
                style="width: 100%"
              >
                <ElOption
                  v-for="view in options.views.filter((v) => v.type === 'form')"
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
                v-if="missingSupplementForm && !optionsError"
                class="warning"
              >
                节点表单已失效，请重新选择。
              </div>
              <div v-else class="help">
                {{
                  detailMode === 'formOnly'
                    ? '当前节点只显示并提交此表单，字段保存为流程扩展数据。'
                    : '可选。这里只显示用途为“流程节点补充”的模板；字段保存为流程扩展数据，显示在协议详情下方，不替换协议主体。'
                }}
              </div>
            </ElFormItem>
            <div v-if="availableModules.length" class="node-module-access">
              <div class="section-title">办理资料 · 模块权限</div>
              <p class="help">
                继承：填报可编辑、审批只读。模块隐藏不删除资料；模块明确只读时，字段不能放宽。角色与模板限制始终生效。
              </p>
              <div
                v-for="module in availableModules"
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
              <div class="module-preview">
                <div class="module-preview-title">当前节点生效预览</div>
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
              </div>
            </div>
            <ElAlert
              v-if="staleModules.length"
              type="warning"
              :closable="false"
              :title="`以下模块已不在视图内，请重新绑定视图或移除旧规则：${staleModules.join('、')}`"
            >
              <ElButton
                :disabled="readOnly"
                link
                @click="
                  staleModules.forEach((key) => {
                    if (node?.moduleAccess) delete node.moduleAccess[key];
                  })
                "
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
                title="通常无需修改。覆盖详情页仍读取同一条协议，只改变布局；仅独立表单只适用于无需查看协议资料的特殊节点。"
              />
              <ElFormItem label="节点页面模式">
                <ElSelect v-model="detailMode" style="width: 100%">
                  <ElOption value="inherit" label="继承流程默认详情（推荐）" />
                  <ElOption value="override" label="覆盖为其他详情页" />
                  <ElOption
                    value="formOnly"
                    label="仅使用独立办理表单（特殊节点）"
                  />
                </ElSelect>
              </ElFormItem>
              <ElFormItem
                v-if="detailMode === 'override'"
                label="节点覆盖详情页"
                required
              >
                <ElSelect
                  v-model="detailViewId"
                  filterable
                  :disabled="optionsError"
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
                <div v-if="missingDetailView && !optionsError" class="warning">
                  节点覆盖详情页已失效，请重新选择。
                </div>
              </ElFormItem>
              <div v-if="detailMode === 'formOnly'" class="help">
                请在上方“独立办理表单”中选择必填模板；该节点不会展示协议详情。
              </div>
              <ElButton
                v-if="detailMode !== 'inherit'"
                plain
                size="small"
                @click="resetToDefaultDetail"
              >
                恢复继承流程默认详情
              </ElButton>
            </div>
            <ElFormItem label="节点按钮">
              <p class="help">
                可发布保存、提交、通过、驳回。撤回、转办由下方开关控制，不会出现在节点按钮勾选里。节点按钮与菜单权限无关，由办理人身份决定能否点击。
              </p>
              <ElCheckboxGroup v-model="node.buttons" class="standard-buttons">
<ElCheckbox
                  v-for="button in STANDARD_BUTTONS"
                  :key="button.code"
                  :value="button.code"
                  >
{{ button.label }}
</ElCheckbox>
</ElCheckboxGroup>
              <ElSelect
                v-if="buttons.length"
                :model-value="
                  node.buttons.filter(
                    (b) => !STANDARD_BUTTONS.some((s) => s.code === b),
                  )
                "
                multiple
                filterable
                collapse-tags
                placeholder="绑定现有协议操作（可选）"
                style="width: 100%; margin-top: 8px"
                @update:model-value="
                  (value) =>
                    (node!.buttons = [
                      ...node!.buttons.filter((b) =>
                        STANDARD_BUTTONS.some((s) => s.code === b),
                      ),
                      ...value,
                    ])
                "
              >
                <ElOption
                  v-for="button in buttons"
                  :key="button.code"
                  :value="button.code"
                  :label="button.label"
                />
              </ElSelect>
            </ElFormItem>
            <div v-if="node.buttons.length" class="button-order">
              <div v-for="(button, i) in node.buttons" :key="button">
                <span>{{
                  STANDARD_BUTTONS.find((b) => b.code === button)?.label ||
                  buttons.find((b) => b.code === button)?.label ||
                  button
                }}</span><ElButton
                  link
                  :disabled="i === 0"
                  @click="
                    node.buttons.splice(i - 1, 0, node.buttons.splice(i, 1)[0]!)
                  "
                  >
上移
</ElButton><ElButton
                  link
                  :disabled="i === node.buttons.length - 1"
                  @click="
                    node.buttons.splice(i + 1, 0, node.buttons.splice(i, 1)[0]!)
                  "
                  >
下移
</ElButton>
              </div>
            </div>
            <div class="section-title">字段权限</div>
            <p class="help">
              这里只控制当前详情页和节点补充表单中已经存在的字段，不会创建新字段。办理节点默认可编辑，审批节点默认只读；模板只读、模块权限和角色限制优先。
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
/><ElOption
                  value="hidden"
                  label="隐藏"
/>
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
              title="当前页面没有可单独配置的字段；请先在详情页或节点补充表单中定义字段。"
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
                @click="
                  staleFieldAccess.forEach((key) => {
                    if (node?.fieldAccess) delete node.fieldAccess[key];
                  })
                "
              >
                移除失效字段权限
              </ElButton>
            </ElAlert>
            <div class="section-title">数据动作</div>
            <p class="help">
              目标只能选择当前节点真实存在且已接入存储的字段，来源可以选择流程中已定义的字段。系统动作会覆盖只读字段；失败则本次办理整单回滚。
              到达节点时修改经办人或协办人，只影响后续节点，不改变当前节点已经解析出的办理人。
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
                    (w) => w === 'arrive' || node?.buttons.includes(w),
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
                  typeof action.value === 'number' ? action.value : undefined
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
                  v-for="option in dataActionTarget(action.field)?.options ||
                  []"
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
            <div class="section-title">流转设置</div>
            <ElFormItem label="驳回范围">
<ElSelect v-model="node.rejectMode">
<ElOption label="上一办理节点" value="previous" /><ElOption
                  label="发起人填报节点"
                  value="initiator"
/><ElOption
                  label="指定上游节点（按驳回连线）"
                  value="specified"
              />
</ElSelect>
              <div class="help">
                需要在画布上绘制允许的驳回连线，校验时检查是否为上游节点。
              </div>
</ElFormItem>
            <ElFormItem label="驳回后重提交">
<ElSelect v-model="node.resubmitMode">
<ElOption label="回到驳回节点" value="return" /><ElOption
                  label="从退回节点重新流转"
                  value="restart"
/>
</ElSelect>
</ElFormItem>
            <ElFormItem label="允许撤回">
<ElSwitch v-model="node.allowRecall" /><span
                class="help"
                style="margin-left: 8px"
                >提交到下一节点且对方尚未办理（含未保存）时，本环节办理人可在详情页撤回</span>
</ElFormItem>
            <ElFormItem label="允许转办">
<ElSwitch
                :model-value="!!node.allowTransfer"
                @update:model-value="setAllowTransfer"
              /><span class="help" style="margin-left: 8px">当前办理人可以把待办转给其他有流程办理权限的人；转办后自己进入已办，对方成为新待办人</span>
</ElFormItem>
            <ElFormItem v-if="node.allowTransfer" label="转办后转回">
<ElSwitch
                :model-value="!!node.transferReturn"
                @update:model-value="node.transferReturn = !!$event"
              /><span class="help" style="margin-left: 8px">对方提交或通过后，待办回到转办人，由转办人再办理；驳回仍按驳回路径退回</span>
</ElFormItem>
            <div class="section-title">时限与提醒</div>
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
        <div v-if="outgoing.length" class="section-title">流出路径</div>
        <button
          v-for="line in outgoing"
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
/><ElOption
              label="条件分支"
              value="condition"
/>
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
            :disabled="optionsError"
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
          <div v-if="missingDefaultDetailView && !optionsError" class="warning">
            默认办理详情已失效，请重新选择。
          </div>
          <div v-else class="help">
            全流程只需在这里选择一次，人工节点默认继承。页面只决定协议详情的布局，不改变数据来源，也不使用列表列、查询条件和列表按钮。
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
{{
        node ? '删除节点' : '删除连线'
      }}
</ElButton>
    </div>
  </aside>
</template>

<style scoped>
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

.module-preview {
  padding: 10px;
  margin-top: 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 7px;
}

.module-preview-title {
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
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
  padding: 17px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.inspector-title b {
  font-size: 14px;
  font-weight: 600;
}

.inspector-body {
  flex: 1;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
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
</style>
