<script setup lang="ts">
import type {
  NodeType,
  WorkflowDocument,
  WorkflowIssue,
  WorkflowOptions,
} from './model';
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from 'vue-router';
import { Page } from '@vben/common-ui';
import {
  ElButton,
  ElEmpty,
  ElMessage,
  ElMessageBox,
  ElTag,
} from 'element-plus';
import {
  getWorkflow,
  getWorkflowOptions,
  updateWorkflow,
  createWorkflowVersion,
} from '#/api/system/workflow';
import {
  NODE_LABELS,
  createDocument,
  createNode,
  documentOf,
  newId,
  sampleGraph,
  validateWorkflow,
  applyImportedWorkflow,
  downloadWorkflowJson,
  readWorkflowJsonFile,
} from './model';
import FlowCanvas from './flow-canvas.vue';
import Inspector from './inspector.vue';
import PublicationDialog from './publication-dialog.vue';

const route = useRoute();
const router = useRouter();
const doc = ref<WorkflowDocument>(createDocument());
const canvas = ref<InstanceType<typeof FlowCanvas>>();
const publication = ref<InstanceType<typeof PublicationDialog>>();
const jsonFile = ref<HTMLInputElement>();
const readOnly = ref(false);
const version = ref(1);
async function newVersion() {
  try {
    const result = await createWorkflowVersion(loadedId.value);
    await router.push(`/system/workflow/edit/${result.id}`);
  } catch {}
}
async function openPublication() {
  if (dirty.value) {
    ElMessage.warning('请先保存草稿，再进行发布检查');
    return;
  }
  await publication.value?.open(loadedId.value);
}
const loading = ref(true);
const loadError = ref(false);
const saving = ref(false);
const loadedId = ref('');
const revision = ref(0);
const savedAt = ref('');
const savedSnapshot = ref('');
const selectedNode = ref('');
const selectedEdge = ref('');
const node = computed(() =>
  doc.value.nodes.find((n) => n.id === selectedNode.value),
);
const edge = computed(() =>
  doc.value.edges.find((e) => e.id === selectedEdge.value),
);
const dirty = computed(
  () =>
    !readOnly.value &&
    !!savedSnapshot.value &&
    JSON.stringify(doc.value) !== savedSnapshot.value,
);
const options = ref<WorkflowOptions>({
  roles: [],
  users: [],
  departments: [],
  views: [],
  workflows: [],
});
const optionsError = ref(false);
const optionsLoaded = ref(false);
const issues = ref<WorkflowIssue[]>([]);
const checked = ref(false);
const validationStale = ref(false);
const errorNodes = computed(() =>
  validationStale.value
    ? []
    : issues.value.flatMap((i) => (i.nodeId ? [i.nodeId] : [])),
);
const errorEdges = computed(() =>
  validationStale.value
    ? []
    : issues.value.flatMap((i) => (i.edgeId ? [i.edgeId] : [])),
);
const palette = Object.entries(NODE_LABELS) as [NodeType, string][];
const history = ref<string[]>([]);
const historyIndex = ref(0);
const pendingHistory = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let suppressHistory = false;
let active = true;
let loadSequence = 0;

