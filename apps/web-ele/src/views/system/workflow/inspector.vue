<script setup lang="ts">
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
  WorkflowOptions,
} from './model';
import { computed, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
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
import {
  CATEGORIES,
  DATA_ACTION_KIND_LABELS,
  DATA_ACTION_KINDS,
  DATA_ACTION_WHEN_LABELS,
  DATA_ACTION_WHENS,
  NODE_LABELS,
  STANDARD_BUTTONS,
  WORKFLOW_FIELD_CATALOG,
  WORKFLOW_PERSON_FIELDS,
} from './model';

const props = defineProps<{
  document: WorkflowDocument;
  readOnly?: boolean;
  node?: WorkflowNode;
  edge?: WorkflowEdge;
  options: WorkflowOptions;
  optionsError: boolean;
  buttons: { code: string; label: string }[];
}>();
const emit = defineEmits<{
  remove: [];
  duplicate: [];
  retry: [];
  selectEdge: [id: string];
}>();
const fieldKey = ref('');
/** 从目录或手输标识追加一条字段权限，默认只读 */
function addFieldAccess() {
  const key = fieldKey.value.trim();
  if (
    !props.node ||
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
function setAllowTransfer(enabled: boolean | string | number) {
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
    field: '',
    value: '',
    from: '',
  });
}
const human = computed(
  () => props.node && ['task', 'approve', 'cc'].includes(props.node.type),
);
/** 办理人策略对应的候选列表：角色 / 人员 / 部门 */
const candidates = computed(() => {
  switch (props.node?.assignee.type) {
    case 'role':
      return props.options.roles;
    case 'user':
      return props.options.users;
    case 'departmentLeader':
      return props.options.departments;
    default:
      return [];
  }
});
const selectedForm = computed({
  get: () =>
    props.node?.form.id ? `${props.node.form.type}:${props.node.form.id}` : '',
  set: (value: string) => {
    if (!props.node) return;
    const split = value.indexOf(':');
    props.node.form = value
      ? {
          type: value.slice(0, split) as 'form' | 'page',
          id: value.slice(split + 1),
        }
      : { type: 'page', id: '' };
  },
});
const missingForm = computed(
  () =>
    props.node?.form.id &&
    !props.options.views.some(
      (v) => v.id === props.node?.form.id && v.type === props.node.form.type,
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
/** 字段目录分组（协议头 / 节点字段） */
const catalogGroups = computed(() => [
  ...new Set(WORKFLOW_FIELD_CATALOG.map((item) => item.group)),
]);
/** 字段权限行展示名 */
function fieldAccessLabel(key: string) {
  return WORKFLOW_FIELD_CATALOG.find((item) => item.key === key)?.label || key;
}
</script>

<template>
  <aside class="inspector">
    <div class="inspector-title">
      <b>{{ node ? '节点属性' : edge ? '连线属性' : '流程属性' }}</b
      ><ElTag v-if="node" size="small" effect="plain">{{
        NODE_LABELS[node.type]
      }}</ElTag
      ><ElTag v-else-if="edge" size="small" effect="plain">{{
        edge.type === 'reject' ? '驳回路径' : '流转路径'
      }}</ElTag>
    </div>
    <div class="inspector-body">
      <ElAlert
        v-if="optionsError"
        type="warning"
        :closable="false"
        title="可选资源加载失败，已保存的绑定仍保留。"
        ><ElButton link type="primary" @click="emit('retry')"
          >重新加载</ElButton
        ></ElAlert
      >
      <ElForm
        v-if="node"
        label-position="top"
        :disabled="readOnly"
        size="small"
        @submit.prevent
      >
        <ElFormItem label="节点名称" required
          ><ElInput v-model="node.name" maxlength="60"
        /></ElFormItem>
        <ElFormItem label="节点编码" required
          ><ElInput v-model="node.code" maxlength="80" />
          <div class="help">流程内唯一，建议使用 N_序号。</div></ElFormItem
        >
        <ElFormItem label="说明"
          ><ElInput
            v-model="node.description"
            type="textarea"
            :rows="2"
            maxlength="500"
        /></ElFormItem>
        <template v-if="human">
          <div class="section-title">
            {{ node.type === 'cc' ? '抄送人' : '办理人' }}
          </div>
          <ElFormItem
            :label="node.type === 'cc' ? '抄送人策略' : '办理人策略'"
            required
            ><ElSelect
              v-model="node.assignee.type"
              @change="
                node.assignee.ids = [];
                node.assignee.field = '';
              "
              ><ElOption label="指定角色" value="role" /><ElOption
                label="指定人员"
                value="user" /><ElOption
                label="指定部门负责人"
                value="departmentLeader" /><ElOption
                label="发起人本人"
                value="initiator" /><ElOption
                label="表单字段取人"
                value="field" /></ElSelect
          ></ElFormItem>
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
            ><ElSelect
              v-model="node.assignee.field"
              placeholder="选择协议上的人员字段"
              style="width: 100%"
              ><ElOption
                v-for="item in WORKFLOW_PERSON_FIELDS"
                :key="item.key"
                :label="item.label"
                :value="item.key"
            /></ElSelect>
            <div class="help">
              运行时读取协议上该字段的用户
              ID，待办落在这些有办理权限的人身上。多人用逗号或顿号分隔。字段为空或人员无效时，本次提交回滚。
            </div></ElFormItem
          >
          <ElFormItem v-if="node.type === 'approve'" label="办理方式"
            ><ElSelect
              :model-value="node.approveMode || 'any'"
              @update:model-value="setApproveMode($event)"
              ><ElOption label="任一人通过即可" value="any" /><ElOption
                label="会签（全部通过）"
                value="all" /><ElOption
                label="依次审批"
                value="sequential" /><ElOption label="比例会签" value="ratio"
            /></ElSelect>
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
            </div></ElFormItem
          >
          <ElAlert
            v-if="node.type === 'cc'"
            type="info"
            :closable="false"
            title="到达本节点后立即通知抄送人，不产生待办，流程沿通过连线继续。被抄送人可在「抄送给我」中查看。"
          />
          <template v-if="node.type !== 'cc'">
            <div class="section-title">表单与按钮</div>
            <ElFormItem label="绑定表单视图">
              <ElSelect
                v-model="selectedForm"
                clearable
                filterable
                :disabled="optionsError"
                placeholder="选择现有页面或表单模板"
                style="width: 100%"
              >
                <ElOptionGroup label="页面配置"
                  ><ElOption
                    v-for="view in options.views.filter(
                      (v) => v.type === 'page',
                    )"
                    :key="`page:${view.id}`"
                    :value="`page:${view.id}`"
                    :label="view.name"
                /></ElOptionGroup>
                <ElOptionGroup label="FormCreate 模板"
                  ><ElOption
                    v-for="view in options.views.filter(
                      (v) => v.type === 'form',
                    )"
                    :key="`form:${view.id}`"
                    :value="`form:${view.id}`"
                    :label="view.name"
                /></ElOptionGroup>
                <ElOption
                  v-if="missingForm"
                  :value="selectedForm"
                  :label="`已失效或不可用：${node.form.id}`"
                  disabled
                />
              </ElSelect>
              <div v-if="missingForm && !optionsError" class="warning">
                绑定的视图已失效，请重新选择。
              </div>
              <div class="help">
                未绑定时使用默认协议资料。发布会冻结受支持的静态表单；复杂模块或脚本将提示适配问题。
              </div>
            </ElFormItem>
            <ElFormItem label="节点按钮">
              <p class="help">
                可发布保存、提交、通过、驳回。撤回、转办由下方开关控制，不会出现在节点按钮勾选里。节点按钮与菜单权限无关，由办理人身份决定能否点击。
              </p>
              <ElCheckboxGroup v-model="node.buttons" class="standard-buttons"
                ><ElCheckbox
                  v-for="button in STANDARD_BUTTONS"
                  :key="button.code"
                  :value="button.code"
                  >{{ button.label }}</ElCheckbox
                ></ElCheckboxGroup
              >
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
                }}</span
                ><ElButton
                  link
                  :disabled="i === 0"
                  @click="
                    node.buttons.splice(i - 1, 0, node.buttons.splice(i, 1)[0]!)
                  "
                  >上移</ElButton
                ><ElButton
                  link
                  :disabled="i === node.buttons.length - 1"
                  @click="
                    node.buttons.splice(i + 1, 0, node.buttons.splice(i, 1)[0]!)
                  "
                  >下移</ElButton
                >
              </div>
            </div>
            <div class="section-title">字段权限</div>
            <p class="help">
              办理节点默认可编辑，审批节点默认只读。把「法务意见」设为可编辑后，法务复核即可只改该字段。模板只读和角色限制优先。
            </p>
            <div
              v-for="(_, key) in node.fieldAccess"
              :key="key"
              style="display: flex; gap: 6px; margin: 8px 0"
            >
              <span
                style=" width: 95px;font-size: 11px; overflow-wrap: anywhere"
                >{{ fieldAccessLabel(key) }}</span
              ><ElSelect v-model="node.fieldAccess![key]" style="flex: 1"
                ><ElOption value="edit" label="可编辑" /><ElOption
                  value="readonly"
                  label="只读" /><ElOption
                  value="hidden"
                  label="隐藏" /></ElSelect
              ><ElButton
                link
                type="danger"
                @click="delete node.fieldAccess![key]"
                >移除</ElButton
              >
            </div>
            <div style="display: flex; gap: 6px">
              <ElSelect
                v-model="fieldKey"
                filterable
                allow-create
                default-first-option
                placeholder="选择字段或输入标识"
                style="flex: 1"
              >
                <ElOptionGroup
                  v-for="group in catalogGroups"
                  :key="group"
                  :label="group"
                >
                  <ElOption
                    v-for="item in WORKFLOW_FIELD_CATALOG.filter(
                      (c) => c.group === group,
                    )"
                    :key="item.key"
                    :label="`${item.label}（${item.key}）`"
                    :value="item.key"
                  />
                </ElOptionGroup>
              </ElSelect>
              <ElButton @click="addFieldAccess">添加</ElButton>
            </div>
            <div class="section-title">数据动作</div>
            <p class="help">
              到达本节点或点击保存/提交/通过时，给字段赋固定值或抄另一字段。不支持公式；失败则本次办理整单回滚。
            </p>
            <div
              v-for="(action, i) in node.dataActions || []"
              :key="i"
              class="data-action"
            >
              <ElSelect v-model="action.when" style="width: 110px"
                ><ElOption
                  v-for="when in DATA_ACTION_WHENS.filter(
                    (w) => w === 'arrive' || node.buttons.includes(w),
                  )"
                  :key="when"
                  :label="DATA_ACTION_WHEN_LABELS[when]"
                  :value="when"
              /></ElSelect>
              <ElSelect v-model="action.kind" style="width: 110px"
                ><ElOption
                  v-for="kind in DATA_ACTION_KINDS"
                  :key="kind"
                  :label="DATA_ACTION_KIND_LABELS[kind]"
                  :value="kind"
              /></ElSelect>
              <ElSelect
                v-model="action.field"
                filterable
                allow-create
                default-first-option
                placeholder="目标字段"
                style="flex: 1"
              >
                <ElOptionGroup
                  v-for="group in catalogGroups"
                  :key="group"
                  :label="group"
                >
                  <ElOption
                    v-for="item in WORKFLOW_FIELD_CATALOG.filter(
                      (c) => c.group === group,
                    )"
                    :key="item.key"
                    :label="`${item.label}（${item.key}）`"
                    :value="item.key"
                  />
                </ElOptionGroup>
              </ElSelect>
              <ElInput
                v-if="action.kind === 'set'"
                v-model="action.value"
                placeholder="固定值"
                maxlength="2000"
                style="flex: 1"
              />
              <ElSelect
                v-else
                v-model="action.from"
                filterable
                allow-create
                default-first-option
                placeholder="来源字段"
                style="flex: 1"
              >
                <ElOptionGroup
                  v-for="group in catalogGroups"
                  :key="group"
                  :label="group"
                >
                  <ElOption
                    v-for="item in WORKFLOW_FIELD_CATALOG.filter(
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
                >移除</ElButton
              >
            </div>
            <ElButton
              style="margin-top: 8px"
              :disabled="(node.dataActions?.length || 0) >= 20"
              @click="addDataAction"
              >添加数据动作</ElButton
            >
            <div class="section-title">流转设置</div>
            <ElFormItem label="驳回范围"
              ><ElSelect v-model="node.rejectMode"
                ><ElOption label="上一办理节点" value="previous" /><ElOption
                  label="发起人填报节点"
                  value="initiator" /><ElOption
                  label="指定上游节点（按驳回连线）"
                  value="specified"
              /></ElSelect>
              <div class="help">
                需要在画布上绘制允许的驳回连线，校验时检查是否为上游节点。
              </div></ElFormItem
            >
            <ElFormItem label="驳回后重提交"
              ><ElSelect v-model="node.resubmitMode"
                ><ElOption label="回到驳回节点" value="return" /><ElOption
                  label="从退回节点重新流转"
                  value="restart" /></ElSelect
            ></ElFormItem>
            <ElFormItem label="允许撤回"
              ><ElSwitch v-model="node.allowRecall" /><span
                class="help"
                style="margin-left: 8px"
                >提交到下一节点且对方尚未办理（含未保存）时，本环节办理人可在详情页撤回</span
              ></ElFormItem
            >
            <ElFormItem label="允许转办"
              ><ElSwitch
                :model-value="!!node.allowTransfer"
                @update:model-value="setAllowTransfer"
              /><span class="help" style="margin-left: 8px"
                >当前办理人可以把待办转给其他有流程办理权限的人；转办后自己进入已办，对方成为新待办人</span
              ></ElFormItem
            >
            <ElFormItem v-if="node.allowTransfer" label="转办后转回"
              ><ElSwitch
                :model-value="!!node.transferReturn"
                @update:model-value="node.transferReturn = !!$event"
              /><span class="help" style="margin-left: 8px"
                >对方提交或通过后，待办回到转办人，由转办人再办理；驳回仍按驳回路径退回</span
              ></ElFormItem
            >
            <div class="section-title">时限与提醒</div>
            <ElFormItem label="办理时限（小时）"
              ><ElInputNumber
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
              /><span class="help" style="margin-left: 8px"
                >0 表示不限。按自然小时，24 即 1
                个自然日；不支持工作日历。</span
              ></ElFormItem
            >
            <ElFormItem label="临期提醒（小时）"
              ><ElInputNumber
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
              /><span class="help" style="margin-left: 8px"
                >截止前多少小时通知办理人。须小于办理时限。</span
              ></ElFormItem
            >
            <ElFormItem label="超时策略"
              ><ElSelect
                :model-value="node.sla?.overtime || 'remind'"
                :disabled="!node.sla?.durationHours"
                style="width: 220px"
                @update:model-value="
                  node.sla = { ...node.sla, overtime: $event }
                "
                ><ElOption label="仅提醒（默认）" value="remind" /><ElOption
                  label="催办（写催办记录并通知）"
                  value="urge"
              /></ElSelect>
              <div class="help">
                超时只提醒或催办，不会自动通过。挂起期间暂停计时。
              </div></ElFormItem
            >
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
          <ElFormItem label="调用已发布流程" required
            ><ElSelect
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
            </div></ElFormItem
          >
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
          }}</span
          ><span
            >→
            {{
              document.nodes.find((n) => n.id === line.target)?.name ||
              '目标丢失'
            }}</span
          >
        </button>
      </ElForm>
      <ElForm
        v-else-if="edge"
        label-position="top"
        :disabled="readOnly"
        size="small"
        @submit.prevent
      >
        <ElFormItem label="连线名称"
          ><ElInput
            v-model="edge.label"
            maxlength="80"
            placeholder="例如：通过 / 金额达标 / 驳回"
        /></ElFormItem>
        <ElFormItem label="流转类型"
          ><ElSelect
            v-model="edge.type"
            @change="
              edge.isDefault = false;
              edge.condition = '';
            "
            ><ElOption label="通过" value="pass" /><ElOption
              label="驳回（红色虚线）"
              value="reject" /><ElOption
              label="条件分支"
              value="condition" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="来源节点"
          ><ElSelect v-model="edge.source" filterable
            ><ElOption
              v-for="item in document.nodes"
              :key="item.id"
              :label="item.name"
              :value="item.id" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="目标节点"
          ><ElSelect v-model="edge.target" filterable
            ><ElOption
              v-for="item in document.nodes.filter(
                (n) => n.id !== edge!.source,
              )"
              :key="item.id"
              :label="item.name"
              :value="item.id" /></ElSelect
        ></ElFormItem>
        <template v-if="edge.type === 'condition'">
          <ElFormItem label="“否则”兜底分支"
            ><ElSwitch v-model="edge.isDefault" @change="edge.condition = ''"
          /></ElFormItem>
          <ElFormItem v-if="!edge.isDefault" label="条件表达式" required
            ><ElInput
              v-model="edge.condition"
              type="textarea"
              :rows="4"
              maxlength="1000"
              placeholder="例如：BuChangJinE >= 1000000"
            />
            <div class="help">
              第一阶段保存表达式并检查是否填写或重复；表达式语义与互斥性由后续服务端校验。
            </div></ElFormItem
          >
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
        <ElFormItem label="流程名称" required
          ><ElInput v-model="document.name" maxlength="80"
        /></ElFormItem>
        <ElFormItem label="流程编码" required
          ><ElInput v-model="document.code" maxlength="80"
        /></ElFormItem>
        <ElFormItem label="所属基地编码" required
          ><ElInput v-model="document.base" maxlength="80"
        /></ElFormItem>
        <ElFormItem label="业务分类"
          ><ElSelect v-model="document.category"
            ><ElOption
              v-for="item in CATEGORIES"
              :key="item"
              :value="item"
              :label="item" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="绑定业务表" required
          ><ElInput v-model="document.businessTable" maxlength="80"
        /></ElFormItem>
        <ElFormItem label="流程说明"
          ><ElInput
            v-model="document.description"
            type="textarea"
            maxlength="500"
            :rows="4"
        /></ElFormItem>
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
        >复制节点</ElButton
      ><ElButton size="small" type="danger" plain @click="emit('remove')">{{
        node ? '删除节点' : '删除连线'
      }}</ElButton>
    </div>
  </aside>
</template>

<style scoped>
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
