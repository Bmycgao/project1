<script lang="ts" setup>
import type { AgreePrintFieldItem } from '../data/fields';
/**
 * 数据源：字段点击或拖动用于新增；绑定当前元素使用独立按钮。
 */
import type { AgreePrintData } from '../types';

import { computed, ref, watch } from 'vue';

import { ElCollapse, ElCollapseItem, ElInput, ElSwitch } from 'element-plus';

import {
  AGREE_PRINT_TABLE_FIELDS,
  AGREE_PRINT_TEXT_FIELDS,
  TABLE_COLUMN_PRESETS,
} from '../data/fields';
import {
  AGREE_PRINT_FIELD_DND,
  setAgreePrintHtml5Drag,
} from '../template/print-element-meta';

const props = defineProps<{
  /** 样例 printData（仅预览，非正式协议） */
  data: AgreePrintData;
  pointerDrag?: boolean;
  /** 当前画布选中元素的绑定字段 */
  selectedField?: string;
  selectedLabel?: string;
  /** 当前画布选中元素类型，用于说明单击行为 */
  selectedType?: string;
}>();

const emit = defineEmits<{
  pick: [AgreePrintFieldItem, 'add' | 'bind'];
  pointerDragStart: [PointerEvent, AgreePrintFieldItem];
}>();

const keyword = ref('');
const extraOpen = ref<string[]>(['tables']);
const showKeys = ref(false);
let dragging = false;

const actionHint = computed(() => {
  if (props.selectedType === 'text') {
    return `绑定目标：${props.selectedLabel || props.selectedField || '当前文本'}。点击字段添加新元素；点「绑定」替换此元素的字段。`;
  }
  if (props.selectedType === 'table') {
    return '已选中表格：列和数据源请在右侧编辑；从这里单击或拖动表名会新建另一张表。';
  }
  return '点击字段添加到画布，或拖动指定位置。选中文本后，可使用「绑定」替换其字段。';
});

watch(keyword, (value) => {
  if (value.trim()) extraOpen.value = ['tables', 'main'];
});

watch(
  () => props.selectedType,
  (type) => {
    let group;
    if (type === 'table') {
      group = 'tables';
    } else {
      group = type ? 'main' : '';
    }
    if (group && !extraOpen.value.includes(group)) {
      extraOpen.value = [...extraOpen.value, group];
    }
  },
);

/**
 * 按关键字过滤一组字段，并带上样例展示
 * @param list 字段列表
 */
function filterList(list: AgreePrintFieldItem[]) {
  const d = props.data as unknown as Record<string, unknown>;
  const kw = keyword.value.trim().toLowerCase();
  return list
    .map((item) => {
      const raw = d[item.field];
      let sample;
      if (Array.isArray(raw)) {
        sample = `${raw.length} 行`;
      } else {
        sample =
          raw === null || raw === undefined ? '' : String(raw).slice(0, 36);
      }
      return { ...item, sample };
    })
    .filter((item) => {
      if (!kw) return true;
      return (
        item.field.toLowerCase().includes(kw) ||
        item.text.toLowerCase().includes(kw) ||
        item.sample.toLowerCase().includes(kw)
      );
    });
}

const textRows = computed(() => filterList(AGREE_PRINT_TEXT_FIELDS));
const tableRows = computed(() => filterList(AGREE_PRINT_TABLE_FIELDS));

function tableColumns(field: string) {
  return TABLE_COLUMN_PRESETS[field] || [];
}

/**
 * 开始拖字段到纸面
 * @param e 拖拽事件
 * @param item 字段
 */
function onDragStart(e: DragEvent, item: AgreePrintFieldItem) {
  dragging = true;
  setAgreePrintHtml5Drag({ kind: AGREE_PRINT_FIELD_DND, item });
  const payload = JSON.stringify({ kind: AGREE_PRINT_FIELD_DND, item });
  e.dataTransfer?.setData('text/plain', payload);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}

function onDragEnd() {
  window.setTimeout(() => {
    dragging = false;
    setAgreePrintHtml5Drag(null);
  }, 0);
}

/**
 * 添加和绑定分别传递，避免选择状态改变点击含义。
 * @param item 字段
 */
function onPick(item: AgreePrintFieldItem, action: 'add' | 'bind' = 'add') {
  if (dragging) return;
  emit('pick', item, action);
}
</script>

