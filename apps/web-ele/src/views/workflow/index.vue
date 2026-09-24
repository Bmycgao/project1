<script setup lang="ts">
import type { WorkflowRecord } from '../../../../shared/workflow';
import type { WorkflowInstanceRow } from '#/api/workflow-runtime';
import { computed, onActivated, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTabPane,
  ElTabs,
  ElTag,
} from 'element-plus';
import {
  getStartableWorkflows,
  getWorkflowAgreements,
  getWorkflowInstances,
  startWorkflow,
  type WorkflowAgreementOption,
} from '#/api/workflow-runtime';
import { newId } from '../../../../shared/workflow';
import {
  formatRemain,
  INSTANCE_STATUS_LABELS,
  WORKFLOW_AUTH,
} from '../../../../shared/workflow-runtime';
import { AccessControl, useAccess } from '@vben/access';

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
/** 是否可发起（按钮权限或设计总权限） */
const canStart = () =>
  hasAccessByCodes([WORKFLOW_AUTH.start, WORKFLOW_AUTH.manage]);
const tab = ref('todo');
const keyword = ref('');
const status = ref('');
const dueFilter = ref('');
const page = ref(1);
const rows = ref<WorkflowInstanceRow[]>([]);
const definitions = ref<WorkflowRecord[]>([]);
const agreements = ref<WorkflowAgreementOption[]>([]);
const loading = ref(false);
const loaded = ref(false);
const saving = ref(false);
const visible = ref(false);
const requestId = ref('');
let sequence = 0;
const input = ref({
  definitionId: '',
  agreementNo: '',
  title: '',
});
/** 从协议详情带入时锁定所选协议 */
const lockedAgreement = computed(() =>
  String(route.query.agreementNo || route.query.businessNo || '').trim(),
);
const selectedAgreement = computed(() =>
  agreements.value.find((item) => item.agreementNo === input.value.agreementNo),
);
const filtered = computed(() =>
  rows.value.filter(
    (r) =>
      (!status.value || status.value === r.status) &&
      (!dueFilter.value ||
        tab.value !== 'todo' ||
        r.slaStatus === dueFilter.value) &&
      `${r.title} ${r.businessNo} ${r.definitionName}`.includes(keyword.value),
  ),
);
const displayed = computed(() =>
  filtered.value.slice((page.value - 1) * 10, page.value * 10),
);
async function load() {
  const current = ++sequence;
  loading.value = true;
  try {
    const result = await getWorkflowInstances(tab.value);
    if (current === sequence) {
      rows.value = result;
      loaded.value = true;
    }
  } catch {
  } finally {
    if (current === sequence) loading.value = false;
  }
}
/** 打开发起弹窗：拉已发布流程和可绑定协议 */
async function openStart() {
  try {
    const [published, rows] = await Promise.all([
      getStartableWorkflows(),
      getWorkflowAgreements(),
    ]);
    definitions.value = published;
    agreements.value = rows;
  } catch {
    return;
  }
  if (!definitions.value.length) {
    ElMessage.info('没有可发起的流程，请管理员先发布流程');
    return;
  }
  if (!agreements.value.length) {
    ElMessage.info('没有可绑定的协议，请先在协议列表中创建');
    return;
  }
  const preset = lockedAgreement.value;
  const picked =
    agreements.value.find((item) => item.agreementNo === preset) ||
    agreements.value[0]!;
  input.value = {
    definitionId: definitions.value[0]!.id,
    agreementNo: picked.agreementNo,
    title: String(route.query.title || picked.title),
  };
  requestId.value = newId('start');
  visible.value = true;
}
/** 切换协议时带入默认标题 */
function onAgreementChange(agreementNo: string) {
  const row = agreements.value.find((item) => item.agreementNo === agreementNo);
  if (row && !String(route.query.title || '').trim())
    input.value.title = row.title;
}
/** 按所选协议创建流程实例并进入办理 */
async function start() {
  if (!input.value.agreementNo.trim()) {
    ElMessage.warning('请选择要办理的协议');
    return;
  }
  saving.value = true;
  try {
    const context = await startWorkflow({
      definitionId: input.value.definitionId,
      agreementNo: input.value.agreementNo,
      title: input.value.title.trim() || undefined,
      requestId: requestId.value,
    });
    visible.value = false;
    ElMessage.success('已绑定协议并生成待办');
    await router.push(`/workflow/instances/${context.instance.id}`);
  } catch {
  } finally {
    saving.value = false;
  }
}
onMounted(() => {
  void load();
  if (lockedAgreement.value && canStart()) void openStart();
});
onActivated(() => {
  if (loaded.value) void load();
  if (lockedAgreement.value && !visible.value && canStart()) void openStart();
});
</script>
<template>
  <Page auto-content-height>
    <div class="runtime-home">
      <header>
        <div>
          <span>MY WORKFLOWS</span>
          <h1>流程办理</h1>
          <p>查看待办、跟踪进度，按当前节点完成办理。</p>
        </div>
        <AccessControl
          :codes="[WORKFLOW_AUTH.start, WORKFLOW_AUTH.manage]"
          type="code"
        >
          <ElButton type="primary" size="large" @click="openStart"
            >＋ 发起流程</ElButton
          >
        </AccessControl>
      </header>
      <section>
        <ElTabs
          v-model="tab"
          @tab-change="
            page = 1;
            dueFilter = '';
            load();
          "
          ><ElTabPane name="todo" label="我的待办" /><ElTabPane
            name="done"
            label="我的已办" /><ElTabPane
            name="started"
            label="我发起的" /><ElTabPane name="cc" label="抄送给我"
        /></ElTabs>
        <div class="filters">
          <ElInput
            v-model="keyword"
            placeholder="搜索标题、业务编号或流程名称"
            clearable
            style="width: 300px"
            @input="page = 1"
          /><ElSelect
            v-model="status"
            clearable
            placeholder="全部状态"
            style="width: 150px"
            @change="page = 1"
            ><ElOption
              v-for="(label, code) in INSTANCE_STATUS_LABELS"
              :key="code"
              :label="label"
              :value="code" /></ElSelect
          ><ElSelect
            v-if="tab === 'todo'"
            v-model="dueFilter"
            clearable
            placeholder="全部时限"
            style="width: 140px"
            @change="page = 1"
            ><ElOption label="即将到期" value="dueSoon" /><ElOption
              label="已超时"
              value="overdue" /></ElSelect
          ><ElButton :loading="loading" @click="load">刷新</ElButton>
        </div>
        <ElTable v-loading="loading" :data="displayed" row-key="id"
          ><ElTableColumn label="业务" min-width="210"
            ><template #default="{ row }"
              ><b>{{ row.title }}</b>
              <p class="sub">{{ row.businessNo }}</p></template
            ></ElTableColumn
          ><ElTableColumn label="流程 / 版本" min-width="180"
            ><template #default="{ row }"
              >{{ row.definitionName }}
              <ElTag size="small">V{{ row.version }}</ElTag></template
            ></ElTableColumn
          ><ElTableColumn
            prop="currentNodeName"
            label="当前节点"
            min-width="130" /><ElTableColumn
            prop="initiatorName"
            label="发起人"
            width="100" /><ElTableColumn label="状态" width="100"
            ><template #default="{ row }"
              ><ElTag
                :type="
                  row.status === 'completed'
                    ? 'success'
                    : row.status === 'suspended'
                      ? 'warning'
                      : row.status === 'terminated'
                        ? 'info'
                        : 'primary'
                "
                >{{ INSTANCE_STATUS_LABELS[row.status] || row.status }}</ElTag
              ></template
            ></ElTableColumn
          ><ElTableColumn v-if="tab === 'todo'" label="剩余时限" min-width="140"
            ><template #default="{ row }"
              ><ElTag
                v-if="row.slaStatus === 'overdue'"
                type="danger"
                size="small"
                >{{ formatRemain(row.dueAt) }}</ElTag
              ><ElTag
                v-else-if="row.slaStatus === 'dueSoon'"
                type="warning"
                size="small"
                >{{ formatRemain(row.dueAt) }}</ElTag
              ><span v-else-if="row.dueAt">{{ formatRemain(row.dueAt) }}</span
              ><span v-else class="sub">不限</span></template
            ></ElTableColumn
          ><ElTableColumn label="到达 / 发起时间" min-width="175"
            ><template #default="{ row }">{{
              new Date(row.taskArrivedAt || row.createdAt).toLocaleString(
                'zh-CN',
                { hour12: false },
              )
            }}</template></ElTableColumn
          ><ElTableColumn label="操作" width="90" fixed="right"
            ><template #default="{ row }"
              ><ElButton
                link
                type="primary"
                @click="router.push(`/workflow/instances/${row.id}`)"
                >{{ tab === 'todo' ? '办理' : '查看' }}</ElButton
              ></template
            ></ElTableColumn
          ><template #empty
            ><ElEmpty
              :description="
                loaded ? '暂无符合条件的流程' : '加载失败，请刷新'
              " /></template
        ></ElTable>
        <ElPagination
          v-model:current-page="page"
          :page-size="10"
          :total="filtered.length"
          layout="total, prev, pager, next"
          style="justify-content: flex-end; margin-top: 20px"
        />
      </section>
      <ElDialog
        v-model="visible"
        title="发起流程"
        width="560px"
        :close-on-click-modal="false"
        :show-close="!saving"
        :close-on-press-escape="!saving"
        ><ElForm
          label-position="top"
          :disabled="saving"
          @submit.prevent="start"
        >
          <ElFormItem label="选择已发布流程" required
            ><ElSelect
              v-model="input.definitionId"
              filterable
              style="width: 100%"
              ><ElOption
                v-for="definition in definitions"
                :key="definition.id"
                :value="definition.id"
                :label="`${definition.name} · V${definition.version} · ${definition.base}`" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="绑定协议" required
            ><ElSelect
              v-model="input.agreementNo"
              filterable
              :disabled="!!lockedAgreement"
              style="width: 100%"
              @change="onAgreementChange"
              ><ElOption
                v-for="item in agreements"
                :key="item.agreementNo"
                :value="item.agreementNo"
                :label="`${item.agreementNo} · ${item.compensatee}`"
              />
            </ElSelect>
          </ElFormItem>
          <template v-if="selectedAgreement">
            <ElFormItem label="被补偿人"
              ><ElInput :model-value="selectedAgreement.compensatee" disabled
            /></ElFormItem>
            <ElFormItem label="房屋坐落"
              ><ElInput :model-value="selectedAgreement.houseAddress" disabled
            /></ElFormItem>
            <ElFormItem label="补偿金额 / 状态"
              ><ElInput
                :model-value="`${selectedAgreement.amount.toLocaleString('zh-CN')} 元 · ${selectedAgreement.statusValue}`"
                disabled
            /></ElFormItem>
          </template>
          <ElFormItem label="流程标题"
            ><ElInput
              v-model="input.title"
              maxlength="100"
              placeholder="默认使用协议名称"
          /></ElFormItem>
          <p class="sub">
            发起后办理的是该协议资料。保存或提交会回写协议记录，可从办理页打开协议详情。
          </p> </ElForm
        ><template #footer
          ><ElButton :disabled="saving" @click="visible = false">取消</ElButton
          ><ElButton type="primary" :loading="saving" @click="start"
            >确认发起</ElButton
          ></template
        ></ElDialog
      >
    </div>
  </Page>
</template>
<style scoped>
.runtime-home {
  color: var(--el-text-color-primary);
}

header {
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

header span {
  font-size: 11px;
  color: var(--el-color-primary);
  letter-spacing: 2px;
}

h1 {
  margin: 6px 0;
  font-size: 26px;
  font-weight: 600;
}

header p,
.sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

section {
  padding: 20px;
  margin-top: 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 10px 0 22px;
}
</style>
