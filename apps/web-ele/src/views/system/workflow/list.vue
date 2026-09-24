<script setup lang="ts">
import type {
  WorkflowChangeEntry,
  WorkflowDiffLine,
  WorkflowDocument,
  WorkflowRecord,
} from './model';
import { computed, onActivated, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Page } from '@vben/common-ui';
import { AccessControl, useAccess } from '@vben/access';
import {
  ElButton,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflowList,
  createWorkflowVersion,
  disableWorkflowVersion,
} from '#/api/system/workflow';
import PublicationDialog from './publication-dialog.vue';
import {
  CATEGORIES,
  createDocument,
  createNode,
  diffWorkflowVersions,
  documentOf,
  downloadWorkflowJson,
  readWorkflowJsonFile,
} from './model';
import { WORKFLOW_AUTH } from '../../../../../shared/workflow-runtime';

const { hasAccessByCodes } = useAccess();
/** 设计总权限可操作全部列表按钮；否则按单项码 */
const canManage = hasAccessByCodes([WORKFLOW_AUTH.manage]);
const canCopy = canManage || hasAccessByCodes([WORKFLOW_AUTH.copy]);
const canPublish = canManage || hasAccessByCodes([WORKFLOW_AUTH.publish]);
const canVersion = canManage || hasAccessByCodes([WORKFLOW_AUTH.version]);
const canDisable = canManage || hasAccessByCodes([WORKFLOW_AUTH.disable]);
const canDelete = canManage || hasAccessByCodes([WORKFLOW_AUTH.delete]);

