<script lang="ts" setup>
import type { AgreePrintFieldItem } from './fields';
/**
 * 数据源：拖到纸面生成已绑定元素；已选中纸面元素时点选改为改绑定
 */
import type { AgreePrintData } from './types';

import { computed, ref } from 'vue';

import { ElCollapse, ElCollapseItem, ElInput } from 'element-plus';

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
}>();

const emit = defineEmits<{
  /** 点选：已有选中元素时改绑定 */
  pick: [AgreePrintFieldItem];
}>();

const keyword = ref('');
const extraOpen = ref<string[]>(['tables']);
let dragging = false;

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
    <div class="print-data-panel__title">数据源</div>
    <div class="print-data-panel__hint">
      拖到纸面 =
      新建并绑定。已有元素请在右侧点「选择字段」改绑（绑的是字段名，不是某条协议）。
    </div>
    <ElInput
      v-model="keyword"
      size="small"
      clearable
      placeholder="搜索字段"
      class="mb-2"
    />

    <div class="print-data-panel__group">主表</div>
    <div class="print-data-panel__fields">
      <button
        v-for="row in textRows"
        :key="row.field"
        type="button"
        class="print-data-panel__row"
        draggable="true"
        :title="
          row.sample ? `样例 ${row.sample}，拖到纸面生成` : '拖到纸面生成'
        "
        @dragstart="onDragStart($event, row)"
        @dragend="onDragEnd"
        @click="onPick(row)"
      >
        <span class="print-data-panel__name">{{ row.text }}</span>
        <code class="print-data-panel__key">{{ row.field }}</code>
      </button>
    </div>

    <ElCollapse v-model="extraOpen" class="print-data-panel__extra">
      <ElCollapseItem title="表格（拖表名生成整表）" name="tables">
        <div
          v-for="row in tableRows"
          :key="row.field"
          class="print-data-panel__table-block"
        >
          <button
            type="button"
            class="print-data-panel__row print-data-panel__row--table"
            draggable="true"
            :title="`拖到纸面生成「${row.text}」表`"
            @dragstart="onDragStart($event, row)"
            @dragend="onDragEnd"
            @click="onPick(row)"
          >
            <span class="print-data-panel__name">{{ row.text }}</span>
            <code class="print-data-panel__key">{{ row.field }}</code>
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

.print-data-panel__hint {
  margin-bottom: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #6b7280;
}

.print-data-panel__group {
  margin: 8px 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}

.print-data-panel__fields {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.print-data-panel__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
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

.print-data-panel__row:last-child {
  border-bottom: none;
}

.print-data-panel__row--table {
  grid-template-columns: minmax(0, 1fr) auto auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px 6px 0 0;
}

.print-data-panel__name {
  color: #111827;
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
}
</style>