function flushHistory() {
  clearTimeout(timer);
  pendingHistory.value = false;
  if (loading.value || suppressHistory) return;
  const snapshot = JSON.stringify(doc.value);
  if (history.value[historyIndex.value] === snapshot) return;
  history.value = [
    ...history.value.slice(0, historyIndex.value + 1),
    snapshot,
  ].slice(-80);
  historyIndex.value = history.value.length - 1;
}
watch(
  doc,
  () => {
    if (suppressHistory || loading.value) return;
    pendingHistory.value = true;
    clearTimeout(timer);
    timer = setTimeout(flushHistory, 400);
  },
  { deep: true, flush: 'sync' },
);
// Panning, zooming and positioning do not invalidate graph validation or its highlights.
watch(
  () =>
    JSON.stringify({
      ...doc.value,
      viewport: undefined,
      nodes: doc.value.nodes.map((n) => ({ ...n, x: undefined, y: undefined })),
    }),
  () => {
    if (checked.value && !suppressHistory && !loading.value)
      validationStale.value = true;
  },
  { flush: 'sync' },
);
function travel(offset: number) {
  if (readOnly.value) return;
  flushHistory();
  const index = historyIndex.value + offset;
  if (index < 0 || index >= history.value.length) return;
  suppressHistory = true;
  doc.value = JSON.parse(history.value[index]!);
  historyIndex.value = index;
  suppressHistory = false;
  checked.value = false;
  if (!node.value) selectedNode.value = '';
  if (!edge.value) selectedEdge.value = '';
}
function select(kind: 'node' | 'edge' | 'none', id: string) {
  flushHistory();
  selectedNode.value = kind === 'node' ? id : '';
  selectedEdge.value = kind === 'edge' ? id : '';
}
async function loadOptions() {
  try {
    options.value = await getWorkflowOptions();
    optionsError.value = false;
    optionsLoaded.value = true;
  } catch {
    optionsError.value = true;
    optionsLoaded.value = false;
  }
}
async function load(id: string) {
  const sequence = ++loadSequence;
  loading.value = true;
  loadError.value = false;
  clearTimeout(timer);
  try {
    const record = await getWorkflow(id);
    if (sequence !== loadSequence) return;
    doc.value = documentOf(record);
    readOnly.value = record.status !== 'draft';
    version.value = record.version || 1;
    loadedId.value = record.id;
    revision.value = record.revision;
    savedAt.value = record.updatedAt;
    savedSnapshot.value = JSON.stringify(doc.value);
    history.value = [savedSnapshot.value];
    historyIndex.value = 0;
    pendingHistory.value = false;
    selectedNode.value = '';
    selectedEdge.value = '';
    checked.value = false;
  } catch {
    if (sequence === loadSequence) loadError.value = true;
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
function check() {
  const result = validateWorkflow(doc.value);
  if (!optionsLoaded.value)
    result.push({
      message: '可选资源尚未加载，暂时无法校验表单和办理人引用，请重试',
    });
  else
    for (const n of doc.value.nodes) {
      if (
        n.form.id &&
        !options.value.views.some(
          (v) => v.id === n.form.id && v.type === n.form.type,
        )
      )
        result.push({ nodeId: n.id, message: `${n.name}：绑定表单已失效` });
      const pool =
        n.assignee.type === 'role'
          ? options.value.roles
          : n.assignee.type === 'user'
            ? options.value.users
            : n.assignee.type === 'departmentLeader'
              ? options.value.departments
              : undefined;
      if (pool && n.assignee.ids.some((id) => !pool.some((p) => p.id === id)))
        result.push({ nodeId: n.id, message: `${n.name}：办理人引用已失效` });
    }
  issues.value = result;
  checked.value = true;
  validationStale.value = false;
  return result;
}
function runCheck() {
  const result = check();
  if (!result.length)
    ElMessage.success('结构与绑定校验通过，条件表达式语义将在服务端接入后校验');
}
async function save() {
  if (readOnly.value) return;
  if (saving.value || loading.value || loadError.value) return;
  check();
  flushHistory();
  const payload = documentOf(doc.value);
  const id = loadedId.value;
  saving.value = true;
  try {
    const record = await updateWorkflow(id, payload, revision.value);
    revision.value = record.revision;
    savedAt.value = record.updatedAt;
    const normalized = documentOf(record);
    // Edits made while the request is in flight stay in the editor and remain dirty.
    if (JSON.stringify(doc.value) === JSON.stringify(payload)) {
      suppressHistory = true;
      doc.value = normalized;
      suppressHistory = false;
    }
    savedSnapshot.value = JSON.stringify(normalized);
    ElMessage.success('已保存草稿，尚未发布，不影响线上流程');
  } catch {
    /* Never clear dirty state or replace user edits when saving fails. */
  } finally {
    saving.value = false;
  }
}
function nextCode() {
  let n = doc.value.nodes.length + 1;
  while (doc.value.nodes.some((node) => node.code === `N_${n}`)) n++;
  return n;
}
function add(type: NodeType, x?: number, y?: number) {
  if (readOnly.value) return;
  if (type === 'start' && doc.value.nodes.some((n) => n.type === 'start')) {
    ElMessage.warning('一个流程只能有一个开始节点');
    return;
  }
  if (doc.value.nodes.length >= 200) {
    ElMessage.warning('单个流程最多支持 200 个节点');
    return;
  }
  flushHistory();
  const center = canvas.value?.center() || { x: 300, y: 200 };
  const created = createNode(
    type,
    Math.round((x ?? center.x) / 10) * 10,
    Math.round((y ?? center.y) / 10) * 10,
    nextCode(),
  );
  doc.value.nodes.push(created);
  select('node', created.id);
  flushHistory();
}
function dragPalette(event: DragEvent, type: NodeType) {
  event.dataTransfer?.setData('application/workflow-node', type);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
}
function moveNode(id: string, x: number, y: number) {
  if (readOnly.value) return;
  const n = doc.value.nodes.find((n) => n.id === id);
  if (n) {
    n.x = x;
    n.y = y;
  }
}
function connect(source: string, target: string) {
  if (readOnly.value) return;
  const from = doc.value.nodes.find((n) => n.id === source);
  const to = doc.value.nodes.find((n) => n.id === target);
  if (!from || !to || source === target) return;
  if (from.type === 'end' || to.type === 'start') {
    ElMessage.warning('结束节点不能流出，开始节点不能流入');
    return;
  }
  if (doc.value.edges.some((e) => e.source === source && e.target === target)) {
    ElMessage.warning('这两个节点之间已有连线');
    return;
  }
  if (doc.value.edges.length >= 600) {
    ElMessage.warning('连线数量已达上限');
    return;
  }
  flushHistory();
  const id = newId('edge');
  doc.value.edges.push({
    id,
    source,
    target,
    type: from.type === 'condition' ? 'condition' : 'pass',
    label: from.type === 'condition' ? '条件分支' : '通过',
    condition: '',
    isDefault: false,
  });
  select('edge', id);
  flushHistory();
}
async function removeSelection() {
  if (readOnly.value) return;
  const selected = node.value || edge.value;
  if (!selected) return;
  const nodeId = node.value?.id;
  const edgeId = edge.value?.id;
  const related = doc.value.edges.filter(
    (e) => e.source === nodeId || e.target === nodeId,
  ).length;
  try {
    await ElMessageBox.confirm(
      nodeId
        ? `删除「${node.value?.name}」${related ? `及其关联的 ${related} 条连线` : ''}？可通过撤销恢复。`
        : '删除选中的连线？可通过撤销恢复。',
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  flushHistory();
  if (nodeId) {
    doc.value.nodes = doc.value.nodes.filter((n) => n.id !== nodeId);
    doc.value.edges = doc.value.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    );
  } else doc.value.edges = doc.value.edges.filter((e) => e.id !== edgeId);
  select('none', '');
  flushHistory();
}
function duplicate() {
  if (readOnly.value) return;
  if (!node.value || ['start', 'end'].includes(node.value.type)) return;
  if (doc.value.nodes.length >= 200) {
    ElMessage.warning('节点数量已达上限');
    return;
  }
  flushHistory();
  const copy = JSON.parse(JSON.stringify(node.value));
  copy.id = newId('node');
  copy.code = `N_${nextCode()}`;
  copy.name = `${copy.name}（副本）`;
  copy.x += 40;
  copy.y += 110;
  doc.value.nodes.push(copy);
  select('node', copy.id);
  flushHistory();
}
async function useSample() {
  if (readOnly.value) return;
  try {
    await ElMessageBox.confirm(
      '用八节点审核示例替换当前画布？流程基本信息保留，可通过撤销恢复。',
      '载入示例',
      { type: 'info' },
    );
  } catch {
    return;
  }
  flushHistory();
  Object.assign(doc.value, sampleGraph());
  select('none', '');
  checked.value = false;
  await nextTick();
  canvas.value?.fit();
  flushHistory();
  ElMessage.info('示例已载入，请为审批节点选择实际办理人');
}
/** 打印当前流程图，不改流程数据 */
function printChart() {
  try {
    canvas.value?.printChart(
      doc.value.name || '未命名流程',
      `${doc.value.code || '未编码'} · V${version.value}`,
    );
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : '无法打印');
  }
}
/** 导出当前流程设计为 JSON 文件 */
function exportJson() {
  downloadWorkflowJson(doc.value);
  ElMessage.success('已导出流程 JSON');
}
/** 草稿中选择 JSON 文件替换画布，保留当前名称编码基地 */
async function importJsonFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || readOnly.value) return;
  let incoming;
  try {
    incoming = await readWorkflowJsonFile(file);
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : '导入失败');
    return;
  }
  try {
    await ElMessageBox.confirm(
      '用导入的流程图替换当前画布？名称、编码、基地保持不变，可通过撤销恢复。',
      '导入流程 JSON',
      { type: 'info' },
    );
  } catch {
    return;
  }
  flushHistory();
  doc.value = applyImportedWorkflow(doc.value, incoming, true);
  select('none', '');
  checked.value = false;
  await nextTick();
  canvas.value?.fit();
  flushHistory();
  ElMessage.success('流程 JSON 已导入，请保存草稿');
}
function locate(issue: WorkflowIssue) {
  if (issue.nodeId) canvas.value?.focusNode(issue.nodeId);
  else if (issue.edgeId) canvas.value?.focusEdge(issue.edgeId);
  else select('none', '');
}
async function mayLeave() {
  if (saving.value) {
    ElMessage.info('正在保存，请稍候');
    return false;
  }
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(
      '有未保存的流程配置，离开将丢失这些修改。',
      '离开设计器',
      {
        confirmButtonText: '放弃修改并离开',
        cancelButtonText: '继续编辑',
        type: 'warning',
      },
    );
    clearTimeout(timer);
    suppressHistory = true;
    doc.value = JSON.parse(savedSnapshot.value);
    suppressHistory = false;
    history.value = [savedSnapshot.value];
    historyIndex.value = 0;
    pendingHistory.value = false;
    checked.value = false;
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
function keydown(event: KeyboardEvent) {
  if (
    !active ||
    loading.value ||
    loadError.value ||
    !route.path.startsWith('/system/workflow/edit/')
  )
    return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save();
    return;
  }
  const target = event.target as HTMLElement | null;
  if (
    target?.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"]',
    )
  )
    return;
  if (event.key === 'Escape') canvas.value?.cancelLink();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    travel(event.shiftKey ? 1 : -1);
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    travel(1);
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    void removeSelection();
  }
}
onBeforeRouteLeave(mayLeave);
onBeforeRouteUpdate((to, from) =>
  to.params.id === from.params.id ? true : mayLeave(),
);
watch(
  () => route.params.id,
  (id) => {
    if (
      active &&
      route.path.startsWith('/system/workflow/edit/') &&
      id &&
      String(id) !== loadedId.value
    )
      void load(String(id));
  },
);
onMounted(() => {
  void load(String(route.params.id));
  void loadOptions();
  window.addEventListener('keydown', keydown);
  window.addEventListener('beforeunload', beforeUnload);
});
onActivated(() => {
  active = true;
  if (loadedId.value && !loading.value && route.params.id && !dirty.value) {
    void load(String(route.params.id));
  }
});
onDeactivated(() => {
  active = false;
});
onBeforeUnmount(() => {
  ++loadSequence;
  clearTimeout(timer);
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
  <Page auto-content-height>
    <PublicationDialog
      ref="publication"
      @published="load(loadedId)"
      @locate="locate"
    />
    <div v-loading="loading" class="designer">
      <ElEmpty v-if="loadError" description="流程加载失败，请重试"
        ><ElButton type="primary" @click="load(String(route.params.id))"
          >重新加载</ElButton
        ><ElButton @click="router.push('/system/workflow')"
          >返回列表</ElButton
        ></ElEmpty
      >
      <template v-else-if="!loading">
        <header class="designer-header">
          <div class="title-area">
            <ElButton text @click="router.push('/system/workflow')"
              >← 返回</ElButton
            >
            <div>
              <div class="title-line">
                <h1>{{ doc.name || '未命名流程' }}</h1>
                <ElTag type="info" size="small"
                  >V{{ version }} ·
                  {{ readOnly ? '已发布快照' : '草稿' }}</ElTag
                >
              </div>
              <p>
                {{ doc.code }} · {{ doc.base
                }}<span :class="{ unsaved: dirty }">{{
                  dirty
                    ? '● 有未保存修改'
                    : `已保存 ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
                }}</span>
              </p>
            </div>
          </div>
          <div class="toolbar">
            <ElButton :disabled="!doc.nodes.length" @click="printChart"
              >打印</ElButton
            >
            <template v-if="!readOnly"
              ><ElButton
                :disabled="historyIndex === 0 && !pendingHistory"
                title="Ctrl+Z"
                @click="travel(-1)"
                >撤销</ElButton
              ><ElButton
                :disabled="historyIndex >= history.length - 1"
                title="Ctrl+Shift+Z"
                @click="travel(1)"
                >重做</ElButton
              ><ElButton @click="select('none', '')">流程属性</ElButton
              ><ElButton @click="runCheck">校验流程</ElButton
              ><ElButton
                type="primary"
                :loading="saving"
                title="Ctrl+S"
                @click="save"
                >保存草稿</ElButton
              ></template
            ><ElButton
              v-if="!readOnly"
              type="success"
              :disabled="saving"
              @click="openPublication"
              >发布</ElButton
            ><ElButton v-else type="primary" @click="newVersion"
              >新建版本</ElButton
            >
          </div>
        </header>
        <div class="designer-body">
          <aside class="palette">
            <div class="palette-title">节点组件</div>
            <p>拖入画布，或点击添加</p>
            <button
              v-for="[type, label] in palette"
              :key="type"
              class="palette-node"
              :class="type"
              draggable="true"
              :disabled="readOnly"
              @dragstart="dragPalette($event, type)"
              @click="add(type)"
            >
              <i>{{
                type === 'condition'
                  ? '◇'
                  : type === 'start'
                    ? '▷'
                    : type === 'end'
                      ? '□'
                      : type === 'approve'
                        ? '✓'
                        : '▤'
              }}</i
              ><span>{{ label }}</span>
            </button>
            <div class="palette-guide">
              <b>配置一条流程</b><span>1. 添加节点并连线</span
              ><span>2. 配置办理人和表单</span><span>3. 校验后保存草稿</span>
            </div>
            <ElButton size="small" :disabled="readOnly" @click="useSample"
              >载入审核示例</ElButton
            >
            <ElButton size="small" @click="exportJson">导出 JSON</ElButton>
            <ElButton
              size="small"
              :disabled="readOnly"
              @click="jsonFile?.click()"
              >导入 JSON</ElButton
            >
            <input
              ref="jsonFile"
              type="file"
              accept="application/json,.json"
              hidden
              @change="importJsonFile"
            />
            <div class="palette-note">
              {{ doc.nodes.length }} 个节点 · {{ doc.edges.length }} 条连线
            </div>
          </aside>
          <div class="canvas-column">
            <FlowCanvas
              ref="canvas"
              :document="doc"
              :read-only="readOnly"
              :selected-node="selectedNode"
              :selected-edge="selectedEdge"
              :error-node-ids="errorNodes"
              :error-edge-ids="errorEdges"
              @select="select"
              @move="moveNode"
              @viewport="doc.viewport = $event"
              @add="add"
              @connect="connect"
              @finish="flushHistory"
            />
            <div v-if="checked" class="validation-panel">
              <div class="validation-heading">
                <b>{{
                  validationStale
                    ? '配置已更改，请重新校验'
                    : issues.length
                      ? `发现 ${issues.length} 项问题`
                      : '结构与绑定校验通过'
                }}</b
                ><ElButton link size="small" @click="checked = false"
                  >收起</ElButton
                >
              </div>
              <p v-if="!issues.length">
                条件表达式的语义和分支互斥性尚待服务端验证；保存仅更新草稿。
              </p>
              <div class="issue-list">
                <button
                  v-for="(issue, i) in issues"
                  :key="i"
                  @click="locate(issue)"
                >
                  <span>{{ i + 1 }}</span
                  >{{ issue.message }}<b>定位 →</b>
                </button>
              </div>
            </div>
          </div>
          <Inspector
            :document="doc"
            :read-only="readOnly"
            :node="node"
            :edge="edge"
            :options="options"
            :options-error="optionsError"
            :buttons="[]"
            @remove="removeSelection"
            @duplicate="duplicate"
            @retry="loadOptions"
            @select-edge="select('edge', $event)"
          />
        </div>
      </template>
    </div>
  </Page>
</template>

<style scoped>
.designer {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 145px);
  min-height: 650px;
  overflow: hidden;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.designer-header {
  display: flex;
  flex-shrink: 0;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.title-area,
.title-line,
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.title-area {
  min-width: 0;
}

.title-line h1 {
  max-width: 270px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
}

.title-area p {
  margin-top: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.title-area p span {
  margin-left: 14px;
}

.unsaved {
  color: #c28b18;
}

.toolbar {
  flex-shrink: 0;
  gap: 0;
}

.designer-body {
  display: grid;
  flex: 1;
  grid-template-columns: 174px minmax(280px, 1fr) 304px;
  min-height: 0;
}

.palette {
  padding: 19px 15px;
  overflow-y: auto;
  border-right: 1px solid var(--el-border-color-lighter);
}

.palette-title {
  font-size: 13px;
  font-weight: 600;
}

.palette p {
  margin: 6px 0 20px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.palette-node {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 13px 10px;
  margin-bottom: 10px;
  font-size: 12px;
  text-align: left;
  cursor: grab;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  transition:
    border-color 0.15s,
    transform 0.15s;
}

.palette-node:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-1px);
}

.palette-node i {
  font-size: 17px;
  font-style: normal;
  color: #3478d4;
}

.start i {
  color: #15976c;
}

.approve i {
  color: #6d5bd0;
}

.condition i {
  color: #c28b18;
}

.end i {
  color: #64748b;
}

.palette-guide {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 20px 0;
  margin-top: 14px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
}

.palette-guide b {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.palette-note {
  margin-top: 16px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.palette :deep(.el-button) {
  width: 100%;
  margin: 0 0 8px;
}

.canvas-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.canvas-column > :first-child {
  flex: 1;
  min-height: 300px;
}

.validation-panel {
  flex-shrink: 0;
  max-height: 215px;
  padding: 12px 18px;
  overflow: auto;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color);
}

.validation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.validation-heading b {
  font-weight: 600;
}

.validation-panel p {
  margin-top: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.issue-list button {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 7px 0;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.issue-list button:hover {
  color: var(--el-color-primary);
}

.issue-list span {
  color: #dc5964;
}

.issue-list b {
  margin-left: auto;
  font-weight: 400;
  color: var(--el-color-primary);
  white-space: nowrap;
}

@media (max-width: 1200px) {
  .designer-header {
    flex-wrap: wrap;
  }

  .designer-body {
    grid-template-columns: 150px minmax(240px, 1fr) 280px;
  }

  .title-line h1 {
    max-width: 200px;
  }
}

@media (max-width: 850px) {
  .designer {
    overflow-x: auto;
  }

  .designer-header,
  .designer-body {
    min-width: 850px;
  }
}
</style>
