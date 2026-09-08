<script lang="ts" setup>
import type { AgreePrintFieldItem } from './fields';
/**
 * 数据源：拖到画布精准定位；点选时自动添加，已有文本选中则改绑定
 */
import type { AgreePrintData } from './types';

import { computed, ref, watch } from 'vue';

import { ElCollapse, ElCollapseItem, ElInput, ElSwitch } from 'element-plus';

import {
  AGREE_PRINT_TABLE_FIELDS,
  AGREE_PRINT_TEXT_FIELDS,
  TABLE_COLUMN_PRESETS,
} from './fields';
import {
  AGREE_PRINT_FIELD_DND,
  setAgreePrintHtml5Drag,
} from './print-element-meta';

const props = defineProps<{
  /** 样例 printData（仅预览，非正式协议） */
  data: AgreePrintData;
  /** 当前画布选中元素的绑定字段 */
  selectedField?: string;
  /** 当前画布选中元素类型，用于说明单击行为 */
  selectedType?: string;
}>();

const emit = defineEmits<{
  /** 点选：已有选中元素时改绑定 */
  pick: [AgreePrintFieldItem];
}>();

const keyword = ref('');
const extraOpen = ref<string[]>(['tables']);
const showKeys = ref(false);
let dragging = false;

const actionHint = computed(() => {
  if (props.selectedType && props.selectedType !== 'table') {
    return props.selectedField
      ? `已选中绑定字段 ${props.selectedField}：单击主表字段可改绑；拖动会新建元素。`
      : '已选中文本元素：单击主表字段可绑定；拖动会新建元素。';
  }
  if (props.selectedType === 'table') {
    return '已选中表格：列和数据源请在右侧编辑；从这里单击或拖动表名会新建另一张表。';
  }
  return '未选择元素：单击会在当前页自动添加；拖到画布可精确指定位置。';
});

watch(keyword, (value) => {
  if (value.trim()) extraOpen.value = ['tables', 'main'];
});

watch(
  () => props.selectedType,
  (type) => {
    const group = type === 'table' ? 'tables' : type ? 'main' : '';
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
      const sample = Array.isArray(raw)
        ? `${raw.length} 行`
        : raw === null || raw === undefined
          ? ''
          : String(raw).slice(0, 36);
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
 * 点选：已选中纸面元素时改绑定
 * @param item 字段
 */
function onPick(item: AgreePrintFieldItem) {
  if (dragging) return;
  emit('pick', item);
}
</script>

<template>
  <div class="print-data-panel">
    <div class="print-data-panel__title">可绑定字段</div>
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
            draggable="true"
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
            <span>单击添加/改绑，拖动定位</span>
          </div>
        </template>
        <div class="print-data-panel__fields">
          <button
            v-for="row in textRows"
            :key="row.field"
            type="button"
            class="print-data-panel__row"
            :class="{ 'is-current': row.field === selectedField }"
            draggable="true"
            :title="`${row.text} (${row.field})${row.sample ? `；样例 ${row.sample}` : ''}；单击添加/改绑，拖到画布新建`"
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
          </button>
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
  padding-top: 10px;
  font-size: 12px;
  color: #374151;
  border-top: 1px dashed #e5e7eb;
}

.print-data-panel__title {
  margin-bottom: 4px;
  font-weight: 600;
}

.print-data-panel__status {
  padding: 7px 8px;
  margin-bottom: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
}

.print-data-panel__tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.print-data-panel__fields {
  max-height: 300px;
  overflow: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.print-data-panel__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 4px;
  width: 100%;
  padding: 6px 8px;
  text-align: left;
  cursor: grab;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #f3f4f6;
}

.print-data-panel__row:hover {
  background: #eff6ff;
}

.print-data-panel__row.is-current {
  color: #1d4ed8;
  background: #dbeafe;
}

.print-data-panel__row:last-child {
  border-bottom: none;
}

.print-data-panel__row--table {
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px 6px 0 0;
}

.print-data-panel__name {
  color: #111827;
}

.print-data-panel__grip {
  color: #94a3b8;
}

.print-data-panel__key {
  font-size: 10px;
  color: #9ca3af;
}

.print-data-panel__val {
  font-size: 10px;
  color: #9ca3af;
}

.print-data-panel__table-block {
  margin-bottom: 8px;
}

.print-data-panel__cols {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px 8px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-top: 0;
  border-radius: 0 0 6px 6px;
}

.print-data-panel__col {
  padding: 1px 6px;
  font-size: 10px;
  color: #6b7280;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

.print-data-panel__extra {
  margin-top: 8px;
  overflow: auto;
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
  color: #6b7280;
  white-space: nowrap;
}

.print-data-panel__empty {
  padding: 12px;
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
}
</style>