<template>
  <div class="print-data-panel">
    <div class="print-data-panel__status">
      {{ actionHint }}
    </div>
    <div class="print-data-panel__tools">
      <ElInput
        v-model="keyword"
        size="small"
        clearable
        placeholder="搜索中文名、字段名或样例值"
      />
      <ElSwitch
        v-model="showKeys"
        :width="58"
        size="small"
        inline-prompt
        active-text="字段名"
        inactive-text="中文"
        title="切换显示中文名称或 JSON 字段名"
      />
    </div>

    <ElCollapse v-model="extraOpen" class="print-data-panel__extra">
      <ElCollapseItem name="tables">
        <template #title>
          <div class="print-data-panel__collapse-title">
            <strong>表格数据</strong>
            <span>拖动表名，新建整表</span>
          </div>
        </template>
        <div
          v-for="row in tableRows"
          :key="row.field"
          class="print-data-panel__table-block"
        >
          <button
            type="button"
            class="print-data-panel__row print-data-panel__row--table"
            :draggable="!pointerDrag"
            @pointerdown="pointerDrag && emit('pointerDragStart', $event, row)"
            :title="`单击添加或拖到画布生成「${row.text}」表`"
            @dragstart="onDragStart($event, row)"
            @dragend="onDragEnd"
            @click="onPick(row)"
          >
            <span class="print-data-panel__grip">⠿</span>
            <span class="print-data-panel__name">{{ row.text }}</span>
            <code v-if="showKeys" class="print-data-panel__key">
              {{ row.field }}
            </code>
            <span class="print-data-panel__val">{{ row.sample }}</span>
          </button>
          <div class="print-data-panel__cols">
            <span
              v-for="col in tableColumns(row.field)"
              :key="col.field"
              class="print-data-panel__col"
            >
              {{ col.title }}
            </span>
          </div>
        </div>
      </ElCollapseItem>
      <ElCollapseItem name="main">
        <template #title>
          <div class="print-data-panel__collapse-title">
            <strong>主表字段</strong>
            <span>点击添加到画布</span>
          </div>
        </template>
        <div class="print-data-panel__fields">
          <div
            v-for="row in textRows"
            :key="row.field"
            class="print-data-panel__field"
            :class="{
              'is-current': row.field === selectedField,
            }"
          >
            <button
              type="button"
              class="print-data-panel__row"
              :draggable="!pointerDrag"
              @pointerdown="
                pointerDrag && emit('pointerDragStart', $event, row)
              "
              :aria-label="`添加到画布：${row.text}`"
              :title="`${row.text} (${row.field})${row.sample ? `；样例 ${row.sample}` : ''}；点击添加到画布，拖动指定位置`"
              @dragstart="onDragStart($event, row)"
              @dragend="onDragEnd"
              @click="onPick(row)"
            >
              <span class="print-data-panel__grip">⠿</span>
              <span class="print-data-panel__name">{{ row.text }}</span>
              <code v-if="showKeys" class="print-data-panel__key">
                {{ row.field }}
              </code>
              <span v-else class="print-data-panel__val">
                {{ row.sample || '暂无样例' }}
              </span>
              <span class="print-data-panel__add" aria-hidden="true">＋</span>
            </button>
            <button
              v-if="selectedType === 'text'"
              type="button"
              class="print-data-panel__bind"
              :disabled="row.field === selectedField"
              :aria-label="`将${row.text}绑定到当前元素`"
              :title="`替换「${selectedLabel || selectedField || '当前文本'}」的绑定`"
              @click="onPick(row, 'bind')"
            >
              {{ row.field === selectedField ? '已绑定' : '绑定' }}
            </button>
          </div>
        </div>
        <div v-if="textRows.length === 0" class="print-data-panel__empty">
          没有匹配的主表字段
        </div>
      </ElCollapseItem>
    </ElCollapse>
  </div>
</template>

<style scoped>
.print-data-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding-top: 0;
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.print-data-panel__status {
  padding: 7px 8px;
  margin-bottom: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
}

.print-data-panel__tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.print-data-panel__fields {
  /* 统一由字段面板承担滚动，避免字段列表再套一层滚动条。 */
  max-height: none;
  overflow: visible;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.print-data-panel__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 35%) auto;
  gap: 4px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  text-align: left;
  touch-action: none;
  cursor: grab;
  user-select: none;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.print-data-panel__row:hover {
  background: var(--el-color-primary-light-9);
}

.print-data-panel__field.is-current {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-8);
}

.print-data-panel__field {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.print-data-panel__field .print-data-panel__row {
  flex: 1;
  min-width: 0;
  border: 0;
}

.print-data-panel__add {
  color: var(--el-color-primary);
}

.print-data-panel__bind {
  flex: none;
  padding: 0 7px;
  font-size: 11px;
  color: var(--el-color-primary);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-left: 1px solid var(--el-border-color-lighter);
}

.print-data-panel__bind:hover {
  background: var(--el-color-primary-light-9);
}

.print-data-panel__bind:disabled {
  color: var(--el-text-color-secondary);
  cursor: default;
}

.print-data-panel__row:last-child {
  border-bottom: none;
}

.print-data-panel__row--table {
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 6px 6px 0 0;
}

.print-data-panel__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.print-data-panel__grip {
  color: var(--el-text-color-secondary);
}

.print-data-panel__key {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.print-data-panel__val {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  text-align: right;
  white-space: nowrap;
}

.print-data-panel__table-block {
  margin-bottom: 8px;
}

.print-data-panel__cols {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-top: 0;
  border-radius: 0 0 6px 6px;
}

.print-data-panel__col {
  padding: 1px 6px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}

.print-data-panel__extra {
  flex: 1;
  min-height: 0;
  margin-top: 8px;
  overflow: hidden auto;
}

.print-data-panel__collapse-title {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
}

.print-data-panel__collapse-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.print-data-panel__empty {
  padding: 12px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
</style>
