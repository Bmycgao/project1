<script setup lang="ts">
import { computed } from 'vue';

import { templateFieldSketches } from '../detail-designer-model';

const props = defineProps<{ rules?: unknown }>();
const fields = computed(() => templateFieldSketches(props.rules));
</script>

<template>
  <div class="template-overview">
    <div v-if="!fields.length" class="empty-fields">
      暂无可展示字段，请检查模板
    </div>
    <div v-else class="sketch-grid">
      <div
        v-for="field in fields"
        :key="field.key"
        class="sketch-field"
        :style="{ '--field-span': field.columns ? 24 : field.span }"
      >
        <div class="field-label">
          <span v-if="field.required" class="required">*</span>{{ field.title
          }}<span class="field-type">{{ field.type }}</span>
        </div>
        <div v-if="field.columns" class="sketch-table-wrap">
          <table class="sketch-table">
            <thead>
              <tr>
                <th v-for="(column, index) in field.columns" :key="index">
                  {{ column }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td v-for="(_, index) in field.columns" :key="index">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="sketch-input">{{ field.placeholder }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-overview {
  min-width: 0;
  container-type: inline-size;
}

.sketch-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 14px 12px;
}

.sketch-field {
  grid-column: span var(--field-span, 12);
  min-width: 0;
}

.field-label {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.field-type {
  margin-left: auto;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
}

.required {
  color: var(--el-color-danger);
}

.sketch-input {
  min-height: 30px;
  padding: 6px 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.sketch-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.sketch-table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}

.sketch-table th,
.sketch-table td {
  min-width: 90px;
  padding: 9px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.sketch-table th {
  font-weight: 400;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
}

.sketch-table td {
  color: var(--el-text-color-placeholder);
  border-bottom: 0;
}

.empty-fields {
  padding: 20px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

@container (max-width: 300px) {
  .sketch-field {
    grid-column: span 24;
  }
}
</style>
