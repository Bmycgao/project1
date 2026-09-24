<script lang="ts" setup>
import type { PrintFilterColumn } from '../runtime/print-row-filter';
/**
 * Excel 风格列头筛选：勾选唯一值 + 升序/降序；比较/多列走「更多条件」
 */
import type { AgreePrintData } from '../types';

import { computed, ref, watch } from 'vue';

import { ElButton, ElCheckbox, ElInput, ElMessage } from 'element-plus';

import {
  condForField,
  listColumnUniqueValues,
  previewFilterRowCount,
  upsertFieldFilter,
} from '../runtime/print-row-filter';

const props = defineProps<{
  columns: PrintFilterColumn[];
  field: string;
  filterExpr: string;
  sampleData: AgreePrintData;
  /** 当前列的打印排序，空表示未按此列排 */
  sortDir?: '' | 'asc' | 'desc';
  tableField: string;
  title: string;
}>();

const emit = defineEmits<{
  apply: [string];
  close: [];
  more: [];
  sort: ['' | 'asc' | 'desc'];
}>();

const search = ref('');
const checked = ref<string[]>([]);
const touched = ref(false);

const column = computed(
  () =>
    props.columns.find((item) => item.field === props.field) || {
      field: props.field,
      title: props.title || props.field,
    },
);

const values = computed(() =>
  listColumnUniqueValues(
    props.tableField,
    props.field,
    props.filterExpr,
    props.sampleData,
    column.value.agreeColFormat,
  ),
);

const visibleValues = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return values.value;
  return values.value.filter((item) => item.label.toLowerCase().includes(q));
});

const existing = computed(() => condForField(props.filterExpr, props.field));
const isValueList = computed(
  () => !existing.value || existing.value.op === 'in',
);
const allKeys = computed(() => values.value.map((item) => item.key));

/** 按已保存的 IN 条件勾选；没有该列筛选则全选 */
function hydrate() {
  search.value = '';
  touched.value = false;
  const cond = condForField(props.filterExpr, props.field);
  if (!cond || cond.op !== 'in') {
    checked.value = allKeys.value;
    return;
  }
  const selected = new Set(
    cond.value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  );
  if (cond.value.trim() === '' && selected.size === 0) {
    checked.value = [];
    return;
  }
  checked.value = allKeys.value.filter((key) => selected.has(key));
}

watch(
  () => [props.field, props.filterExpr, props.tableField] as const,
  () => hydrate(),
  { immediate: true },
);
watch(
  () => values.value.map((item) => item.key).join('\0'),
  () => {
    if (!touched.value) hydrate();
  },
);

const allVisibleChecked = computed(
  () =>
    visibleValues.value.length > 0 &&
    visibleValues.value.every((item) => checked.value.includes(item.key)),
);

const preview = computed(() =>
  previewFilterRowCount(props.tableField, draftExpr(), props.sampleData),
);

/** 全选等于去掉本列筛选；部分勾选写成 IN；全不选则本列匹配 0 行 */
function draftExpr() {
  if (!isValueList.value && !touched.value) return props.filterExpr;
  if (checked.value.length === allKeys.value.length) {
    return upsertFieldFilter(props.filterExpr, props.field, null).expr;
  }
  return upsertFieldFilter(props.filterExpr, props.field, {
    field: props.field,
    op: 'in',
    value: checked.value.join(', '),
  }).expr;
}

function toggleAllVisible() {
  touched.value = true;
  const visible = new Set(visibleValues.value.map((item) => item.key));
  if (allVisibleChecked.value) {
    checked.value = checked.value.filter((key) => !visible.has(key));
    return;
  }
  checked.value = [...new Set([...checked.value, ...visible])];
}

function invertVisible() {
  touched.value = true;
  const visible = new Set(visibleValues.value.map((item) => item.key));
  const keep = checked.value.filter((key) => !visible.has(key));
  const add = visibleValues.value
    .filter((item) => !checked.value.includes(item.key))
    .map((item) => item.key);
  checked.value = [...keep, ...add];
}

