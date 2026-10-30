<script setup lang="ts">
import type {
  PrintExprHelpField,
  PrintExprHelpScene,
  PrintExprInputHost,
} from '../runtime/print-expr-catalog';

import { ref } from 'vue';

import { ElDialog, ElInput } from 'element-plus';

import {
  applyPrintExprInsert,
  printExprInputEl,
} from '../runtime/print-expr-catalog';
import PrintExprConditionInput from './print-expr-condition-input.vue';
import PrintExprHelp from './print-expr-help.vue';

defineProps<{
  context: Record<string, unknown>;
  fields: PrintExprHelpField[];
  modelValue: string;
  scene: PrintExprHelpScene;
}>();
const emit = defineEmits<{ ready: [boolean]; 'update:modelValue': [string] }>();
const input = ref<PrintExprInputHost>(null);
const functionOpen = ref(false);
let insertFunction: ((token: string) => void) | undefined;
function requestFunction(insert: (token: string) => void) {
  insertFunction = insert;
  functionOpen.value = true;
}
function applyFunction(token: string) {
  insertFunction?.(token);
  functionOpen.value = false;
}
</script>

<template>
  <PrintExprConditionInput
    :model-value="modelValue"
    :fields="fields"
    label="条件"
    @update:model-value="emit('update:modelValue', $event)"
    @ready="emit('ready', $event)"
    @request-function="requestFunction"
  >
    <template #formula="{ value, update }">
      <div class="condition-formula">
        <ElInput
          ref="input"
          :model-value="value"
          type="textarea"
          :rows="3"
          aria-label="表达式"
          placeholder="填写公式，或从下方选择字段、运算符和函数"
          @update:model-value="update"
        />
        <PrintExprHelp
          expanded
          :scene="scene"
          :fields="fields"
          :context="context"
          @insert="
            update(applyPrintExprInsert(value, $event, printExprInputEl(input)))
          "
        />
      </div>
    </template>
  </PrintExprConditionInput>
  <ElDialog
    v-model="functionOpen"
    top="6vh"
    body-class="print-condition-dialog-body"
    title="选择比较值的函数"
    width="min(900px, 94vw)"
    append-to-body
    destroy-on-close
  >
    <PrintExprHelp
      expanded
      initial-pane="functions"
      :scene="scene"
      :fields="fields"
      :context="context"
      @insert="applyFunction"
    />
  </ElDialog>
</template>

<style scoped>
.condition-formula {
  display: grid;
  gap: 10px;
  min-width: 0;
  margin-top: 12px;
}
</style>

<style>
.print-condition-dialog-body {
  max-height: 70vh;
  overflow-y: auto;
}
</style>
