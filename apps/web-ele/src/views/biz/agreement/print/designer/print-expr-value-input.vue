<script setup lang="ts">
import type {
  PrintExprHelpField,
  PrintExprInputHost,
} from '../runtime/print-expr-catalog';
import type { PrintLiteralType } from '../runtime/print-expr-input';

import { computed, ref, watch } from 'vue';

import {
  ElButton,
  ElInput,
  ElOption,
  ElOptionGroup,
  ElSelect,
} from 'element-plus';

import {
  applyPrintExprInsert,
  groupPrintExprHelpFields,
  PRINT_EXPR_OPERATOR_CHIPS,
  printExprInputEl,
} from '../runtime/print-expr-catalog';
import { serializePrintLiteral } from '../runtime/print-expr-input';

const props = defineProps<{
  defaultFixed?: boolean;
  expressionOnly?: boolean;
  fields: PrintExprHelpField[];
  label: string;
  modelValue: string;
}>();
const emit = defineEmits<{
  requestFunction: [(token: string) => void];
  'update:modelValue': [string];
}>();
let initialMode;
if (props.expressionOnly) {
  initialMode = 'expression';
} else {
  initialMode = props.defaultFixed ? 'fixed' : 'field';
}
const mode = ref(initialMode);
const field = ref('');
const literalType = ref<PrintLiteralType>(
  props.defaultFixed ? 'number' : 'text',
);
const literals = ref({ text: '', number: '', boolean: 'true' });
const expression = ref('');
const input = ref<PrintExprInputHost>(null);
const groups = computed(() =>
  groupPrintExprHelpFields(
    props.fields.filter((item) => item.group !== '整表'),
  ),
);
const code = computed(() => {
  let currentExpression;
  if (mode.value === 'field') {
    currentExpression = field.value;
  } else {
    currentExpression =
      mode.value === 'fixed'
        ? serializePrintLiteral(
            literalType.value,
            literals.value[literalType.value],
          )
        : expression.value;
  }
  return currentExpression;
});
watch(
  () => props.modelValue,
  (value) => {
    if (value === code.value) return;
    if (!value) {
      mode.value = props.expressionOnly ? 'expression' : 'field';
      field.value = '';
      expression.value = '';
      return;
    }
    if (props.expressionOnly) {
      expression.value = value;
      return;
    }
    if (
      props.fields.some((item) => item.value === value && item.group !== '整表')
    ) {
      mode.value = 'field';
      field.value = value;
      return;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (['boolean', 'number', 'string'].includes(typeof parsed)) {
        mode.value = 'fixed';
        let parsedLiteralType: PrintLiteralType;
        if (typeof parsed === 'string') {
          parsedLiteralType = 'text';
        } else {
          parsedLiteralType = typeof parsed === 'number' ? 'number' : 'boolean';
        }
        literalType.value = parsedLiteralType;
        literals.value[literalType.value] = String(parsed);
        return;
      }
    } catch {
      /* 手写表达式按原样保留。 */
    }
    mode.value = 'expression';
    expression.value = value;
  },
  { immediate: true },
);
watch(code, (value) => {
  if (value !== props.modelValue) emit('update:modelValue', value);
});
function insert(token: string) {
  expression.value = applyPrintExprInsert(
    expression.value,
    token,
    printExprInputEl(input.value),
  );
}
</script>

<template>
  <div class="expr-value-input">
    <div class="expr-value-input__row">
      <ElSelect
        v-if="!expressionOnly"
        v-model="mode"
        :aria-label="`${label}输入方式`"
        class="expr-value-input__mode"
      >
        <ElOption label="字段值" value="field" /><ElOption
          label="固定值"
          value="fixed"
        /><ElOption label="计算表达式" value="expression" />
      </ElSelect>
      <ElSelect
        v-if="mode === 'field'"
        v-model="field"
        filterable
        :aria-label="label"
        placeholder="选择字段"
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
      <template v-else-if="mode === 'fixed'">
        <ElSelect
          v-model="literalType"
          :aria-label="`${label}固定值类型`"
          class="expr-value-input__type"
        >
          <ElOption label="文字" value="text" /><ElOption
            label="数字"
            value="number"
          /><ElOption label="真 / 假" value="boolean" />
        </ElSelect>
        <ElSelect
          v-if="literalType === 'boolean'"
          v-model="literals.boolean"
          :aria-label="label"
        >
          <ElOption label="真（true）" value="true" /><ElOption
            label="假（false）"
            value="false"
          />
        </ElSelect>
        <ElInput
          v-else
          v-model="literals[literalType]"
          :aria-label="label"
          :inputmode="literalType === 'number' ? 'decimal' : 'text'"
          :placeholder="
            literalType === 'text'
              ? '原样显示文字，自动加引号'
              : '填写数字，如 10 或 12.5'
          "
        />
      </template>
    </div>
    <template v-if="mode === 'expression'">
      <ElInput
        ref="input"
        v-model="expression"
        type="textarea"
        :rows="2"
        :aria-label="label"
        placeholder="可在下方选字段与函数，或手写 quantity * unitPrice"
      />
      <div class="expr-value-input__tools">
        <ElSelect
          model-value=""
          filterable
          :aria-label="`${label}插入字段`"
          placeholder="插入字段"
          @change="insert(String($event))"
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
          model-value=""
          :aria-label="`${label}插入运算符`"
          placeholder="运算符"
          @change="insert(String($event))"
        >
          <ElOption
            v-for="item in PRINT_EXPR_OPERATOR_CHIPS"
            :key="item.label"
            :label="item.label"
            :value="item.insert"
          />
        </ElSelect>
        <ElButton
          size="small"
          @mousedown.prevent
          @click="emit('requestFunction', insert)"
        >
          插入函数
        </ElButton>
      </div>
      <p class="expr-value-input__hint">
        字段与函数插入到此参数的光标位置；文字需要引号。
      </p>
    </template>
    <p
      v-if="
        mode === 'fixed' && literalType === 'number' && literals.number && !code
      "
      class="expr-value-input__error"
    >
      请输入有效数字；需要计算时请选择“计算表达式”。
    </p>
  </div>
</template>

<style scoped>
.expr-value-input {
  min-width: 0;
}

.expr-value-input__row,
.expr-value-input__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.expr-value-input__row > * {
  flex: 1;
  min-width: 100px;
}

.expr-value-input__row .expr-value-input__mode {
  flex: 0 1 135px;
}

.expr-value-input__row .expr-value-input__type {
  flex: 0 1 95px;
}

.expr-value-input :deep(.el-textarea) {
  margin-top: 6px;
}

.expr-value-input__tools {
  align-items: center;
  margin-top: 6px;
}

.expr-value-input__tools :deep(.el-select) {
  flex: 1 1 110px;
  min-width: 0;
}

.expr-value-input__hint {
  margin: 4px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.expr-value-input__error {
  margin: 4px 0;
  font-size: 12px;
  color: var(--el-color-danger);
}
</style>
