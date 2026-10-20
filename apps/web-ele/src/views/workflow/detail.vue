<script setup lang="ts">
import type {
  WorkflowActionInput,
  WorkflowContext,
} from '../../../../shared/workflow-runtime';

import type { AgreementDetail } from '#/views/biz/agreement/types';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  ElAlert,
  ElButton,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTabPane,
  ElTabs,
  ElTag,
  ElTimeline,
  ElTimelineItem,
  ElTooltip,
} from 'element-plus';

import {
  getWorkflowContext,
  submitWorkflowAction,
} from '#/api/workflow-runtime';

import { newId } from '../../../../shared/workflow';
import {
  ACTION_LABELS,
  BUSINESS_FIELDS,
  formatRemain,
  INSTANCE_STATUS_LABELS,
  WORKFLOW_FIELD_CATALOG,
} from '../../../../shared/workflow-runtime';
import AgreementPanel from './agreement-panel.vue';
import FieldControl from './field-control.vue';
import NodeForm from './node-form.vue';
import Trace from './trace.vue';
const route = useRoute();
const router = useRouter();
const context = ref<WorkflowContext>();
const data = ref<Record<string, unknown>>({});
const opinion = ref('');
const selectedButtonCode = ref('');
const loading = ref(false);
const saving = ref(false);
const snapshot = ref('');
const view = ref('form');
const stale = ref(false);
const rejectOpen = ref(false);
const target = ref('');
/** 转办弹窗：选择有流程办理权限的目标用户 */
const transferOpen = ref(false);
const transferTarget = ref('');
const agreeDirty = ref(false);
const agreePanel = ref<InstanceType<typeof AgreementPanel>>();
const nodeForm = ref<InstanceType<typeof NodeForm>>();
/** 实例绑定的协议详情；无绑定时办理页回退到四个头字段 */
const boundAgreement = computed(() => {
  const raw = context.value?.agreement;
  if (!raw || typeof raw !== 'object') return null;
  return raw as unknown as AgreementDetail;
});
/** 仅包含详情视图的节点嵌入协议模块；仅表单模式不渲染默认协议页面。 */
const showAgreementDetail = computed(
  () =>
    !!boundAgreement.value && context.value?.form.presentation !== 'formOnly',
);
/** 当前节点，用于把 fieldAccess 传给协议模块 */
const currentNode = computed(() =>
  context.value?.definition.nodes.find(
    (n) =>
      n.id ===
      (context.value?.viewNodeId ||
        context.value?.task?.nodeId ||
        context.value?.instance.currentNodeId),
  ),
);
const dirty = computed(
  () =>
    agreeDirty.value ||
    (JSON.stringify(data.value) !== snapshot.value && !!snapshot.value) ||
    !!opinion.value,
);
/** 从监控进入时回到监控页，否则回任务中心 */
/**
 * 待办人名最多列 3 个，再多只写人数。具体是谁看审批记录。
 * @param names 当前还没办的人
 */
