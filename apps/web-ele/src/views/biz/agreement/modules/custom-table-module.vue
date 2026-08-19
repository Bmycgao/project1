<script lang="ts" setup>
/**
 * 配置台新建的自定义表格：列来自 moduleInner，行落在 detail.extraTables[moduleKey]
 */
import type { AgreementDetail } from '../types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';

import { computed, inject, ref, watch, type Ref } from 'vue';

import {
  ElButton,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import SectionCard from '../components/section-card.vue';
import { cloneJson } from '../clone';
import {
  normalizeCustomTableInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';

const props = defineProps<{
  detail: AgreementDetail | null;
  /** 自定义模块 key */
  moduleKey: string;
  /** 显示名 */
  label?: string;
}>();
const emit = defineEmits<{ dirty: [] }>();

const customInners = inject<Ref<Record<string, ModuleInnerConfig>>>(
  'agreeModuleInnerCustom',
  ref({}),
);

const innerConfig = computed(() =>
  normalizeCustomTableInner(
    customInners.value[props.moduleKey],
    props.label || '自定义表格',
  ),
);

const section = computed(() => {
  const secs = resolveEnabledSections(innerConfig.value);
  return secs[0] || null;
});

const rows = ref<Record<string, unknown>[]>([]);
const dirty = ref(false);

watch(
  () => [props.detail, props.moduleKey] as const,
  () => {
    rows.value = cloneJson(
      props.detail?.extraTables?.[props.moduleKey] || [],
    );
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

function sectionFields(sec: ModuleInnerSection) {
  return resolveEnabledFields(sec).filter((f) => f.enabled);
}

function isSelectCol(field: ModuleInnerFieldItem) {
  const cell = field.cellType || field.controlType;
  return cell === 'select' || cell === 'yesno';
}

function addRow() {
  if (section.value?.tableOptions?.allowAdd === false) return;
  const next: Record<string, unknown> = { id: `ct-${Date.now()}` };
  for (const col of section.value ? sectionFields(section.value) : []) {
    if (col.key !== '_selection') next[col.key] = '';
  }
  rows.value.push(next);
  markDirty();
}

function removeRow(index: number) {
  if (section.value?.tableOptions?.allowRemove === false) return;
  const minRows = section.value?.tableOptions?.minRows ?? 0;
  if (rows.value.length <= minRows) {
    ElMessage.warning(`至少保留 ${minRows} 行`);
    return;
  }
  rows.value.splice(index, 1);
  markDirty();
}

function cellValue(row: Record<string, unknown>, key: string) {
  return row[key];
}

function setCell(row: Record<string, unknown>, key: string, val: string) {
  row[key] = val;
  markDirty();
}

async function validate() {
  if (!section.value) return true;
  const required = sectionFields(section.value).filter((f) => f.required);
  for (const col of required) {
    if (rows.value.some((r) => !String(cellValue(r, col.key) ?? '').trim())) {
      ElMessage.warning(`请填写「${col.label}」`);
      return false;
    }
  }
  return true;
}

function getValues() {
  return {
    extraTables: { [props.moduleKey]: cloneJson(rows.value) },
  };
}

defineExpose({ validate, getValues, isDirty: () => dirty.value });
</script>

<template>
  <div @input="markDirty">
    <SectionCard
      v-if="section"
      :title="section.label"
      :subtitle="section.subtitle"
    >
      <template #extra>
        <ElButton
          v-if="section.tableOptions?.allowAdd !== false"
          size="small"
          type="primary"
          link
          @click="addRow"
        >
          新增
        </ElButton>
      </template>
      <ElTable :data="rows" border size="small" row-key="id">
        <template v-for="col in sectionFields(section)" :key="col.key">
          <ElTableColumn
            v-if="col.key === '_selection'"
            type="selection"
            width="48"
          />
          <ElTableColumn
            v-else
            :label="col.label"
            :min-width="col.minWidth || 100"
          >
            <template #default="{ row }">
              <ElSelect
                v-if="isSelectCol(col)"
                size="small"
                class="w-full"
                :model-value="String(cellValue(row, col.key) ?? '')"
                @update:model-value="(v: string) => setCell(row, col.key, v)"
              >
                <ElOption
                  v-for="opt in col.options || [
                    { label: '是', value: '是' },
                    { label: '否', value: '否' },
                  ]"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </ElSelect>
              <ElInput
                v-else
                size="small"
                :placeholder="col.placeholder"
                :model-value="String(cellValue(row, col.key) ?? '')"
                @update:model-value="(v: string) => setCell(row, col.key, v)"
              />
            </template>
          </ElTableColumn>
        </template>
        <ElTableColumn
          v-if="section.tableOptions?.allowRemove !== false"
          label="操作"
          width="72"
          fixed="right"
          align="center"
        >
          <template #default="{ $index }">
            <ElButton
              type="danger"
              link
              size="small"
              @click="removeRow($index)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </SectionCard>
    <div v-else class="py-8 text-center text-xs text-gray-400">
      当前组件尚未配置列
    </div>
  </div>
</template>
