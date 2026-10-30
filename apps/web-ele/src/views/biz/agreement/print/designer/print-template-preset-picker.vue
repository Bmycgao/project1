<script lang="ts" setup>
import type { PrintTemplatePreset } from '../template/template-presets';

import { PRINT_TEMPLATE_PRESETS } from '../template/template-presets';

defineProps<{ modelValue: PrintTemplatePreset }>();
const emit = defineEmits<{ 'update:modelValue': [PrintTemplatePreset] }>();
</script>

<template>
  <div class="print-template-presets" role="radiogroup" aria-label="起始版式">
    <label
      v-for="preset in PRINT_TEMPLATE_PRESETS"
      :key="preset.value"
      class="print-template-presets__option"
      :class="{ 'is-selected': modelValue === preset.value }"
    >
      <input
        type="radio"
        name="print-starting-preset"
        :value="preset.value"
        :checked="modelValue === preset.value"
        @change="emit('update:modelValue', preset.value)"
      />
      <span><strong>{{ preset.label }}</strong><small>{{ preset.description }}</small></span>
    </label>
  </div>
</template>

<style scoped>
.print-template-presets {
  display: grid;
  gap: 10px;
}

.print-template-presets__option {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px;
  cursor: pointer;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.print-template-presets__option.is-selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.print-template-presets__option input {
  margin-top: 4px;
  accent-color: var(--el-color-primary);
}

.print-template-presets__option span {
  display: grid;
  gap: 5px;
}

.print-template-presets__option strong {
  font-size: 14px;
}

.print-template-presets__option small {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
