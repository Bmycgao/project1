<script setup lang="ts">
/**
 * 流程监控：管理员查看全部实例，并可换人 / 挂起 / 激活 / 终止 / 催办。
 */
import type { WorkflowContext } from '../../../../../shared/workflow-runtime';
import type { WorkflowInstanceRow } from '#/api/workflow-runtime';
import { computed, onActivated, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Page } from '@vben/common-ui';
import {
  ElButton,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElPagination,
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import {
  getWorkflowContext,
  getWorkflowInstances,
  interveneWorkflow,
} from '#/api/workflow-runtime';
import { newId } from '../../../../../shared/workflow';
import {
  ACTION_LABELS,
  INSTANCE_STATUS_LABELS,
  formatRemain,
} from '../../../../../shared/workflow-runtime';

const router = useRouter();
const keyword = ref('');
const status = ref('');
const nodeName = ref('');
const page = ref(1);
const rows = ref<WorkflowInstanceRow[]>([]);
const loading = ref(false);
const loaded = ref(false);
const interveneOpen = ref(false);
const intervening = ref(false);
const context = ref<WorkflowContext>();
const interveneAction = ref<
  'reassign' | 'suspend' | 'resume' | 'terminate' | 'urge'
>('urge');
const taskId = ref('');
const targetUserId = ref('');
const opinion = ref('');
let sequence = 0;

const filtered = computed(() =>
  rows.value.filter(
    (r) =>
      (!status.value || r.status === status.value) &&
      (!nodeName.value || r.currentNodeName === nodeName.value) &&
      `${r.title} ${r.businessNo} ${r.definitionName} ${r.initiatorName}`.includes(
        keyword.value,
      ),
  ),
);
const displayed = computed(() =>
  filtered.value.slice((page.value - 1) * 10, page.value * 10),
);
const nodeNames = computed(() => [
  ...new Set(rows.value.map((r) => r.currentNodeName).filter(Boolean)),
]);
const runningCount = computed(
  () => rows.value.filter((r) => r.status === 'running').length,
);
const suspendedCount = computed(
  () => rows.value.filter((r) => r.status === 'suspended').length,
);
const completedCount = computed(
  () => rows.value.filter((r) => r.status === 'completed').length,
);
const terminatedCount = computed(
  () => rows.value.filter((r) => r.status === 'terminated').length,
);
const reassignCandidates = computed(() => {
  const task = context.value?.interveneTasks?.find(
    (t) => t.id === taskId.value,
  );
  const taken = new Set(task?.assigneeIds || []);
  return (context.value?.interveneCandidates || []).filter(
    (a) => !taken.has(a.id),
  );
});

/** 状态标签颜色 */
function statusType(value: string) {
  if (value === 'completed') return 'success';
  if (value === 'suspended') return 'warning';
  if (value === 'terminated') return 'info';
  return 'primary';
}

/** 拉取全部实例 */
async function load() {
  const current = ++sequence;
  loading.value = true;
  try {
    const result = await getWorkflowInstances('monitor');
    if (current === sequence) {
      rows.value = result;
      loaded.value = true;
      page.value = Math.min(
        page.value,
        Math.max(1, Math.ceil(filtered.value.length / 10) || 1),
      );
    }
  } catch {
    if (current === sequence) loaded.value = false;
  } finally {
    if (current === sequence) loading.value = false;
  }
}

/** 打开实例只读检查页（无待办时不能办理） */
function openInstance(row: WorkflowInstanceRow) {
  void router.push({
    path: `/workflow/instances/${row.id}`,
    query: { from: 'monitor' },
  });
}

/** 打开干预弹窗并拉取候选人 */
async function openIntervene(row: WorkflowInstanceRow) {
  try {
    const result = await getWorkflowContext(row.id);
    if (!result.canIntervene) {
      ElMessage.warning('当前实例不能干预');
      return;
    }
    context.value = result;
    interveneAction.value =
      result.instance.status === 'suspended' ? 'resume' : 'urge';
    taskId.value = result.interveneTasks?.[0]?.id || '';
    const taken = new Set(result.interveneTasks?.[0]?.assigneeIds || []);
    targetUserId.value =
      result.interveneCandidates?.find((a) => !taken.has(a.id))?.id || '';
    opinion.value = '';
    interveneOpen.value = true;
  } catch {
    ElMessage.error('加载实例失败');
  }
}

/** 提交监控干预 */
async function submitIntervene() {
  const current = context.value;
  if (!current || intervening.value) return;
  if (interveneAction.value === 'terminate' && !opinion.value.trim()) {
    ElMessage.warning('终止必须填写原因');
    return;
  }
  if (interveneAction.value === 'reassign') {
    if (!taskId.value && (current.interveneTasks?.length || 0) > 1) {
      ElMessage.warning('请选择要改派的待办');
      return;
    }
    if (!targetUserId.value) {
      ElMessage.warning('请选择换人对象');
      return;
    }
  }
  intervening.value = true;
  try {
    await interveneWorkflow(current.instance.id, {
      requestId: newId('intervene'),
      revision: current.instance.revision,
      action: interveneAction.value,
      opinion: opinion.value,
      ...(interveneAction.value === 'reassign'
        ? { taskId: taskId.value, targetUserId: targetUserId.value }
        : {}),
    });
    ElMessage.success(`${ACTION_LABELS[interveneAction.value]}成功`);
    interveneOpen.value = false;
    await load();
  } catch {
  } finally {
    intervening.value = false;
  }
}

onMounted(() => {
  void load();
});
onActivated(() => {
  if (loaded.value) void load();
});
</script>

<template>
  <Page auto-content-height>
    <div class="flow-monitor">
      <div class="hero">
        <div>
          <span class="eyebrow">WORKFLOW MONITOR</span>
          <h1>流程监控</h1>
          <p>
            查看全部实例位置。可换人、挂起、激活、终止、催办，操作写入审批记录。
          </p>
        </div>
        <ElButton :loading="loading" @click="load">刷新</ElButton>
      </div>
      <div class="overview">
        <span
          ><b>{{ rows.length }}</b> 个实例</span
        >
        <span
          ><b>{{ runningCount }}</b> 办理中</span
        >
        <span
          ><b>{{ suspendedCount }}</b> 已挂起</span
        >
        <span
          ><b>{{ completedCount }}</b> 已结束</span
        >
        <span
          ><b>{{ terminatedCount }}</b> 已终止</span
        >
      </div>
      <div class="flow-table">
        <div class="filters">
          <ElInput
            v-model="keyword"
            clearable
            placeholder="搜索标题 / 协议编号 / 流程 / 发起人"
            style="width: 280px"
            @input="page = 1"
          />
          <ElSelect
            v-model="status"
            clearable
            placeholder="全部状态"
            style="width: 140px"
            @change="page = 1"
          >
            <ElOption
              v-for="(label, code) in INSTANCE_STATUS_LABELS"
              :key="code"
              :label="label"
              :value="code"
            />
          </ElSelect>
          <ElSelect
            v-model="nodeName"
            clearable
            placeholder="全部节点"
            style="width: 180px"
            @change="page = 1"
          >
            <ElOption
              v-for="name in nodeNames"
              :key="name"
              :label="name"
              :value="name"
            />
          </ElSelect>
        </div>
        <ElTable v-loading="loading" :data="displayed" row-key="id">
          <ElTableColumn label="业务" min-width="210">
            <template #default="{ row }">
              <b>{{ row.title }}</b>
              <p class="sub">{{ row.businessNo }}</p>
            </template>
          </ElTableColumn>
          <ElTableColumn label="流程 / 版本" min-width="180">
            <template #default="{ row }">
              {{ row.definitionName }}
              <ElTag size="small">V{{ row.version }}</ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn
            prop="currentNodeName"
            label="当前节点"
            min-width="130"
          />
          <ElTableColumn label="待办人" min-width="140">
            <template #default="{ row }">
              {{
                row.status === 'completed' || row.status === 'terminated'
                  ? '—'
                  : (row.pendingAssigneeNames || []).join('、') || '—'
              }}
              <ElTag
                v-if="row.urged && row.status === 'running'"
                size="small"
                type="warning"
                >已催办</ElTag
              >
            </template>
          </ElTableColumn>
          <ElTableColumn label="时限" min-width="130">
            <template #default="{ row }">
              <ElTag
                v-if="row.slaStatus === 'overdue'"
                type="danger"
                size="small"
                >{{ formatRemain(row.dueAt) }}</ElTag
              >
              <ElTag
                v-else-if="row.slaStatus === 'dueSoon'"
                type="warning"
                size="small"
                >{{ formatRemain(row.dueAt) }}</ElTag
              >
              <span v-else-if="row.dueAt">{{ formatRemain(row.dueAt) }}</span>
              <span v-else class="sub">—</span>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="initiatorName" label="发起人" width="100" />
          <ElTableColumn label="状态" width="100">
            <template #default="{ row }">
              <ElTag :type="statusType(row.status)">{{
                INSTANCE_STATUS_LABELS[row.status] || row.status
              }}</ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="到达 / 发起时间" min-width="175">
            <template #default="{ row }">
              {{
                new Date(row.taskArrivedAt || row.createdAt).toLocaleString(
                  'zh-CN',
                  { hour12: false },
                )
              }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="openInstance(row)"
                >查看</ElButton
              >
              <ElButton
                v-if="row.status === 'running' || row.status === 'suspended'"
                link
                type="warning"
                @click="openIntervene(row)"
                >干预</ElButton
              >
            </template>
          </ElTableColumn>
          <template #empty>
            <ElEmpty
              :description="loaded ? '暂无流程实例' : '加载失败，请刷新'"
            />
          </template>
        </ElTable>
        <ElPagination
          v-model:current-page="page"
          :page-size="10"
          :total="filtered.length"
          layout="total, prev, pager, next"
          style="justify-content: flex-end; margin-top: 20px"
        />
      </div>
      <ElDialog
        v-model="interveneOpen"
        title="监控干预"
        width="520px"
        :close-on-click-modal="false"
        :close-on-press-escape="!intervening"
        :show-close="!intervening"
      >
        <p v-if="context" class="sub" style="margin-bottom: 12px">
          {{ context.instance.title }} · {{ context.instance.businessNo }} ·
          {{ INSTANCE_STATUS_LABELS[context.instance.status] }}
        </p>
        <ElForm label-position="top" :disabled="intervening">
          <ElFormItem label="操作" required>
            <ElRadioGroup v-model="interveneAction">
              <ElRadio
                v-if="context?.instance.status === 'running'"
                value="reassign"
                >换人</ElRadio
              >
              <ElRadio
                v-if="context?.instance.status === 'running'"
                value="suspend"
                >挂起</ElRadio
              >
              <ElRadio
                v-if="context?.instance.status === 'suspended'"
                value="resume"
                >激活</ElRadio
              >
              <ElRadio value="terminate">终止</ElRadio>
              <ElRadio
                v-if="context?.instance.status === 'running'"
                value="urge"
                >催办</ElRadio
              >
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem
            v-if="
              interveneAction === 'reassign' &&
              (context?.interveneTasks?.length || 0) > 1
            "
            label="改派待办"
            required
          >
            <ElSelect v-model="taskId" style="width: 100%">
              <ElOption
                v-for="task in context?.interveneTasks || []"
                :key="task.id"
                :label="`${task.nodeName}（${task.assigneeNames.join('、')}）`"
                :value="task.id"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem
            v-if="interveneAction === 'reassign'"
            label="换给"
            required
          >
            <ElSelect
              v-model="targetUserId"
              filterable
              style="width: 100%"
              placeholder="选择有流程办理权限的人"
            >
              <ElOption
                v-for="item in reassignCandidates"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem
            :label="
              interveneAction === 'terminate' ? '终止原因' : '说明（选填）'
            "
            :required="interveneAction === 'terminate'"
          >
            <ElInput
              v-model="opinion"
              type="textarea"
              :rows="3"
              maxlength="2000"
              :placeholder="
                interveneAction === 'terminate'
                  ? '必填，将通知发起人并写入审批记录'
                  : '写入审批记录'
              "
            />
          </ElFormItem>
        </ElForm>
        <template #footer>
          <ElButton :disabled="intervening" @click="interveneOpen = false"
            >取消</ElButton
          >
          <ElButton
            type="primary"
            :loading="intervening"
            @click="submitIntervene"
            >确认{{ ACTION_LABELS[interveneAction] }}</ElButton
          >
        </template>
      </ElDialog>
    </div>
  </Page>
</template>
<style scoped>
.flow-monitor {
  color: var(--el-text-color-primary);
}

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px;
  background: linear-gradient(
    120deg,
    var(--el-color-primary-light-9),
    var(--el-bg-color)
  );
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.eyebrow {
  font-size: 11px;
  color: var(--el-color-primary);
  letter-spacing: 2px;
}

h1 {
  margin: 6px 0;
  font-size: 26px;
  font-weight: 600;
}

.hero p,
.sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.overview {
  display: flex;
  gap: 24px;
  margin: 16px 0;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.overview b {
  margin-right: 4px;
}

.flow-table {
  padding: 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
</style>