function pendingText(names: string[]) {
  const list = [...new Set(names)];
  if (list.length === 0) return '';
  if (list.length <= 3) return `，待办：${list.join('、')}`;
  return `，待办 ${list.length} 人`;
}
/** 会签进度文案：全部通过、依次，或按百分比 */
function countersignTitle(sign: NonNullable<WorkflowContext['countersign']>) {
  const names = pendingText(sign.pendingNames);
  if (sign.mode === 'sequential')
    return `依次审批进度 ${sign.passed}/${sign.total}${names}`;
  if (sign.mode === 'ratio')
    return `比例会签 ${sign.passed}/${sign.required ?? sign.total}（${sign.percent ?? 50}%）${names}`;
  return `会签进度 ${sign.passed}/${sign.total}${names}`;
}
function backToList() {
  if (String(route.query.from || '') === 'monitor')
    void router.push('/system/workflow/monitor');
  else void router.push('/workflow');
}
const HEADER_KEYS = new Set(BUSINESS_FIELDS.map((f) => f.key));
/** 绑定协议后仍要展示的节点额外字段（如法务意见） */
const extraFields = computed(() =>
  (context.value?.form.fields || []).filter(
    (f) => !f.moduleKey && !HEADER_KEYS.has(f.key),
  ),
);
/** 已回写到协议、当前节点表单未列出的流程字段，供后续环节只读回看 */
const storedFlowFields = computed(() => {
  const stored = boundAgreement.value?.flowFields;
  if (!stored) return [];
  const shown = new Set(extraFields.value.map((f) => f.key));
  return Object.entries(stored)
    .filter(
      ([key, value]) =>
        !shown.has(key) &&
        value !== undefined &&
        value !== null &&
        value !== '',
    )
    .map(([key, value]) => ({
      key,
      label:
        WORKFLOW_FIELD_CATALOG.find((item) => item.key === key)?.label || key,
      value: String(value),
    }));
});
const nodeName = computed(
  () =>
    context.value?.definition.nodes.find(
      (n) =>
        n.id ===
        (context.value?.viewNodeId ||
          context.value?.task?.nodeId ||
          context.value?.instance.currentNodeId),
    )?.name,
);
/** 终止原因，供详情提示条展示 */
const terminateReason = computed(
  () =>
    [...(context.value?.instance.events || [])]
      .toReversed()
      .find((e) => e.action === 'terminate')?.opinion || '',
);
let sequence = 0;
let pendingRequest: undefined | { fingerprint: string; id: string };
function accept(result: WorkflowContext) {
  context.value = result;
  data.value = JSON.parse(JSON.stringify(result.instance.data));
  snapshot.value = JSON.stringify(data.value);
  opinion.value = '';
  pendingRequest = undefined;
  stale.value = false;
  agreeDirty.value = false;
  transferOpen.value = false;
  transferTarget.value = '';
}
async function load() {
  const current = ++sequence;
  loading.value = true;
  try {
    const result = await getWorkflowContext(String(route.params.id));
    if (current === sequence) accept(result);
  } catch {
  } finally {
    if (current === sequence) loading.value = false;
  }
}
async function reload() {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm(
        '刷新会丢弃本页未提交修改，是否继续？',
        '刷新任务',
      );
    } catch {
      return;
    }
  }
  await load();
}
function payload() {
  return Object.fromEntries(
    (context.value?.form.fields || [])
      .filter(
        (f) =>
          !(boundAgreement.value && (f.moduleKey || HEADER_KEYS.has(f.key))) &&
          !f.readonly &&
          !f.hidden &&
          !(
            f.type === 'table' &&
            f.children?.some((c) => c.hidden || c.readonly)
          ),
      )
      .map((f) => [f.key, data.value[f.key] ?? null]),
  );
}
/** 从协议正文投影流程头字段，供条件分流使用 */
function headerFromAgreement(detail: AgreementDetail) {
  const amount = Number(detail.basic?.amount);
  return {
    agreementNo: detail.agreementNo,
    compensatee: String(detail.basic?.compensatee || ''),
    houseAddress: String(
      detail.houses?.[0]?.address || detail.signing?.houseAddress || '',
    ),
    BuChangJinE: Number.isFinite(amount) ? amount : 0,
  };
}
async function submit(
  action: WorkflowActionInput['action'],
  buttonCode = selectedButtonCode.value || action,
) {
  const current = context.value;
  if (!current?.task || saving.value || stale.value) return;
  const configured = current.buttons.find(
    (button) => button.code === buttonCode && button.action === action,
  );
  if (!configured?.enabled) return;
  if (configured.requireOpinion && !opinion.value.trim()) {
    ElMessage.warning('请填写办理意见');
    return;
  }
  if (action === 'reject' && (!target.value || !opinion.value.trim())) {
    ElMessage.warning('请选择驳回目标并填写意见');
    return;
  }
  if (action === 'recall') {
    const recallBtn = current.buttons.find((b) => b.code === buttonCode);
    try {
      await ElMessageBox.confirm(
        configured.confirmText ||
          `确认${recallBtn?.label || '撤回'}？下一节点尚未办理的待办将被取消。`,
        '撤回确认',
        { type: 'warning' },
      );
    } catch {
      return;
    }
  }
  if (action === 'transfer' && !transferTarget.value) {
    ElMessage.warning('请选择转办人');
    return;
  }
  let agreementPayload: Record<string, any> | undefined;
  if (
    boundAgreement.value &&
    agreePanel.value &&
    ['pass', 'save', 'submit'].includes(action) &&
    current.agreementEditable
  ) {
    if (action !== 'save' && !(await agreePanel.value.validate())) {
      view.value = 'form';
      return;
    }
    agreementPayload = await agreePanel.value.collect();
    if (!current.detailView)
      Object.assign(
        data.value,
        headerFromAgreement(agreementPayload as AgreementDetail),
      );
  }
  if (['pass', 'submit'].includes(action)) {
    if (
      current.form.supplement &&
      nodeForm.value &&
      !(await nodeForm.value.validate())
    ) {
      ElMessage.warning('请完善节点表单');
      view.value = 'form';
      return;
    }
    const missing = current.form.fields.find(
      (f) =>
        !(boundAgreement.value && (f.moduleKey || HEADER_KEYS.has(f.key))) &&
        !f.hidden &&
        !f.readonly &&
        f.required &&
        (data.value[f.key] === undefined ||
          data.value[f.key] === null ||
          data.value[f.key] === ''),
    );
    if (missing) {
      ElMessage.warning(`请填写「${missing.label}」`);
      view.value = 'form';
      return;
    }
    try {
      await ElMessageBox.confirm(
        configured.confirmText ||
          (current.transferReturnName
            ? `确认${ACTION_LABELS[action]}？待办将转回${current.transferReturnName}审核，不会进入下一节点。`
            : `确认${ACTION_LABELS[action]}？成功后将流转到下一环节。`),
        '办理确认',
        { type: 'info' },
      );
    } catch {
      return;
    }
  }
  if (
    !['pass', 'recall', 'submit'].includes(action) &&
    configured.confirmText
  ) {
    try {
      await ElMessageBox.confirm(configured.confirmText, '办理确认', {
        type: 'warning',
      });
    } catch {
      return;
    }
  }
  const body = {
    taskId: current.task.id,
    revision: current.instance.revision,
    action,
    buttonCode,
    data: payload(),
    opinion: opinion.value,
    ...(agreementPayload ? { agreement: agreementPayload } : {}),
    ...(action === 'reject' ? { targetNodeId: target.value } : {}),
    ...(action === 'transfer' ? { targetUserId: transferTarget.value } : {}),
  };
  const fingerprint = JSON.stringify(body);
  if (pendingRequest?.fingerprint !== fingerprint)
    pendingRequest = { fingerprint, id: newId('action') };
  saving.value = true;
  try {
    const result = await submitWorkflowAction(current.instance.id, {
      ...body,
      requestId: pendingRequest?.id,
    });
    accept(result);
    rejectOpen.value = false;
    transferOpen.value = false;
    const returned = result.instance.events.at(-1);
    ElMessage.success(
      returned?.action === 'transferReturn'
        ? returned.opinion || '已转回原办理人审核'
        : result.instance.status === 'completed'
          ? '流程已完成'
          : `${ACTION_LABELS[action]}成功，当前节点：${result.definition.nodes.find((n) => n.id === result.instance.currentNodeId)?.name}`,
    );
  } catch (error: any) {
    if (error?.response?.status === 409 || error?.status === 409)
      stale.value = true;
  } finally {
    saving.value = false;
  }
}
function actionClick(code: string) {
  const button = context.value?.buttons.find((item) => item.code === code);
  if (!button) return;
  selectedButtonCode.value = code;
  if (button.action === 'reject') {
    target.value = context.value?.rejectTargets[0]?.id || '';
    rejectOpen.value = true;
  } else if (button.action === 'transfer') {
    transferTarget.value = context.value?.transferCandidates?.[0]?.id || '';
    transferOpen.value = true;
  } else void submit(button.action, code);
}
/** 跳转到绑定的协议详情，核对回写结果 */
function openAgreement() {
  const no =
    context.value?.instance.bizId || context.value?.instance.businessNo || '';
  if (!no) return;
  void router.push({
    name: 'BizAgreementDetail',
    params: { agreementNo: no },
    query: {
      mode: 'view',
      scene: 'entry',
      from: '流程办理',
      activePath: '/workflow',
    },
  });
}
async function mayLeave() {
  if (saving.value) return false;
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(
      '有未提交的资料或意见，离开将丢失修改。',
      '离开办理页',
      { type: 'warning' },
    );
    return true;
  } catch {
    return false;
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || saving.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onBeforeRouteLeave(mayLeave);
onBeforeRouteUpdate(mayLeave);
watch(
  () => route.params.id,
  () => {
    if (route.path.startsWith('/workflow/instances/')) {
      context.value = undefined;
      void load();
    }
  },
);
onMounted(() => {
  void load();
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  sequence++;
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>
<template>
  <Page auto-content-height>
    <div v-loading="loading" class="runtime-detail">
      <ElEmpty v-if="!context && !loading" description="实例加载失败或无权访问">
        <ElButton @click="load">重试</ElButton><ElButton @click="backToList">
          返回{{ route.query.from === 'monitor' ? '流程监控' : '任务中心' }}
        </ElButton>
      </ElEmpty>
      <template v-if="context">
        <header>
          <div>
            <ElButton text @click="backToList">
              ← 返回{{
                route.query.from === 'monitor' ? '流程监控' : '任务中心'
              }}
            </ElButton>
            <h1>{{ context.instance.title }}</h1>
            <p>
              {{ context.instance.businessNo }} ·
              {{ context.instance.definitionName }} · V{{
                context.instance.version
              }}
              · {{ context.instance.base }}
              <ElButton
                v-if="context.instance.bizId || context.instance.businessNo"
                link
                type="primary"
                @click="openAgreement"
              >
                打开协议详情
              </ElButton>
            </p>
          </div>
          <div class="status">
            <ElTag
              :type="
                context.instance.status === 'completed'
                  ? 'success'
                  : context.instance.status === 'suspended'
                    ? 'warning'
                    : context.instance.status === 'terminated'
                      ? 'info'
                      : 'primary'
              "
            >
              {{
                context.instance.status === 'running'
                  ? nodeName
                  : INSTANCE_STATUS_LABELS[context.instance.status] || nodeName
              }}
</ElTag><ElButton :disabled="saving" @click="reload">刷新</ElButton>
          </div>
        </header>
        <ElAlert
          v-if="stale"
          type="warning"
          title="任务版本已变化，请刷新查看最新结果。未提交内容仍保留。"
          :closable="false"
          style="margin: 12px 0"
        />
        <ElAlert
          v-else-if="context.instance.status === 'suspended'"
          type="warning"
          title="流程已挂起，办理暂停。管理员激活后原待办人可继续办理。"
          :closable="false"
          style="margin: 12px 0"
        />
        <ElAlert
          v-else-if="context.instance.status === 'terminated'"
          type="info"
          :title="
            terminateReason
              ? `流程已终止。原因：${terminateReason}`
              : '流程已终止'
          "
          :closable="false"
          style="margin: 12px 0"
        />
        <ElAlert
          v-if="context.sla?.status === 'overdue'"
          type="error"
          :title="`办理已超时（${formatRemain(context.sla.dueAt)}）`"
          :closable="false"
          style="margin: 12px 0"
        />
        <ElAlert
          v-else-if="context.sla?.status === 'dueSoon'"
          type="warning"
          :title="`即将到期（${formatRemain(context.sla.dueAt)}）`"
          :closable="false"
          style="margin: 12px 0"
        />
        <ElAlert
          v-else-if="!context.canAct && context.instance.status === 'running'"
          type="info"
          title="您正在查看只读资料。"
          :closable="false"
          style="margin: 12px 0"
        />
        <ElAlert
          v-if="context.transferReturnName"
          type="warning"
          :closable="false"
          :title="`办完后将转回${context.transferReturnName}审核，不会进入下一节点。驳回仍按驳回路径退回。`"
          style="margin: 12px 0"
        />
        <ElAlert
          v-if="context.countersign"
          type="info"
          :title="countersignTitle(context.countersign)"
          :closable="false"
          style="margin: 12px 0"
        />
        <div
          class="content-grid"
          :class="{
            'single-column':
              !context.canAct &&
              !context.buttons.some((button) => button.action === 'recall'),
          }"
        >
          <section>
            <ElTabs v-model="view">
              <ElTabPane label="办理资料" name="form">
                <div class="form-header">
                  <h2>
                    {{ showAgreementDetail ? '协议资料' : context.form.title }}
                  </h2>
                  <span>{{
                    context.canAct
                      ? showAgreementDetail
                        ? context.agreementEditable
                          ? '按当前节点编辑协议，保存/提交后回写'
                          : '按本节点资料权限查看，可填写意见后通过或驳回'
                        : '填写当前节点办理表单，保存或提交后进入后续环节'
                      : '只读视图'
                  }}</span>
                </div>
                <AgreementPanel
                  v-if="showAgreementDetail && boundAgreement"
                  :key="`${context.instance.id}:${context.viewNodeId}:${context.instance.revision}`"
                  ref="agreePanel"
                  :detail="boundAgreement"
                  :editable="!!context.agreementEditable && !saving && !stale"
                  :field-access="currentNode?.fieldAccess"
                  :detail-view="context.detailView"
                  @dirty="agreeDirty = true"
                />
                <div v-if="boundAgreement && extraFields.length">
                  <div class="form-header" style="margin-top: 8px">
                    <h2>
                      {{
                        showAgreementDetail ? '节点补充表单' : '节点办理表单'
                      }}
                    </h2>
                    <span>按当前节点字段权限填写，审批默认可写已设为「可编辑」的项</span>
                  </div>
                  <NodeForm
                    v-if="context.form.supplement"
                    ref="nodeForm"
                    v-model="data"
                    :schema="context.form.supplement"
                    :fields="extraFields"
                    :disabled="!context.canAct || saving || stale"
                  />
                  <ElForm
                    v-else
                    label-position="top"
                    :disabled="saving || stale"
                    @submit.prevent
                  >
                    <div class="field-grid">
                      <ElFormItem
                        v-for="field in extraFields"
                        :key="`${context.instance.currentNodeId}:${field.key}`"
                        :label="field.label"
                        :required="field.required && !field.readonly"
                        :class="{
                          wide: ['table', 'textarea'].includes(field.type),
                        }"
                      >
                        <FieldControl
                          :field="field"
                          :model-value="data[field.key]"
                          :disabled="
                            field.readonly || !context.canAct || saving || stale
                          "
                          @update:model-value="data[field.key] = $event"
                        />
                      </ElFormItem>
                    </div>
                  </ElForm>
                </div>
                <ElForm
                  v-if="
                    showAgreementDetail &&
                    boundAgreement &&
                    storedFlowFields.length
                  "
                  label-position="top"
                  disabled
                >
                  <div class="form-header" style="margin-top: 8px">
                    <h2>已填流程字段</h2>
                    <span>前置节点已回写到协议，当前只读</span>
                  </div>
                  <div class="field-grid">
                    <ElFormItem
                      v-for="item in storedFlowFields"
                      :key="item.key"
                      :label="item.label"
                      class="wide"
                    >
                      <ElInput
                        type="textarea"
                        :rows="3"
                        :model-value="item.value"
                      />
                    </ElFormItem>
                  </div>
                </ElForm>
                <NodeForm
                  v-if="!boundAgreement && context.form.supplement"
                  ref="nodeForm"
                  v-model="data"
                  :schema="context.form.supplement"
                  :fields="context.form.fields"
                  :disabled="!context.canAct || saving || stale"
                />
                <ElForm
                  v-else-if="!boundAgreement"
                  label-position="top"
                  :disabled="saving || stale"
                  @submit.prevent
                >
                  <div class="field-grid">
                    <ElFormItem
                      v-for="field in context.form.fields"
                      :key="`${context.instance.currentNodeId}:${field.key}`"
                      :label="field.label"
                      :required="field.required && !field.readonly"
                      :class="{
                        wide: ['table', 'textarea'].includes(field.type),
                      }"
                    >
                      <FieldControl
                        :field="field"
                        :model-value="data[field.key]"
                        :disabled="!context.canAct || saving || stale"
                        @update:model-value="data[field.key] = $event"
                      />
                    </ElFormItem>
                  </div>
