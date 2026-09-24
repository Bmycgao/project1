<script setup lang="ts">
import type {
  WorkflowActionInput,
  WorkflowContext,
} from '../../../../shared/workflow-runtime';
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
  INSTANCE_STATUS_LABELS,
  formatRemain,
  WORKFLOW_FIELD_CATALOG,
} from '../../../../shared/workflow-runtime';
import type { AgreementDetail } from '#/views/biz/agreement/types';
import FieldControl from './field-control.vue';
import AgreementPanel from './agreement-panel.vue';
import Trace from './trace.vue';
const route = useRoute();
const router = useRouter();
const context = ref<WorkflowContext>();
const data = ref<Record<string, unknown>>({});
const opinion = ref('');
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
/** 实例绑定的协议详情；无绑定时办理页回退到四个头字段 */
const boundAgreement = computed(() => {
  const raw = context.value?.agreement;
  if (!raw || typeof raw !== 'object') return null;
  return raw as AgreementDetail;
});
/** 当前节点，用于把 fieldAccess 传给协议模块 */
const currentNode = computed(() =>
  context.value?.definition.nodes.find(
    (n) => n.id === context.value?.instance.currentNodeId,
  ),
);
const dirty = computed(
  () =>
    agreeDirty.value ||
    (JSON.stringify(data.value) !== snapshot.value && !!snapshot.value) ||
    !!opinion.value,
);
/** 从监控进入时回到监控页，否则回任务中心 */
/** 会签进度文案：全部通过、依次，或按百分比 */
function countersignTitle(sign: NonNullable<WorkflowContext['countersign']>) {
  const names = sign.pendingNames.length
    ? `，待办：${sign.pendingNames.join('、')}`
    : '';
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
  (context.value?.form.fields || []).filter((f) => !HEADER_KEYS.has(f.key)),
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
      (n) => n.id === context.value?.instance.currentNodeId,
    )?.name,
);
/** 终止原因，供详情提示条展示 */
const terminateReason = computed(
  () =>
    [...(context.value?.instance.events || [])]
      .reverse()
      .find((e) => e.action === 'terminate')?.opinion || '',
);
let sequence = 0;
let pendingRequest: { fingerprint: string; id: string } | undefined;
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
async function submit(action: WorkflowActionInput['action']) {
  const current = context.value;
  if (!current?.task || saving.value || stale.value) return;
  if (action === 'reject' && (!target.value || !opinion.value.trim())) {
    ElMessage.warning('请选择驳回目标并填写意见');
    return;
  }
  if (action === 'recall') {
    const recallBtn = current.buttons.find((b) => b.code === 'recall');
    try {
      await ElMessageBox.confirm(
        `确认${recallBtn?.label || '撤回'}？下一节点尚未办理的待办将被取消。`,
        '撤回确认',
        { type: 'warning' },
      );
    } catch {
      return;
    }
  }
  if (action === 'transfer') {
    if (!transferTarget.value) {
      ElMessage.warning('请选择转办人');
      return;
    }
  }
  let agreementPayload: AgreementDetail | undefined;
  if (boundAgreement.value && agreePanel.value) {
    if (['save', 'submit'].includes(action) && current.agreementEditable) {
      if (!(await agreePanel.value.validate())) {
        view.value = 'form';
        return;
      }
      agreementPayload = await agreePanel.value.collect();
      Object.assign(data.value, headerFromAgreement(agreementPayload));
    }
  }
  if (['submit', 'pass'].includes(action)) {
    const missing = current.form.fields.find(
      (f) =>
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
        current.transferReturnName
          ? `确认${ACTION_LABELS[action]}？待办将转回${current.transferReturnName}审核，不会进入下一节点。`
          : `确认${ACTION_LABELS[action]}？成功后将流转到下一环节。`,
        '办理确认',
        { type: 'info' },
      );
    } catch {
      return;
    }
  }
  const body = {
    taskId: current.task.id,
    revision: current.instance.revision,
    action,
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
      requestId: pendingRequest!.id,
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
  if (code === 'reject') {
    target.value = context.value?.rejectTargets[0]?.id || '';
    rejectOpen.value = true;
  } else if (code === 'transfer') {
    transferTarget.value = context.value?.transferCandidates?.[0]?.id || '';
    transferOpen.value = true;
  } else void submit(code as WorkflowActionInput['action']);
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
      <ElEmpty v-if="!context && !loading" description="实例加载失败或无权访问"
        ><ElButton @click="load">重试</ElButton
        ><ElButton @click="backToList"
          >返回{{
            route.query.from === 'monitor' ? '流程监控' : '任务中心'
          }}</ElButton
        ></ElEmpty
      >
      <template v-if="context">
        <header>
          <div>
            <ElButton text @click="backToList"
              >← 返回{{
                route.query.from === 'monitor' ? '流程监控' : '任务中心'
              }}</ElButton
            >
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
                >打开协议详情</ElButton
              >
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
              >{{
                context.instance.status === 'running'
                  ? nodeName
                  : INSTANCE_STATUS_LABELS[context.instance.status] || nodeName
              }}</ElTag
            ><ElButton :disabled="saving" @click="reload">刷新</ElButton>
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
          :title="`当前由 ${context.task?.assigneeNames.join('、')} 办理，您正在查看只读资料。`"
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
        <div class="content-grid">
          <section>
            <ElTabs v-model="view"
              ><ElTabPane label="办理资料" name="form"
                ><div class="form-header">
                  <h2>
                    {{ boundAgreement ? '协议资料' : context.form.title }}
                  </h2>
                  <span>{{
                    context.canAct
                      ? context.agreementEditable
                        ? '按当前节点编辑协议，保存/提交后回写'
                        : '审批节点协议只读，可填写意见后通过或驳回'
                      : '只读视图'
                  }}</span>
                </div>
                <AgreementPanel
                  v-if="boundAgreement"
                  :key="`${context.instance.id}:${context.instance.currentNodeId}:${context.instance.revision}`"
                  ref="agreePanel"
                  :detail="boundAgreement"
                  :editable="!!context.agreementEditable && !saving && !stale"
                  :field-access="currentNode?.fieldAccess"
                  @dirty="agreeDirty = true" />
                <ElForm
                  v-if="boundAgreement && extraFields.length"
                  label-position="top"
                  :disabled="saving || stale"
                  @submit.prevent
                >
                  <div class="form-header" style="margin-top: 8px">
                    <h2>本节点字段</h2>
                    <span
                      >按当前节点字段权限填写，审批默认可写已设为「可编辑」的项</span
                    >
                  </div>
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
                <ElForm
                  v-if="boundAgreement && storedFlowFields.length"
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
                <ElForm
                  v-if="!boundAgreement"
                  label-position="top"
                  :disabled="saving || stale"
                  @submit.prevent
                  ><div class="field-grid">
                    <ElFormItem
                      v-for="field in context.form.fields"
                      :key="`${context.instance.currentNodeId}:${field.key}`"
                      :label="field.label"
                      :required="field.required && !field.readonly"
                      :class="{
                        wide: ['table', 'textarea'].includes(field.type),
                      }"
                      ><FieldControl
                        :field="field"
                        :model-value="data[field.key]"
                        :disabled="!context.canAct || saving || stale"
                        @update:model-value="data[field.key] = $event"
                    /></ElFormItem></div></ElForm
                ><ElEmpty
                  v-if="!boundAgreement && !context.form.fields.length"
                  description="当前无可见字段" /></ElTabPane
              ><ElTabPane label="流程图" name="graph"
                ><Trace :context="context" /></ElTabPane
            ></ElTabs>
            <div
              v-if="
                context.canAct ||
                context.buttons.some((b) => b.code === 'recall')
              "
              class="action-area"
            >
              <label>办理意见</label
              ><ElInput
                v-model="opinion"
                type="textarea"
                :rows="3"
                maxlength="2000"
                :disabled="saving || stale"
                placeholder="填写办理意见；驳回时必填"
              />
              <div class="actions">
                <span v-if="dirty">有未提交修改</span
                ><ElTooltip
                  v-for="button in context.buttons"
                  :key="button.code"
                  :content="button.reason || ''"
                  :disabled="button.enabled"
                  ><span
                    ><ElButton
                      :type="
                        button.code === 'reject' || button.code === 'recall'
                          ? 'danger'
                          : button.code === 'transfer'
                            ? 'warning'
                            : button.code === 'save'
                              ? 'default'
                              : 'primary'
                      "
                      :plain="
                        button.code === 'reject' ||
                        button.code === 'recall' ||
                        button.code === 'transfer'
                      "
                      :disabled="!button.enabled || stale"
                      :loading="saving"
                      @click="actionClick(button.code)"
                      >{{ button.label }}</ElButton
                    ></span
                  ></ElTooltip
                >
              </div>
            </div>
          </section>
          <aside>
            <h2>审批记录</h2>
            <p class="timeline-note">
              发起人：{{ context.instance.initiatorName }}
            </p>
            <ElTimeline
              ><ElTimelineItem
                v-for="event in [...context.instance.events].reverse()"
                :key="event.id"
                :timestamp="
                  new Date(event.at).toLocaleString('zh-CN', { hour12: false })
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
                      : event.action === 'end' || event.action === 'resume'
                        ? 'success'
                        : 'primary'
                "
                ><b>{{ event.nodeName }} · {{ ACTION_LABELS[event.action] }}</b>
                <p>{{ event.actorName }}</p>
                <div v-if="event.opinion" class="opinion">
                  {{ event.opinion }}
                </div></ElTimelineItem
              ></ElTimeline
            >
          </aside>
        </div>
        <ElDialog
          v-model="rejectOpen"
          title="驳回流程"
          width="500px"
          :close-on-click-modal="false"
          :show-close="!saving"
          :close-on-press-escape="!saving"
          ><ElForm label-position="top" :disabled="saving"
            ><ElFormItem label="退回节点" required
              ><ElSelect v-model="target" style="width: 100%"
                ><ElOption
                  v-for="item in context.rejectTargets"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id" /></ElSelect></ElFormItem
            ><ElFormItem label="驳回意见" required
              ><ElInput
                v-model="opinion"
                type="textarea"
                :rows="4"
                maxlength="2000"
            /></ElFormItem>
            <p class="timeline-note">
              退回人修改后，将按节点配置重新提交。
            </p></ElForm
          ><template #footer
            ><ElButton :disabled="saving" @click="rejectOpen = false"
              >取消</ElButton
            ><ElButton type="danger" :loading="saving" @click="submit('reject')"
              >确认驳回</ElButton
            ></template
          ></ElDialog
        >
        <ElDialog
          v-model="transferOpen"
          title="转办"
          width="500px"
          :close-on-click-modal="false"
          :show-close="!saving"
          :close-on-press-escape="!saving"
          ><ElForm label-position="top" :disabled="saving"
            ><ElFormItem label="转办给" required
              ><ElSelect
                v-model="transferTarget"
                filterable
                style="width: 100%"
                placeholder="选择有流程办理权限的人"
                ><ElOption
                  v-for="item in context.transferCandidates || []"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id" /></ElSelect></ElFormItem
            ><ElFormItem label="转办说明（选填）"
              ><ElInput
                v-model="opinion"
                type="textarea"
                :rows="4"
                maxlength="2000"
                placeholder="会写入审批记录，对方可在记录中看到"
            /></ElFormItem>
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
            </p></ElForm
          ><template #footer
            ><ElButton :disabled="saving" @click="transferOpen = false"
              >取消</ElButton
            ><ElButton
              type="warning"
              :loading="saving"
              :disabled="!transferTarget"
              @click="submit('transfer')"
              >确认转办</ElButton
            ></template
          ></ElDialog
        >
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
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 20px;
  margin-top: 18px;
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

.action-area {
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.action-area label {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 16px;
}

.actions > span:first-child {
  font-size: 11px;
  color: var(--el-color-warning);
}

.timeline-note {
  margin: 10px 0 24px;
}

aside {
  max-height: calc(100vh - 270px);
  overflow: auto;
}

aside b {
  font-size: 12px;
}

aside p {
  margin-top: 7px;
  font-size: 11px;
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
