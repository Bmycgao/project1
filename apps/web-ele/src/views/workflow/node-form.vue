<script setup lang="ts">
import type {
  RuntimeField,
  RuntimeForm,
} from '../../../../shared/workflow-runtime';

import { computed, ref } from 'vue';

import { prepareWorkflowFormRules } from '../../../../shared/workflow-form-schema';
import FormRuntime from '../../components/form-runtime/index.vue';

const props = defineProps<{
  disabled?: boolean;
  fields: RuntimeField[];
  modelValue: Record<string, unknown>;
  schema: NonNullable<RuntimeForm['supplement']>;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();
const runtime = ref<InstanceType<typeof FormRuntime>>();
const rules = computed(() =>
  prepareWorkflowFormRules(props.schema.rules, props.fields, props.disabled),
);
const values = computed(() =>
  Object.fromEntries(
    props.fields
      .filter((field) => !field.hidden && !field.moduleKey)
      .map((field) => {
        const value = props.modelValue[field.key];
        // Empty saves may return null; collection controls require an array.
        return [
          field.key,
          (field.type === 'choiceList' || field.type === 'table') &&
          (value === null || value === undefined)
            ? []
            : value,
        ];
      }),
  ),
);
function update(value: Record<string, unknown>) {
  const next = { ...props.modelValue };
  for (const field of props.fields) {
    if (
      field.hidden ||
      field.readonly ||
      field.moduleKey ||
      props.disabled ||
      (field.type === 'table' &&
        field.children?.some((child) => child.hidden || child.readonly))
    )
      continue;
    if (Object.hasOwn(value, field.key)) next[field.key] = value[field.key];
  }
  emit('update:modelValue', next);
}
defineExpose({
  validate: () => runtime.value?.validate() ?? Promise.resolve(false),
  getValues: () => runtime.value?.getValues() || {},
});
</script>
<template>
  <FormRuntime
    ref="runtime"
    :rule="rules"
    :option="schema.option"
    :model-value="values"
    @update:model-value="update"
  />
</template>