</ElForm><ElEmpty
                  v-if="!boundAgreement && !context.form.fields.length"
                  description="当前无可见字段"
                />
              </ElTabPane>
              <ElTabPane label="流程图" name="graph">
                <Trace :context="context" />
                <div class="approval-history">
                  <h2>审批记录</h2>
                  <p class="timeline-note">
                    发起人：{{ context.instance.initiatorName }}
                  </p>
                  <ElTimeline>
                    <ElTimelineItem
                      v-for="event in [...context.instance.events].reverse()"
                      :key="event.id"
                      :timestamp="
                        new Date(event.at).toLocaleString('zh-CN', {
                          hour12: false,
                        })
                      "
                      placement="top"
                      :type="
                        event.action === 'reject' ||
                        event.action === 'recall' ||
                        event.action === 'terminate'
                          ? 'danger'
                          : event.action === 'transfer' ||
                              event.action === 'transferReturn' ||
                              event.action === 'suspend' ||
                              event.action === 'urge' ||
                              event.action === 'reassign'
                            ? 'warning'
                            : event.action === 'end' ||
                                event.action === 'resume'
                              ? 'success'
                              : 'primary'
                      "
                    >
                      <b>{{ event.nodeName }} ·
                        {{ ACTION_LABELS[event.action] }}</b>
                      <p>{{ event.actorName }}</p>
                      <div v-if="event.opinion" class="opinion">
                        {{ event.opinion }}
                      </div>
                    </ElTimelineItem>
                  </ElTimeline>
                </div>
              </ElTabPane>
            </ElTabs>
          </section>
          <aside
            v-if="
              context.canAct ||
              context.buttons.some((button) => button.action === 'recall')
            "
            class="opinion-panel"
          >
            <h2>办理意见</h2>
            <div
              v-if="
                context.buttons.some((button) => button.placement === 'top')
              "
              class="actions top-actions"
            >
              <ElTooltip
                v-for="button in context.buttons.filter(
                  (item) => item.placement === 'top',
                )"
                :key="button.code"
                :content="button.reason || ''"
                :disabled="button.enabled"
              >
                <span>
                  <ElButton
                    :type="button.style || 'default'"
                    :plain="
                      button.style === 'danger' || button.style === 'warning'
                    "
                    :disabled="!button.enabled || stale"
                    :loading="saving"
                    @click="actionClick(button.code)"
                    >{{ button.label }}</ElButton>
                </span>
              </ElTooltip>
            </div>
            <ElInput
              v-model="opinion"
              type="textarea"
              :rows="6"
              maxlength="2000"
              :disabled="saving || stale"
              placeholder="填写办理意见；驳回时必填"
            />
            <div class="actions">
              <span v-if="dirty" class="dirty-note">有未提交修改</span>
              <ElTooltip
                v-for="button in context.buttons.filter(
                  (item) => item.placement !== 'top',
                )"
                :key="button.code"
                :content="button.reason || ''"
                :disabled="button.enabled"
              >
                <span>
                  <ElButton
                    :type="button.style || 'default'"
                    :plain="
                      button.style === 'danger' || button.style === 'warning'
                    "
                    :disabled="!button.enabled || stale"
                    :loading="saving"
                    @click="actionClick(button.code)"
                    >{{ button.label }}</ElButton>
                </span>
              </ElTooltip>
            </div>
          </aside>
        </div>
        <ElDialog
          v-model="rejectOpen"
          title="驳回流程"
          width="500px"
          :close-on-click-modal="false"
          :show-close="!saving"
          :close-on-press-escape="!saving"
        >
          <ElForm label-position="top" :disabled="saving">
            <ElFormItem label="退回节点" required>
              <ElSelect v-model="target" style="width: 100%">
                <ElOption
                  v-for="item in context.rejectTargets"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </ElSelect>
