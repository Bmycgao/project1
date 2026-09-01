<script lang="ts" setup>
import type { PrintFilterCond, PrintFilterOp } from './print-row-filter';
/**
 * 筛选打印行弹窗：可视化拼 agreeRowFilter，主业是决定表格印哪些行
 */
import type { AgreePrintData } from './types';

import { computed, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElDialog,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
} from 'element-plus';

import { AGREE_PRINT_TABLE_FIELDS } from './fields';
import {
  compileFilterConds,
  describeFilterExpr,
  emptyCond,
  filterOpNeedsValue,
  listFilterColumns,
  parseFilterExpr,
  previewFilterRowCount,
  PRINT_FILTER_OP_OPTIONS,
  PRINT_TABLE_FILTER_PRESETS,
} from './print-row-filter';

const props = defineProps<{
  /** 画布列（没有则用预设列） */
  columns: { field: string; title: string }[];
  /** 当前 agreeRowFilter */
  filterExpr: string;
  modelValue: boolean;
  sampleData: AgreePrintData;
  /** 表格数据源 field，如 houses */
  tableField: string;
}>();

const emit = defineEmits<{
  /** 应用筛选表达式；空字符串表示清除 */
  apply: [string];
  'update:modelValue': [boolean];
}>();

const join = ref<'and' | 'or'>('and');
const conds = ref<PrintFilterCond[]>([emptyCond()]);
const advanced = ref(false);
const advancedExpr = ref('');

const tableLabel = computed(
  () =>
    AGREE_PRINT_TABLE_FIELDS.find((t) => t.field === props.tableField)?.text ||
    props.tableField ||
    '未绑定数据源',
);

const columnOptions = computed(() =>
  listFilterColumns(props.tableField, props.columns),
);

const presets = computed(
  () => PRINT_TABLE_FILTER_PRESETS[props.tableField] || [],
);

/** 当前可视化/高级编辑将写出的表达式 */
const draftExpr = computed(() => {
  if (advanced.value) return advancedExpr.value.trim();
  return compileFilterConds(conds.value, join.value);
});

const rowCount = computed(() =>
  previewFilterRowCount(props.tableField, draftExpr.value, props.sampleData),
);

const summary = computed(() =>
  describeFilterExpr(draftExpr.value, columnOptions.value),
);

/**
 * 打开弹窗时回填已有筛选
 * @param expr 已保存的 agreeRowFilter
 */
function hydrateFromExpr(expr: string) {
  const parsed = parseFilterExpr(expr);
  join.value = parsed.join;
  if (parsed.advanced && expr.trim()) {
    advanced.value = true;
    advancedExpr.value = expr.trim();
    conds.value = [emptyCond()];
    return;
  }
  advanced.value = false;
  advancedExpr.value = '';
  conds.value =
    parsed.conds.length > 0
      ? parsed.conds.map((c) => ({ ...c }))
      : [emptyCond()];
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) hydrateFromExpr(props.filterExpr);
  },
);

function addCond() {
  conds.value.push(emptyCond());
}

function removeCond(index: number) {
  conds.value.splice(index, 1);
  if (conds.value.length === 0) conds.value.push(emptyCond());
}

/**
 * 套用快捷筛选
 * @param preset 预设
 */
function applyPreset(preset: { conds: PrintFilterCond[]; join: 'and' | 'or' }) {
  advanced.value = false;
  join.value = preset.join;
  conds.value = preset.conds.map((c) => ({ ...c }));
}

function close() {
  emit('update:modelValue', false);
}

/** 写入模板：只改 agreeRowFilter，不改列结构 */
function apply() {
  if (!props.tableField) {
    ElMessage.warning('请先绑定表格数据源（房屋 / 补偿 / 奖励）');
    return;
  }
  if (advanced.value) {
    emit('apply', advancedExpr.value.trim());
    close();
    return;
  }
  const incomplete = conds.value.filter(
    (c) => c.field && filterOpNeedsValue(c.op) && !String(c.value || '').trim(),
  );
  if (incomplete.length > 0) {
    ElMessage.warning('请把已选列的筛选值填完整，或删掉空条件');
    return;
  }
  emit('apply', draftExpr.value);
  close();
}

function clearFilter() {
  emit('apply', '');
  close();
}

function needsValue(op: PrintFilterOp) {
  return filterOpNeedsValue(op);
}

