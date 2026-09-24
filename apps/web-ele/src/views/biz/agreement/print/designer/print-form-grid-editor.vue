<script setup lang="ts">
import type { FormGrid } from '../runtime/print-form-grid';
import type { PrintElementRef } from '../template/print-element-meta';
import type {
  PrintFieldPickMode,
  PrintFieldTreeNode,
} from './print-field-tree';

import { computed, ref } from 'vue';

import {
  ElButton,
  ElCheckbox,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElTabPane,
  ElTabs,
} from 'element-plus';

import { cloneJson } from '../../clone';
import { AGREE_PRINT_FORMAT_GROUPS } from '../data/format-print-value';
import { validatePrintExpr } from '../runtime/print-expr';
import {
  compileFormGrid,
  formGridSpans,
  mergeFormCells,
  normalizeFormGrid,
  resizeFormGrid,
} from '../runtime/print-form-grid';
import PrintFieldPicker from './print-field-picker.vue';
import PrintTableSample from './print-table-sample.vue';

const props = defineProps<{
  element?: PrintElementRef;
  modelValue: unknown;
  sampleData: Record<string, unknown>;
}>();
const emit = defineEmits<{
  apply: [{ grid: FormGrid; options: Record<string, any> }];
  'update:modelValue': [FormGrid];
}>();
const open = ref(false);
const settingScope = ref('cell');
const draftOptions = ref<Record<string, any>>({});
const draft = ref(normalizeFormGrid(props.modelValue));
const start = ref([0, 0]);
const end = ref([0, 0]);
const selectedRow = computed(() => draft.value.rows[start.value[0]!]!);
const selectedCell = computed(() => selectedRow.value.cells[start.value[1]!]!);
const spans = computed(() => formGridSpans(draft.value));
const formats = AGREE_PRINT_FORMAT_GROUPS.flatMap((group) => group.options);
const pickerOpen = ref(false);
const pickerMode = ref<PrintFieldPickMode>('text');
const pickerScope = ref<'root' | 'row'>('root');
const sampleCell = computed(() => {
  const row = compileFormGrid(draft.value, props.sampleData).rows.find(
    (item) => item.__formTemplateRow === start.value[0],
  );
  return row?.[`__form_c${start.value[1]}`] ?? '（无数据）';
});

function edit() {
  draft.value = normalizeFormGrid(props.modelValue);
  draftOptions.value = cloneJson(props.element?.options || {});
  settingScope.value = 'cell';
  start.value = [0, 0];
  end.value = [0, 0];
  open.value = true;
}
function choose(event: MouseEvent, r: number, c: number) {
  settingScope.value = 'cell';
  if (event.shiftKey) end.value = [r, c];
  else {
    start.value = [r, c];
    end.value = [r, c];
  }
}
function inSelection(r: number, c: number) {
  return (
    r >= Math.min(start.value[0]!, end.value[0]!) &&
    r <= Math.max(start.value[0]!, end.value[0]!) &&
    c >= Math.min(start.value[1]!, end.value[1]!) &&
    c <= Math.max(start.value[1]!, end.value[1]!)
  );
}
function merge() {
  try {
    draft.value = mergeFormCells(
      draft.value,
      start.value[0]!,
      start.value[1]!,
      end.value[0]!,
      end.value[1]!,
    );
    start.value = [
      Math.min(start.value[0]!, end.value[0]!),
      Math.min(start.value[1]!, end.value[1]!),
    ];
    end.value = [...start.value];
  } catch (error) {
    ElMessage.warning((error as Error).message);
  }
}
function split() {
  selectedCell.value.rowspan = 1;
  selectedCell.value.colspan = 1;
}
function resize(axis: 'column' | 'row', remove = false) {
  const index = start.value[axis === 'row' ? 0 : 1]! + (remove ? 0 : 1);
  draft.value = resizeFormGrid(draft.value, axis, index, remove);
  start.value = [
    Math.min(start.value[0]!, draft.value.rows.length - 1),
    Math.min(start.value[1]!, draft.value.columns.length - 1),
  ];
  end.value = [...start.value];
}
function openPicker(source = false) {
  pickerMode.value = source
    ? 'table'
    : pickerScope.value === 'row'
      ? 'column'
      : 'text';
  pickerOpen.value = true;
}
function pick(node: PrintFieldTreeNode) {
  if (pickerMode.value === 'table') setSource(node.field || '');
  else
    selectedCell.value.value = `${pickerScope.value === 'row' ? 'row.' : ''}${node.field || ''}`;
}
function setSource(value: string) {
  const r = start.value[0]!;
  // 动态行不能被前面的跨行单元格覆盖，也不能向下跨行。
  if (value) {
    draft.value.rows.forEach((row, index) =>
      row.cells.forEach((cell) => {
        if (index <= r && index + (cell.rowspan || 1) > r) cell.rowspan = 1;
      }),
    );
  }
  selectedRow.value.source = value.trim();
}
function save() {
  for (const [r, row] of draft.value.rows.entries())
    for (const [c, cell] of row.cells.entries()) {
      if (
        !spans.value[r]?.[c]?.[0] ||
        cell.mode !== 'formula' ||
        !cell.value.trim()
      )
        continue;
      const check = validatePrintExpr(cell.value, {
        ...props.sampleData,
        root: props.sampleData,
        row: {},
        index: 0,
      });
      if (!check.ok) {
        start.value = [r, c];
        end.value = [r, c];
        settingScope.value = 'cell';
        ElMessage.warning(`第 ${r + 1} 行第 ${c + 1} 列：${check.message}`);
        return;
      }
    }
  const grid = normalizeFormGrid(draft.value);
  emit('update:modelValue', grid);
  emit('apply', { grid, options: cloneJson(draftOptions.value) });
  open.value = false;
}
</script>