</ElFormItem><ElFormItem label="驳回意见" required>
              <ElInput
                v-model="opinion"
                type="textarea"
                :rows="4"
                maxlength="2000"
              />
            </ElFormItem>
            <p class="timeline-note">
              退回人修改后，将按节点配置重新提交。
            </p>
</ElForm><template #footer>
            <ElButton :disabled="saving" @click="rejectOpen = false">
              取消
</ElButton><ElButton
              type="danger"
              :loading="saving"
              @click="submit('reject')"
            >
              确认驳回
            </ElButton>
          </template>
        </ElDialog>
        <ElDialog
          v-model="transferOpen"
          title="转办"
          width="500px"
          :close-on-click-modal="false"
          :show-close="!saving"
          :close-on-press-escape="!saving"
        >
          <ElForm label-position="top" :disabled="saving">
            <ElFormItem label="转办给" required>
              <ElSelect
                v-model="transferTarget"
                filterable
                style="width: 100%"
                placeholder="选择有流程办理权限的人"
              >
                <ElOption
                  v-for="item in context.transferCandidates || []"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </ElSelect>
</ElFormItem><ElFormItem label="转办说明（选填）">
              <ElInput
                v-model="opinion"
                type="textarea"
                :rows="4"
                maxlength="2000"
                placeholder="会写入审批记录，对方可在记录中看到"
              />
            </ElFormItem>
            <p class="timeline-note">
              转办后本待办进入你的已办，由对方继续办理；本页未保存的协议修改不会带给对方。
            </p>
            <p v-if="context.transferReturnName" class="timeline-note">
              本单办完后仍转回{{
                context.transferReturnName
              }}审核，再次转办也不会改掉转回对象。
            </p>
            <p v-else-if="context.transferWillReturn" class="timeline-note">
              本节点要求转办后转回：对方提交或通过后，待办会回到你，由你再办理。
            </p>