const router = useRouter();
const publication = ref<InstanceType<typeof PublicationDialog>>();
async function newVersion(row: WorkflowRecord) {
  try {
    const version = await createWorkflowVersion(row.id);
    await load();
    await router.push(`/system/workflow/edit/${version.id}`);
  } catch {}
}
async function disable(row: WorkflowRecord) {
  try {
    await ElMessageBox.confirm(
      '停用后不能新发起，在途任务继续办理。确认停用此版本？',
      '停用流程',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await disableWorkflowVersion(row.id, row.revision);
    await load();
    ElMessage.success('版本已停用');
  } catch {}
}
const records = ref<WorkflowRecord[]>([]);
const loading = ref(false);
const saving = ref(false);
const loaded = ref(false);
const keyword = ref('');
const category = ref('');
const base = ref('');
const page = ref(1);
const dialogOpen = ref(false);
const copying = ref(false);
/** 列表导入 JSON 打开新建对话框时为 true，用于区分复制 */
const importing = ref(false);
const form = ref<WorkflowDocument>(createDocument());
const diffOpen = ref(false);
const diffBase = ref<WorkflowRecord>();
const diffOtherId = ref('');
const bases = computed(() => [...new Set(records.value.map((r) => r.base))]);
const filtered = computed(() =>
  records.value.filter(
    (r) =>
      (!category.value || r.category === category.value) &&
      (!base.value || r.base === base.value) &&
      `${r.name} ${r.code}`.toLowerCase().includes(keyword.value.toLowerCase()),
  ),
);
const displayed = computed(() =>
  filtered.value.slice((page.value - 1) * 10, page.value * 10),
);
async function load() {
  loading.value = true;
  try {
    records.value = await getWorkflowList();
    loaded.value = true;
    page.value = Math.min(
      page.value,
      Math.max(1, Math.ceil(filtered.value.length / 10)),
    );
  } catch {
    /* Request client displays the error; existing rows remain visible. */
  } finally {
    loading.value = false;
  }
}
/** 同一流程家族的其他版本，用于版本对比 */
function familySiblings(row: WorkflowRecord) {
  const family = row.familyId || row.id;
  return records.value.filter(
    (item) => item.id !== row.id && (item.familyId || item.id) === family,
  );
}
/** 版本下拉文案 */
function versionLabel(row: WorkflowRecord) {
  const status =
    row.status === 'published'
      ? '已发布'
      : row.status === 'disabled'
        ? '已停用'
        : '草稿';
  return `V${row.version || 1} ${status}`;
}
/** 打开只读版本对比，默认选中相邻版本 */
function openDiff(row: WorkflowRecord) {
  diffBase.value = row;
  const siblings = familySiblings(row).sort(
    (a, b) => (a.version || 1) - (b.version || 1),
  );
  const current = row.version || 1;
  const previous = [...siblings]
    .reverse()
    .find((item) => (item.version || 1) < current);
  diffOtherId.value = (previous || siblings[0])?.id || '';
  diffOpen.value = true;
}
const diffOther = computed(() =>
  records.value.find((item) => item.id === diffOtherId.value),
);
const diffPair = computed(() => {
  const left = diffBase.value;
  const right = diffOther.value;
  if (!left || !right) return undefined;
  return (left.version || 1) <= (right.version || 1)
    ? { older: left, newer: right }
    : { older: right, newer: left };
});
const diffLines = computed<WorkflowDiffLine[]>(() =>
  diffPair.value
    ? diffWorkflowVersions(diffPair.value.older, diffPair.value.newer)
    : [],
);
/** 较新版本上已记下的按钮、时限、数据动作、字段权限变更 */
const configLog = computed<WorkflowChangeEntry[]>(
  () => diffPair.value?.newer.changeLog || [],
);
/** 日志时间显示到分钟 */
function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function openCreate(source?: WorkflowRecord) {
  copying.value = !!source;
  importing.value = false;
  form.value = source ? documentOf(source) : createDocument();
  if (source) {
    form.value.code = '';
    form.value.name = `${source.name}（副本）`;
  } else
    form.value.nodes = [
      createNode('start', 120, 160, 1),
      createNode('end', 640, 160, 2),
    ];
  dialogOpen.value = true;
}
const jsonFile = ref<HTMLInputElement>();
/** 从 JSON 文件打开新建对话框，编码需重新填写 */
async function importJsonFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const incoming = await readWorkflowJsonFile(file);
    copying.value = true;
    importing.value = true;
    form.value = {
      ...incoming,
      code: '',
      name: incoming.name ? `${incoming.name}（导入）` : '',
    };
    dialogOpen.value = true;
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : '导入失败');
  }
}
async function create() {
  if (
    !form.value.name.trim() ||
    !form.value.base.trim() ||
    !form.value.businessTable.trim() ||
    !/^[A-Za-z][\w-]*$/.test(form.value.code)
  ) {
    ElMessage.warning('请填写名称、基地、业务表及合法编码（字母开头）');
    return;
  }
  saving.value = true;
  try {
    const record = await createWorkflow(form.value);
    dialogOpen.value = false;
    ElMessage.success(
      importing.value
        ? '流程已导入为草稿'
        : copying.value
          ? '流程已复制，节点和连线配置已保留'
          : '草稿已创建',
    );
    await router.push(`/system/workflow/edit/${record.id}`);
  } catch {
    /* Keep the form for retry. */
  } finally {
    saving.value = false;
  }
}
async function remove(row: WorkflowRecord) {
  try {
    await ElMessageBox.confirm(
      `删除草稿「${row.name}」及其全部节点配置？删除后无法恢复。`,
      '删除流程草稿',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await deleteWorkflow(row.id);
    ElMessage.success('草稿已删除');
    await load();
  } catch {
    /* Request error is visible. */
  }
}
onMounted(load);
onActivated(() => {
  if (loaded.value) void load();
});
</script>

<template>
  <Page auto-content-height>
    <PublicationDialog ref="publication" @published="load" />
    <div class="flow-list">
      <div class="hero">
        <div>
          <span class="eyebrow">WORKFLOW STUDIO</span>
          <h1>流程设计</h1>
          <p>把业务环节连接起来，为每个节点配置办理人、表单与操作。</p>
        </div>
        <AccessControl
          :codes="[WORKFLOW_AUTH.create, WORKFLOW_AUTH.manage]"
          type="code"
        >
          <div class="hero-actions">
            <ElButton @click="jsonFile?.click()">导入 JSON</ElButton>
            <ElButton type="primary" size="large" @click="openCreate()"
              >＋ 新建流程</ElButton
            >
          </div>
        </AccessControl>
        <input
          ref="jsonFile"
          type="file"
          accept="application/json,.json"
          hidden
          @change="importJsonFile"
        />
      </div>
      <div class="overview">
        <span
          ><b>{{ records.length }}</b> 个流程版本</span
        ><span
          ><b>{{ bases.length }}</b> 个所属基地</span
        ><span class="overview-note"
          >发布后可在“流程办理”中发起，历史实例沿用原版本。</span
        >
      </div>
      <div class="flow-table">
        <div class="filters">
          <ElInput
            v-model="keyword"
            clearable
            placeholder="搜索流程名称 / 编码"
            style="width: 260px"
            @input="page = 1"
          />
          <ElSelect
            v-model="category"
            clearable
            placeholder="全部分类"
            style="width: 140px"
            @change="page = 1"
            ><ElOption
              v-for="item in CATEGORIES"
              :key="item"
              :value="item"
              :label="item"
          /></ElSelect>
          <ElSelect
            v-model="base"
            clearable
            placeholder="全部基地"
            style="width: 170px"
            @change="page = 1"
            ><ElOption
              v-for="item in bases"
              :key="item"
              :value="item"
              :label="item"
          /></ElSelect>
          <ElButton :loading="loading" @click="load">刷新</ElButton>
        </div>
        <ElTable v-loading="loading" :data="displayed" row-key="id">
          <ElTableColumn label="流程" min-width="230"
            ><template #default="{ row }"
              ><button
                class="flow-name"
                @click="router.push(`/system/workflow/edit/${row.id}`)"
              >
                {{ row.name }}
              </button>
              <div class="flow-code">{{ row.code }}</div></template
            ></ElTableColumn
          >
          <ElTableColumn prop="category" label="业务分类" width="110" />
          <ElTableColumn prop="base" label="所属基地" min-width="110" />
          <ElTableColumn label="节点" width="75"
            ><template #default="{ row }">{{
              row.nodes.length
            }}</template></ElTableColumn
          >
          <ElTableColumn label="状态" width="105"
            ><template #default="{ row }"
              ><ElTag
                :type="row.status === 'published' ? 'success' : 'info'"
                effect="plain"
                >{{
                  row.status === 'published'
                    ? '已发布'
                    : row.status === 'disabled'
                      ? '已停用'
                      : '草稿'
                }}</ElTag
              >
              <div class="flow-code">V{{ row.version || 1 }}</div></template
            ></ElTableColumn
          >
          <ElTableColumn label="最后保存" min-width="185"
            ><template #default="{ row }"
              >{{
                new Date(row.updatedAt).toLocaleString('zh-CN', {
                  hour12: false,
                })
              }}
              <div class="flow-code">{{ row.updatedBy }}</div></template
            ></ElTableColumn
          >
          <ElTableColumn label="操作" width="430" fixed="right"
            ><template #default="{ row }"
              ><ElButton
                link
                type="primary"
                @click="router.push(`/system/workflow/edit/${row.id}`)"
                >{{ row.status === 'draft' ? '设计' : '查看' }}</ElButton
              ><ElButton
                link
                type="primary"
                @click="openDiff(row as WorkflowRecord)"
                >对比</ElButton
              ><ElButton
                link
                type="primary"
                @click="downloadWorkflowJson(row as WorkflowRecord)"
                >导出</ElButton
              ><ElButton
                v-if="canCopy"
                link
                type="primary"
                @click="openCreate(row as WorkflowRecord)"
                >复制</ElButton
              ><ElButton
                link
                type="danger"
                v-if="canDelete && row.status === 'draft'"
                @click="remove(row as WorkflowRecord)"
                >删除</ElButton
              ><ElButton
                v-if="canPublish && row.status === 'draft'"
                link
                type="success"
                @click="publication?.open(row.id)"
                >发布</ElButton
              ><ElButton
                v-else-if="canVersion && row.status !== 'draft'"
                link
                type="primary"
                @click="newVersion(row as WorkflowRecord)"
                >新建版本</ElButton
              ><ElButton
                v-if="canDisable && row.status === 'published'"
                link
                type="warning"
                @click="disable(row as WorkflowRecord)"
                >停用</ElButton
              ></template
            ></ElTableColumn
          >
          <template #empty
            ><ElEmpty
              :description="
                keyword || category || base
                  ? '没有符合条件的流程'
                  : loaded
                    ? '还没有流程，创建第一份草稿吧'
                    : '列表加载失败，请点击刷新'
              "
          /></template>
        </ElTable>
        <ElPagination
          v-model:current-page="page"
          :total="filtered.length"
          :page-size="10"
          layout="total, prev, pager, next"
          class="pagination"
        />
      </div>
      <ElDialog
        v-model="dialogOpen"
        :title="importing ? '导入流程' : copying ? '复制流程' : '新建流程'"
        width="530px"
        :close-on-click-modal="false"
        :close-on-press-escape="!saving"
        :show-close="!saving"
      >
        <p v-if="importing" class="import-hint">
          已载入流程图节点和连线，请填写本环境唯一的流程编码后创建草稿。
        </p>
        <ElForm label-position="top" @submit.prevent="create">
          <ElFormItem label="流程名称" required
            ><ElInput
              v-model="form.name"
              maxlength="80"
              placeholder="例如：协议审核签约"
          /></ElFormItem>
          <ElFormItem label="流程编码（同一基地内唯一）" required
            ><ElInput
              v-model="form.code"
              maxlength="80"
              placeholder="例如：FL_XY_001"
          /></ElFormItem>
          <div class="form-row">
            <ElFormItem label="所属基地编码" required
              ><ElInput
                v-model="form.base"
                maxlength="80"
                placeholder="请输入业务基地编码" /></ElFormItem
            ><ElFormItem label="业务分类"
              ><ElSelect v-model="form.category"
                ><ElOption
                  v-for="item in CATEGORIES"
                  :key="item"
                  :value="item"
                  :label="item" /></ElSelect
            ></ElFormItem>
          </div>
          <ElFormItem label="绑定业务表" required
            ><ElInput
              v-model="form.businessTable"
              maxlength="80"
              placeholder="例如：XieYi"
          /></ElFormItem>
          <ElFormItem label="说明"
            ><ElInput
              v-model="form.description"
              type="textarea"
              maxlength="500"
              :rows="2"
          /></ElFormItem>
        </ElForm>
        <template #footer
          ><ElButton :disabled="saving" @click="dialogOpen = false"
            >取消</ElButton
          ><ElButton type="primary" :loading="saving" @click="create">{{
            importing ? '导入并设计' : copying ? '复制并设计' : '创建并设计'
          }}</ElButton></template
        >
      </ElDialog>
      <ElDialog v-model="diffOpen" title="版本差异" width="720px">
        <p v-if="diffBase" class="import-hint">
          「{{ diffBase.name }}」只读对比，不改变已发起的实例。
        </p>
        <ElSelect
          v-if="diffBase && familySiblings(diffBase).length"
          v-model="diffOtherId"
          placeholder="选择要对比的版本"
          style="width: 100%; margin-bottom: 16px"
        >
          <ElOption
            v-for="item in familySiblings(diffBase)"
            :key="item.id"
            :value="item.id"
            :label="versionLabel(item)"
          />
        </ElSelect>
        <p v-if="diffPair" class="import-hint">
          V{{ diffPair.older.version || 1 }} → V{{
            diffPair.newer.version || 1
          }}
        </p>
        <ul v-if="diffLines.length" class="diff-list">
          <li v-for="(line, index) in diffLines" :key="index">
            <ElTag
              size="small"
              effect="plain"
              :type="
                line.kind === 'add'
                  ? 'success'
                  : line.kind === 'remove'
                    ? 'danger'
                    : 'warning'
              "
              >{{
                line.kind === 'add'
                  ? '新增'
                  : line.kind === 'remove'
                    ? '删除'
                    : '变更'
              }}</ElTag
            >
            {{ line.message }}
          </li>
        </ul>
        <ElEmpty
          v-else-if="!configLog.length"
          :description="
            diffBase && familySiblings(diffBase).length
              ? '两个版本的节点、连线、办理配置和按钮、时限、数据动作、字段权限一致'
              : '这条流程还没有其他版本'
          "
        />
        <div v-if="configLog.length" class="config-log">
          <p class="import-hint">
            V{{
              diffPair?.newer.version || 1
            }}
            配置变更日志：保存或发布时记下谁改了按钮、时限、数据动作和字段权限。只读，不改变已发起的实例。
          </p>
          <ul class="diff-list">
            <li
              v-for="(entry, index) in configLog"
              :key="`${entry.at}-${index}`"
            >
              <ElTag size="small" effect="plain">{{
                entry.action === 'publish' ? '发布' : '保存'
              }}</ElTag>
              <div>
                <b>{{ entry.by }}</b>
                <span class="log-time">{{ formatLogTime(entry.at) }}</span>
                <p v-for="(line, lineIndex) in entry.lines" :key="lineIndex">
                  {{ line }}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </ElDialog>
    </div>
  </Page>