<template>
  <div class="form-grid-entry">
    <p>按格设置内容；整表外观在「样式」修改，显示条件在「规则」修改。</p>
    <ElButton type="primary" @click="edit">编辑自由表单</ElButton>
  </div>
  <ElDialog
    v-model="open"
    title="编辑表格 · 自由表单"
    width="1120px"
    top="4vh"
    :style="{ maxWidth: 'calc(100vw - 32px)' }"
    append-to-body
    destroy-on-close
  >
    <PrintTableSample
      :options="{ ...draftOptions, agreeFormGrid: draft }"
      :sample-data="sampleData"
    />
    <div class="form-grid-tools">
      <ElButton size="small" @click="resize('row')">下方插入行</ElButton>
      <ElButton
        size="small"
        :disabled="draft.rows.length <= 1"
        @click="resize('row', true)"
      >
        删除当前行
      </ElButton>
      <ElButton size="small" @click="resize('column')">右侧插入列</ElButton>
      <ElButton
        size="small"
        :disabled="draft.columns.length <= 1"
        @click="resize('column', true)"
      >
        删除当前列
      </ElButton>
      <ElButton size="small" @click="merge">合并选区</ElButton>
      <ElButton size="small" @click="split">拆分当前格</ElButton>
    </div>
    <p class="form-grid-hint">
      点击格子编辑，按住 Shift
      点击终点选择矩形区域。合并后显示左上格内容，拆分可恢复其他格内容。
    </p>
    <div class="form-grid-layout">
      <div class="form-grid-scroll">
        <table class="form-grid-table" aria-label="表单单元格编辑区">
          <colgroup>
            <col
              v-for="(width, c) in draft.columns"
              :key="c"
              :style="{ width: `${width}px` }"
            />
          </colgroup>
          <tbody>
            <tr v-for="(row, r) in draft.rows" :key="r">
              <template v-for="(cell, c) in row.cells" :key="c">
                <td
                  v-if="spans[r]?.[c]?.[0]"
                  :rowspan="spans[r]![c]![0]"
                  :colspan="spans[r]![c]![1]"
                  :class="{
                    selected: inSelection(r, c),
                    repeated: !!row.source,
                  }"
                  :style="{
                    height: `${row.height || 22}pt`,
                    textAlign: cell.align,
                    fontWeight: cell.bold ? '700' : '400',
                  }"
                  :aria-label="`第 ${r + 1} 行第 ${c + 1} 列`"
                  @click="choose($event, r, c)"
                >
                  <small v-if="row.source && c === 0">↻ {{ row.source }}</small>
                  {{
                    cell.mode === 'text'
                      ? cell.value || '空白'
                      : `${cell.mode === 'field' ? '字段' : '公式'}：${cell.value || '未设置'}`
                  }}
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <ElForm class="form-grid-settings" label-position="top" size="small">
        <ElTabs v-model="settingScope" aria-label="自由表单设置范围">
          <ElTabPane label="单元格" name="cell">
            <strong>当前单元格 · 第 {{ start[0]! + 1 }} 行，第
              {{ start[1]! + 1 }} 列</strong>
            <p class="form-grid-hint">
              下面的内容、格式和对齐只作用于选中单元格。
            </p>
            <ElFormItem label="单元格内容">
              <ElSelect v-model="selectedCell.mode" class="w-full">
                <ElOption label="固定文字" value="text" /><ElOption
                  label="绑定字段"
                  value="field"
                /><ElOption label="计算公式" value="formula" />
              </ElSelect>
              <ElInput
                v-model="selectedCell.value"
                class="mt-2"
                type="textarea"
                :rows="2"
                aria-label="单元格内容值"
                :placeholder="
                  selectedCell.mode === 'formula'
                    ? '例如 SUM(houses, &quot;area&quot;) 或 row.area * row.price'
                    : selectedCell.mode === 'field'
                      ? '例如 agreementNo 或 row.address'
                      : '填写标签、章节标题等'
                "
              />
            </ElFormItem>
            <ElFormItem v-if="selectedCell.mode === 'field'" label="选择字段">
              <ElSelect v-model="pickerScope" class="w-full">
                <ElOption label="协议主字段" value="root" /><ElOption
                  label="当前动态行字段"
                  value="row"
                  :disabled="!selectedRow.source"
                />
              </ElSelect>
              <ElButton
                class="mt-2"
                :disabled="pickerScope === 'row' && !selectedRow.source"
                @click="openPicker()"
              >
                选择字段
              </ElButton>
            </ElFormItem>
            <p v-if="selectedCell.mode === 'formula'" class="form-grid-hint">
              主字段直接写名称；明细用 row.字段，序号用 index + 1。合计可用
              SUM(数组, "字段")。
            </p>
            <ElFormItem label="显示格式">
              <ElSelect
                v-model="selectedCell.format"
                clearable
                class="w-full"
                placeholder="原值"
              >
                <ElOption
                  v-for="format in formats"
                  :key="format.value"
                  :label="format.label"
                  :value="format.value"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="对齐">
              <ElSelect v-model="selectedCell.align" class="w-full">
                <ElOption label="左对齐" value="left" /><ElOption
                  label="居中"
                  value="center"
                /><ElOption label="右对齐" value="right" />
