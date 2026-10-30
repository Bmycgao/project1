<script lang="ts" setup>
import type {
  PrintExprHelpField,
  PrintExprHelpScene,
  PrintExprInputHost,
} from '../runtime/print-expr-catalog';

import { computed, ref, watch } from 'vue';

import { ElAlert, ElButton, ElDialog, ElInput } from 'element-plus';

import { evalPrintExpr, validatePrintExpr } from '../runtime/print-expr';
import {
  applyPrintExprInsert,
  PRINT_EXPR_SCENE_META,
  printExprInputEl,
} from '../runtime/print-expr-catalog';
import { resolvePrintTextTemplate } from '../runtime/print-long-text';
import PrintConditionEditor from './print-condition-editor.vue';
import PrintExprHelp from './print-expr-help.vue';

const props = defineProps<{
  context: Record<string, unknown>;
  expression: string;
  fields: PrintExprHelpField[];
  modelValue: boolean;
  scene: PrintExprHelpScene;
  title?: string;
}>();
const emit = defineEmits<{ apply: [string]; 'update:modelValue': [boolean] }>();
const draft = ref('');
const ready = ref(true);
const input = ref<PrintExprInputHost>(null);
const booleanScene = computed(() =>
  ['color', 'filter', 'visible'].includes(props.scene),
);
const check = computed(() => validatePrintExpr(draft.value, props.context));
const preview = computed(() =>
  props.scene === 'text' && check.value.ok
    ? resolvePrintTextTemplate(`{{${draft.value}}}`, props.context)
    : check.value.preview,
);
const tableResult = computed(
  () =>
    !booleanScene.value &&
    draft.value.trim() &&
    check.value.ok &&
    typeof evalPrintExpr(draft.value, props.context) === 'object' &&
    evalPrintExpr(draft.value, props.context) !== null,
);
const nonBoolean = computed(
  () =>
    booleanScene.value &&
    draft.value.trim() &&
    check.value.ok &&
    typeof evalPrintExpr(draft.value, props.context) !== 'boolean',
);
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      draft.value = props.expression;
      ready.value = true;
    }
  },
  { immediate: true },
);
const resultLabel = computed(() => {
  if (!ready.value) return '请填完整条件后再应用';
  if (!check.value.ok) return check.value.message;
  if (!draft.value.trim())
    return booleanScene.value ? '未设置条件，始终通过' : '请输入公式';
  if (props.scene === 'visible')
    return evalPrintExpr(draft.value, props.context)
      ? '当前样例：将显示'
      : '当前样例：将隐藏';
  if (props.scene === 'filter')
    return evalPrintExpr(draft.value, props.context)
      ? '当前样例行：将打印'
      : '当前样例行：不打印';
  return `当前样例结果：${preview.value || '（空）'}`;
});
function insert(token: string) {
  const el = printExprInputEl(input.value);
  // 使用表达式框保留的选区，不使用函数参数框里的光标。
  draft.value = applyPrintExprInsert(draft.value, token, el);
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title || (booleanScene ? '设置显示条件' : '插入表达式')"
    width="min(900px, 94vw)"
    top="6vh"
    body-class="print-condition-dialog-body"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="expression-purpose">
      {{ PRINT_EXPR_SCENE_META[scene].result }}。{{
        booleanScene
          ? '留空表示始终通过。'
          : '可直接使用字段，也可以组合函数与运算符。'
      }}
    </p>
    <PrintConditionEditor
      v-if="booleanScene"
      v-model="draft"
      :scene="scene"
      :fields="fields"
      :context="context"
      @ready="ready = $event"
    />
    <ElInput
      v-else
      ref="input"
      v-model="draft"
      type="textarea"
      :rows="3"
      aria-label="表达式"
      placeholder="填写表达式，或从下方选择字段、函数与示例"
    />
    <ElAlert
      v-if="draft.trim() || booleanScene"
      class="expression-result"
      :closable="false"
      :type="check.ok ? 'success' : 'error'"
      :title="resultLabel"
    />
    <ElAlert
      v-if="tableResult"
      class="expression-result"
      type="warning"
      :closable="false"
      title="正文需要文字或数字，不能直接插入整张表。请选择 COUNT、SUM 等统计函数。"
    />
    <ElAlert
      v-if="nonBoolean"
      class="expression-result"
      type="warning"
      :closable="false"
      title="条件通常应返回 true / false。当前结果会按真假转换，建议使用比较符或 EMPTY 等判断函数。"
    />
    <PrintExprHelp
      v-if="!booleanScene"
      expanded
      :scene="scene"
      :fields="fields"
      :context="context"
      @insert="insert"
    />
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton><ElButton
        type="primary"
        :disabled="
          !ready || !check.ok || tableResult || (!booleanScene && !draft.trim())
        "
        @click="
          emit('apply', draft.trim());
          emit('update:modelValue', false);
        "
      >
        {{ booleanScene ? '应用条件' : '插入正文' }}
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.expression-purpose {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
}

.expression-result {
  margin-top: 10px;
}
</style>
