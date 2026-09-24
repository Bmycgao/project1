<script setup lang="ts">
import type { RuntimeField } from '../../../../shared/workflow-runtime';
import { computed } from 'vue';
import {
  ElButton,
  ElCheckbox,
  ElDatePicker,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
} from 'element-plus';
defineOptions({ name: 'WorkflowFieldControl' });
const props = defineProps<{
  field: RuntimeField;
  modelValue: unknown;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();
const locked = computed(
  () =>
    props.disabled ||
    props.field.readonly ||
    (props.field.type === 'table' &&
      props.field.children?.some((c) => c.hidden || c.readonly)),
);
const table = computed<Record<string, unknown>[]>(() =>
  Array.isArray(props.modelValue) ? props.modelValue : [],
);
const label = computed(
  () =>
    props.field.options?.find((o) => o.value === props.modelValue)?.label ||
    String(props.modelValue ?? '—'),
);
function updateCell(index: number, key: string, value: unknown) {
  const rows = table.value.map((row) => ({ ...row }));
  rows[index]![key] = value;
  emit('update:modelValue', rows);
}
</script>
<template>
  <div v-if="field.type === 'table'" style="width: 100%">
    <ElTable :data="table" border
      ><ElTableColumn
        v-for="child in field.children?.filter((c) => !c.hidden)"
        :key="child.key"
        :label="child.label"
        min-width="160"
        ><template #default="{ row, $index }"
          ><WorkflowFieldControl
            :field="child"
            :model-value="row[child.key]"
            :disabled="locked"
            @update:model-value="
              updateCell($index, child.key, $event)
            " /></template></ElTableColumn
      ><ElTableColumn v-if="!locked" label="操作" width="70"
        ><template #default="{ $index }"
          ><ElButton
            link
            type="danger"
            @click="
              emit(
                'update:modelValue',
                table.filter((_, i) => i !== $index),
              )
            "
            >移除</ElButton
          ></template
        ></ElTableColumn
      ></ElTable
    ><ElButton
      v-if="!locked"
      size="small"
      style="margin-top: 8px"
      :disabled="table.length >= 200"
      @click="emit('update:modelValue', [...table, {}])"
      >添加明细</ElButton
    >
  </div>
  <span
    v-else-if="locked"
    style="
      color: var(--el-text-color-regular);
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    "
    >{{ field.type === 'boolean' ? (modelValue ? '是' : '否') : label }}</span
  >
  <ElInputNumber
    v-else-if="field.type === 'number'"
    :model-value="typeof modelValue === 'number' ? modelValue : undefined"
    :min="field.min"
    :max="field.max"
    :controls="false"
    style="width: 100%"
    @update:model-value="emit('update:modelValue', $event ?? null)"
  />
  <ElSelect
    v-else-if="field.type === 'select'"
    :model-value="modelValue as string"
    clearable
    style="width: 100%"
    @update:model-value="emit('update:modelValue', $event)"
    ><ElOption
      v-for="option in field.options"
      :key="String(option.value)"
      :label="option.label"
      :value="option.value"
  /></ElSelect>
  <ElCheckbox
    v-else-if="field.type === 'boolean'"
    :model-value="!!modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    >是</ElCheckbox
  >
  <ElDatePicker
    v-else-if="field.type === 'date'"
    :model-value="modelValue as string"
    :type="field.dateMode || 'date'"
    :value-format="
      field.dateMode === 'datetime' ? 'YYYY-MM-DDTHH:mm:ss' : 'YYYY-MM-DD'
    "
    style="width: 100%"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <ElInput
    v-else
    :model-value="String(modelValue ?? '')"
    :type="field.type === 'textarea' ? 'textarea' : 'text'"
    :rows="3"
    :maxlength="field.maxLength || 5000"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