</ElSelect><ElCheckbox v-model="selectedCell.bold">加粗</ElCheckbox>
            </ElFormItem>
            <p class="form-grid-sample">样例值：{{ sampleCell }}</p>
          </ElTabPane>
          <ElTabPane label="当前行" name="row">
            <strong>当前行 · 第 {{ start[0]! + 1 }} 行</strong>
            <p class="form-grid-hint">
              数据源作用于整行。选择数组后，本行的所有单元格一起按记录重复。
            </p>
            <ElFormItem label="行类型">
              <ElSelect
                :model-value="selectedRow.source ? 'repeat' : 'fixed'"
                @change="
                  (value) =>
                    value === 'fixed' ? setSource('') : openPicker(true)
                "
              >
                <ElOption label="固定行" value="fixed" /><ElOption
                  label="重复明细行"
                  value="repeat"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="本行数据源（空白为固定行）">
              <ElInput
                :model-value="selectedRow.source"
                clearable
                placeholder="例如 houses"
                aria-label="本行数据源"
                @change="setSource"
              />
              <ElButton class="mt-2" @click="openPicker(true)">
                选择数组
              </ElButton>
            </ElFormItem>
            <ElFormItem v-if="selectedRow.source" label="数组没有记录时">
              <ElSelect v-model="selectedRow.empty" class="w-full">
                <ElOption label="保留一行空白" value="blank" /><ElOption
                  label="不显示本行"
                  value="omit"
                />
              </ElSelect>
            </ElFormItem>
            <p v-if="selectedRow.source" class="form-grid-hint">
              本行按记录数重复，后续行自动顺延。动态行支持横向合并，不能跨其他行纵向合并。
            </p>
            <ElFormItem label="本行最小高度（pt）">
              <ElInputNumber
                v-model="selectedRow.height"
                :min="18"
                :max="600"
              />
            </ElFormItem>
          </ElTabPane>
          <ElTabPane label="当前列" name="column">
            <strong>当前列 · 第 {{ start[1]! + 1 }} 列</strong>
            <p class="form-grid-hint">
              列宽影响整列。需要跨列展示的内容可使用合并单元格。
            </p>
            <ElFormItem label="当前列宽比例">
              <ElInputNumber
                v-model="draft.columns[start[1]!]"
                :min="20"
                :max="1000"
              />
            </ElFormItem>
          </ElTabPane>
        </ElTabs>
      </ElForm>
    </div>
    <template #footer>
      <span class="form-grid-hint">应用后一次性更新画布，可一步撤销；完成后请保存模板。</span>
      <ElButton @click="open = false">取消</ElButton><ElButton type="primary" @click="save">应用到画布</ElButton>
    </template>
  </ElDialog>
  <PrintFieldPicker
    v-model="pickerOpen"
    :mode="pickerMode"
    :table-field="selectedRow.source"
    @pick="pick"
  />
</template>

<style scoped>
.form-grid-entry,
.form-grid-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.form-grid-entry p {
  margin-bottom: 10px;
}

.form-grid-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.form-grid-hint {
  margin: 10px 0;
}

.form-grid-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 20px;
}

.form-grid-scroll {
  max-height: 60vh;
  overflow: auto;
}

.form-grid-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

.form-grid-table td {
  padding: 6px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  cursor: pointer;
  border: 1px solid #94a3b8;
}

.form-grid-table td.repeated {
  background: var(--el-color-primary-light-9);
}

.form-grid-table td.selected {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
  background: var(--el-color-primary-light-8);
}

.form-grid-table small {
  display: block;
  font-size: 10px;
  color: var(--el-color-primary);
}

.form-grid-settings {
  max-height: 60vh;
  padding-right: 8px;
  overflow: auto;
}

.form-grid-settings strong {
  display: block;
  margin-bottom: 12px;
}

.form-grid-sample {
  padding: 8px;
  margin-bottom: 12px;
  overflow-wrap: anywhere;
  background: var(--el-fill-color-light);
}
</style>