</ElForm><template #footer>
            <ElButton :disabled="saving" @click="transferOpen = false">
              取消
</ElButton><ElButton
              type="warning"
              :loading="saving"
              :disabled="!transferTarget"
              @click="submit('transfer')"
            >
              确认转办
            </ElButton>
          </template>
        </ElDialog>
      </template>
    </div>
  </Page>
</template>
<style scoped>
.runtime-detail {
  min-height: 500px;
  color: var(--el-text-color-primary);
}

header {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

h1 {
  margin: 8px 0;
  font-size: 23px;
  font-weight: 600;
}

header p {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.status {
  display: flex;
  gap: 12px;
  align-items: center;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  margin-top: 18px;
}

.content-grid.single-column {
  grid-template-columns: minmax(0, 1fr);
}

section,
aside {
  min-width: 0;
  padding: 22px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

h2 {
  font-size: 15px;
  font-weight: 600;
}

.form-header {
  display: flex;
  justify-content: space-between;
  margin: 14px 0 16px;
}

.form-header span,
.timeline-note {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
}

.wide {
  grid-column: 1 / -1;
}

.approval-history {
  padding-top: 22px;
  margin-top: 18px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.approval-history b {
  font-size: 12px;
}

.approval-history p {
  margin-top: 7px;
  font-size: 11px;
}

.opinion-panel h2 {
  margin-bottom: 16px;
}

.opinion-panel .actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: flex-start;
  margin-top: 16px;
}

.opinion-panel .top-actions {
  margin: 0 0 16px;
}

.opinion-panel .dirty-note {
  flex-basis: 100%;
  font-size: 11px;
  color: var(--el-color-warning);
}

.timeline-note {
  margin: 10px 0 24px;
}

.opinion {
  padding: 9px;
  margin-top: 8px;
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}

@media (max-width: 1100px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  aside {
    max-height: none;
  }
}
</style>