function toggleOne(key: string, on: boolean) {
  touched.value = true;
  if (on) {
    if (!checked.value.includes(key)) checked.value = [...checked.value, key];
    return;
  }
  checked.value = checked.value.filter((item) => item !== key);
}

function apply() {
  const next = upsertFieldFilter(
    props.filterExpr,
    props.field,
    checked.value.length === allKeys.value.length
      ? null
      : {
          field: props.field,
          op: 'in',
          value: checked.value.join(', '),
        },
  );
  if (next.blocked) {
    ElMessage.info('当前是高级表达式，请用更多条件编辑');
    emit('more');
    return;
  }
  emit('apply', next.expr);
}

function clearThis() {
  const next = upsertFieldFilter(props.filterExpr, props.field, null);
  if (next.blocked) {
    emit('more');
    return;
  }
  emit('apply', next.expr);
}

function onSort(dir: 'asc' | 'desc') {
  emit('sort', props.sortDir === dir ? '' : dir);
}
</script>

<template>
  <div class="print-column-filter" role="dialog" :aria-label="`筛选 ${title}`">
    <strong>{{ title || field }}</strong>
    <div class="print-column-filter__sort">
      <ElButton
        size="small"
        :type="sortDir === 'asc' ? 'primary' : 'default'"
        @click="onSort('asc')"
      >
        升序
      </ElButton>
      <ElButton
        size="small"
        :type="sortDir === 'desc' ? 'primary' : 'default'"
        @click="onSort('desc')"
      >
        降序
      </ElButton>
    </div>
    <p v-if="!isValueList" class="print-column-filter__hint">
      当前是比较/高级条件。改勾选后将换成值列表；复杂规则请用更多条件。
    </p>
    <ElInput v-model="search" size="small" clearable placeholder="搜索值" />
    <div class="print-column-filter__bulk">
      <button type="button" @click="toggleAllVisible">
        {{ allVisibleChecked ? '取消全选' : '全选' }}
      </button>
      <button type="button" @click="invertVisible">反选</button>
      <span>{{ checked.length }} / {{ values.length }}</span>
    </div>
    <div class="print-column-filter__list" role="listbox">
      <label
        v-for="item in visibleValues"
        :key="item.key || '__empty'"
        class="print-column-filter__item"
      >
        <ElCheckbox
          :model-value="checked.includes(item.key)"
          @change="toggleOne(item.key, $event === true)"
        />
        <span class="print-column-filter__label">{{ item.label }}</span>
        <em>{{ item.count }}</em>
      </label>
      <p v-if="visibleValues.length === 0" class="print-column-filter__hint">
        没有匹配的值
      </p>
    </div>
    <p class="print-column-filter__hint">
      样例将打印 {{ preview.kept }} / {{ preview.total }} 行
    </p>
    <div class="print-column-filter__actions">
      <ElButton size="small" text @click="emit('more')">更多条件</ElButton>
      <ElButton size="small" text @click="clearThis">清除筛选</ElButton>
      <ElButton size="small" @click="emit('close')">取消</ElButton>
      <ElButton type="primary" size="small" @click="apply">确定</ElButton>
    </div>
  </div>
</template>

<style scoped>
.print-column-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 300px;
  padding: 10px;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 16%);
}

.print-column-filter strong {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.print-column-filter__sort {
  display: flex;
  gap: 6px;
}

.print-column-filter__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.print-column-filter__bulk {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.print-column-filter__bulk button {
  padding: 0;
  color: var(--el-color-primary);
  cursor: pointer;
  background: none;
  border: 0;
}

.print-column-filter__list {
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.print-column-filter__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 6px;
  align-items: center;
  padding: 4px 8px;
  font-size: 12px;
}

.print-column-filter__item:hover {
  background: var(--el-fill-color-light);
}

.print-column-filter__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.print-column-filter__item em {
  font-style: normal;
  color: var(--el-text-color-secondary);
}

.print-column-filter__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}
</style>
