<script setup lang="ts">
import { ref, watch } from 'vue';

/** Shared FormCreate host. Business permissions are applied before rules arrive here. */
const props = defineProps<{
  modelValue?: Record<string, unknown>;
  option?: Record<string, any>;
  rule: Record<string, any>[];
}>();
const emit = defineEmits<{
  change: [];
  'update:modelValue': [value: Record<string, unknown>];
}>();
const api = ref<any>();
const rules = ref(JSON.parse(JSON.stringify(props.rule)));
const values = ref<Record<string, unknown>>({ ...props.modelValue });
watch(
  () => props.rule,
  (rule) => {
    rules.value = JSON.parse(JSON.stringify(rule));
  },
  { deep: true },
);
watch(
  () => props.modelValue,
  (value) => {
    if (JSON.stringify(value || {}) === JSON.stringify(values.value)) return;
    values.value = { ...value };
    api.value?.coverValue?.(values.value);
  },
  { deep: true },
);
function getValues(): Record<string, unknown> {
  return api.value?.formData?.() || values.value;
}
function change() {
  emit('update:modelValue', { ...getValues() });
  emit('change');
}
async function validate() {
  if (!api.value?.validate) return false;
  try {
    return (await api.value.validate()) !== false;
  } catch {
    return false;
  }
}
defineExpose({ validate, getValues });
</script>
<template>
  <form-create
    v-model="values"
    v-model:api="api"
    :rule="rules"
    :option="{ ...option, submitBtn: false, resetBtn: false }"
    @change="change"
  />
</template>
