<script setup lang="ts">
import type { PrintExprHelpField } from '../runtime/print-expr-catalog';
import type { PrintConditionRow } from '../runtime/print-expr-input';

import { computed, ref, watch } from 'vue';

import {
  ElButton,
  ElOption,
  ElOptionGroup,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
} from 'element-plus';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { groupPrintExprHelpFields } from '../runtime/print-expr-catalog';
import {
  compilePrintCondition,
  parsePrintCondition,
  PRINT_CONDITION_OPERATORS,
  printConditionNeedsValue,
} from '../runtime/print-expr-input';
import PrintExprValueInput from './print-expr-value-input.vue';

const props = defineProps<{
  fields: PrintExprHelpField[];
  label: string;
  modelValue: string;
}>();
const emit = defineEmits<{
  ready: [boolean];
  requestFunction: [(token: string) => void];
  'update:modelValue': [string];
}>();
const mode = ref('basic');
const relation = ref<'and' | 'or'>('and');
let ruleId = 0;
const rule = () => ({ id: ++ruleId, field: '', operator: '==', value: '' });
const rows = ref<Array<PrintConditionRow & { id: number }>>([rule()]);
const advanced = ref('');
const advancedSeed = ref('');
const groups = computed(() =>
  groupPrintExprHelpFields(
    props.fields.filter((item) => item.group !== '整表'),
  ),
);
const basic = computed(() => compilePrintCondition(rows.value, relation.value));
const code = computed(() =>
  mode.value === 'basic' ? basic.value : advanced.value,
);
watch(
  () => props.modelValue,
  (value) => {
    if (value !== code.value) {
      const parsed = parsePrintCondition(value);
      if (
        parsed &&
        parsed.rows.every((row) =>
          props.fields.some(
            (item) => item.value === row.field && item.group !== '整表',
          ),
        )
      ) {
        mode.value = 'basic';
        relation.value = parsed.relation;
        rows.value =
          parsed.rows.length > 0
            ? parsed.rows.map((row) => ({ ...row, id: ++ruleId }))
            : [rule()];
        advanced.value = '';
        advancedSeed.value = '';
      } else {
        mode.value = 'advanced';
        advanced.value = value;
      }
    }
  },
  { immediate: true },
);
const ready = computed(
  () =>
    mode.value === 'advanced' ||
    !!basic.value ||
    (rows.value.length === 1 &&
      !requireDefined(rows.value[0]).field &&
      !requireDefined(rows.value[0]).value),
);
watch(ready, (value) => emit('ready', value), { immediate: true });
watch(code, (value) => {
  if (value !== props.modelValue) emit('update:modelValue', value);
});
function switchMode(value: boolean | number | string | undefined) {
  if (
    value === 'advanced' &&
    (!advanced.value || advanced.value === advancedSeed.value)
  ) {
    advanced.value = basic.value;
    advancedSeed.value = basic.value;
  }
}
</script>
<template>
  <div class="expr-condition-input">
    <ElRadioGroup
      v-model="mode"
      size="small"
      :aria-label="`${label}配置方式`"
      @change="switchMode"
    >
      <ElRadioButton value="basic">条件配置</ElRadioButton><ElRadioButton value="advanced">公式编辑</ElRadioButton>
    </ElRadioGroup>
    <template v-if="mode === 'basic'">
      <ElSelect
        v-if="rows.length > 1"
        v-model="relation"
        :aria-label="`${label}条件关系`"
        class="expr-condition-input__relation"
      >
        <ElOption label="同时满足（且）" value="and" /><ElOption
          label="满足任一（或）"
          value="or"
        />
      </ElSelect>
      <div
        v-for="(row, index) in rows"
        :key="row.id"
        class="expr-condition-input__rule"
      >
        <div class="expr-condition-input__row">
          <ElSelect
            v-model="row.field"
            filterable
            :aria-label="`${label}字段 ${index + 1}`"
            placeholder="选择判断字段"
          >
            <ElOptionGroup
              v-for="group in groups"
              :key="group.title"
              :label="group.title"
            >
              <ElOption
                v-for="item in group.items"
                :key="item.value"
                :label="`${item.label} (${item.value})`"
                :value="item.value"
              />
            </ElOptionGroup>
          </ElSelect>
          <ElSelect
            v-model="row.operator"
            :aria-label="`${label}比较方式 ${index + 1}`"
          >
            <ElOption
              v-for="item in PRINT_CONDITION_OPERATORS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
          <ElButton
            v-if="rows.length > 1"
            text
            type="danger"
            size="small"
            @click="rows.splice(index, 1)"
          >
            移除条件
          </ElButton>
        </div>
        <PrintExprValueInput
          v-if="printConditionNeedsValue(row.operator)"
          v-model="row.value"
          default-fixed
          :fields="fields"
          :label="`${label}比较值 ${index + 1}`"
          @request-function="emit('requestFunction', $event)"
        />
        <p v-else class="expr-condition-input__hint">此判断无需比较值。</p>
      </div>
      <ElButton size="small" @click="rows.push(rule())">添加判断条件</ElButton>
    </template>
    <slot
      v-else
      name="formula"
      :value="advanced"
      :update="(value: string) => (advanced = value)"
    >
      <PrintExprValueInput
        v-model="advanced"
        expression-only
        :fields="fields"
        :label="label"
        @request-function="emit('requestFunction', $event)"
      />
    </slot>
    <p class="expr-condition-input__hint">
      条件配置适合字段比较；公式编辑支持计算、函数及复杂逻辑。切换会保留两边草稿，应用当前方式的内容。
    </p>
  </div>
</template>
<style scoped>
.expr-condition-input {
  min-width: 0;
  padding: 10px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
}

.expr-condition-input__rule {
  display: grid;
  gap: 6px;
  margin: 10px 0;
}

.expr-condition-input__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.expr-condition-input__row :deep(.el-select) {
  flex: 1;
  min-width: 120px;
}

.expr-condition-input__relation {
  margin-top: 10px;
}

.expr-condition-input__hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