/**
 * 高级开关：打开时把可视化条件编译进去；关闭时尝试拆回条件
 * @param val 开关值
 */
function onAdvancedToggle(val: boolean | number | string) {
  const on = Boolean(val);
  if (on) {
    advanced.value = true;
    advancedExpr.value =
      compileFilterConds(conds.value, join.value) || props.filterExpr;
    return;
  }
  const parsed = parseFilterExpr(advancedExpr.value);
  if (parsed.advanced) {
    ElMessage.info('当前表达式较复杂，已保留高级编辑');
    advanced.value = true;
    return;
  }
  advanced.value = false;
  join.value = parsed.join;
  conds.value = parsed.conds;
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    title="筛选打印行"
    width="640px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert
      class="mb-3"
      type="info"
      :closable="false"
      :title="`当前表：${tableLabel}${tableField ? ` (${tableField})` : ''}。这里决定打印哪些行，不是做合计。`"
    />

    <div v-if="presets.length" class="mb-3 flex flex-wrap gap-1">
      <ElButton
        v-for="p in presets"
        :key="p.label"
        size="small"
        @click="applyPreset(p)"
      >
        {{ p.label }}
      </ElButton>
    </div>

    <div class="mb-3 flex items-center justify-between gap-2">
      <span class="text-xs text-gray-500">条件关系</span>
      <div class="flex items-center gap-2">
        <ElRadioGroup v-model="join" size="small" :disabled="advanced">
          <ElRadioButton value="and">同时满足（且）</ElRadioButton>
          <ElRadioButton value="or">满足其一（或）</ElRadioButton>
        </ElRadioGroup>
        <span class="text-xs text-gray-500">高级表达式</span>
        <ElSwitch v-model="advanced" @change="onAdvancedToggle" />
      </div>
    </div>

    <ElInput
      v-if="advanced"
      v-model="advancedExpr"
      type="textarea"
      :rows="3"
      placeholder="复杂条件可手写，如 houseType == &quot;住宅&quot; && evalValue > 0"
    />

    <div v-else class="print-filter-dialog__conds">
      <div v-for="(cond, i) in conds" :key="i" class="print-filter-dialog__row">
        <ElSelect
          v-model="cond.field"
          filterable
          placeholder="列"
          class="print-filter-dialog__col"
        >
          <ElOption
            v-for="c in columnOptions"
            :key="c.field"
            :label="`${c.title} (${c.field})`"
            :value="c.field"
          />
        </ElSelect>
        <ElSelect v-model="cond.op" class="print-filter-dialog__op">
          <ElOption
            v-for="op in PRINT_FILTER_OP_OPTIONS"
            :key="op.value"
            :label="op.label"
            :value="op.value"
          />
        </ElSelect>
        <ElInput
          v-if="needsValue(cond.op)"
          v-model="cond.value"
          :placeholder="
            cond.op === 'in' || cond.op === 'notIn' ? '多个值用逗号分隔' : '值'
          "
        />
        <span v-else class="print-filter-dialog__na">无需填值</span>
        <ElButton size="small" text type="danger" @click="removeCond(i)">
          删
        </ElButton>
      </div>
      <ElButton size="small" @click="addCond">加条件</ElButton>
    </div>

    <ElAlert
      class="mt-3"
      :type="rowCount.kept === 0 && rowCount.total > 0 ? 'warning' : 'success'"
      :closable="false"
      :title="
        tableField
          ? `样例将打印 ${rowCount.kept} / ${rowCount.total} 行。${summary}`
          : '请先绑定表格数据源后再筛选'
      "
    />

    <ElFormItem v-if="draftExpr" class="mt-2" label="将写入">
      <code class="text-xs break-all">{{ draftExpr }}</code>
    </ElFormItem>

    <template #footer>
      <ElButton @click="clearFilter">清除筛选（打印全部行）</ElButton>
      <ElButton @click="close">取消</ElButton>
      <ElButton type="primary" @click="apply">应用到模板</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.print-filter-dialog__conds {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.print-filter-dialog__row {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1.4fr auto;
  gap: 6px;
  align-items: center;
}

.print-filter-dialog__na {
  font-size: 12px;
  color: #9ca3af;
}

.print-filter-dialog__col,
.print-filter-dialog__op {
  width: 100%;
}
</style>