</template>

<style scoped>
.flow-list {
  color: var(--el-text-color-primary);
}

.hero {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  padding: 30px 32px;
  background: linear-gradient(
    115deg,
    var(--el-color-primary-light-9),
    var(--el-bg-color)
  );
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  color: var(--el-color-primary);
  letter-spacing: 2px;
}

h1 {
  margin: 8px 0;
  font-size: 26px;
  font-weight: 650;
}

.hero p {
  color: var(--el-text-color-secondary);
}

.hero-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.import-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 420px;
  padding: 0;
  margin: 0;
  overflow: auto;
  list-style: none;
}

.diff-list li {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  line-height: 1.5;
}

.config-log {
  margin-top: 16px;
}

.config-log p {
  margin: 4px 0 0;
}

.log-time {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.overview {
  display: flex;
  gap: 30px;
  align-items: center;
  padding: 24px 6px;
  color: var(--el-text-color-secondary);
}

.overview b {
  margin-right: 5px;
  font-size: 22px;
  color: var(--el-text-color-primary);
}

.overview-note {
  margin-left: auto;
  font-size: 12px;
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
  margin-bottom: 20px;
}

.flow-name {
  font-weight: 600;
  color: var(--el-color-primary);
  cursor: pointer;
}

.flow-code {
  margin-top: 3px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pagination {
  justify-content: flex-end;
  margin-top: 20px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 800px) {
  .overview {
    flex-wrap: wrap;
    gap: 14px;
  }

  .overview-note {
    margin-left: 0;
  }

  .hero {
    padding: 20px;
  }
}
</style>
