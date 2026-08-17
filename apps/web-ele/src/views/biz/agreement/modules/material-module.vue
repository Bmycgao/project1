<script lang="ts" setup>
/**
 * 材料清单：一个模块里两张表（签约材料 / 认定材料）
 * 列配置来自 moduleInner.material 的两个子块
 */
import type { AgreementDetail, MaterialRow } from '../types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';

import { computed, inject, ref, type Ref, watch } from 'vue';

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
  normalizeMaterialModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

const injectedInner = inject<Ref<ModuleInnerConfig | null>>(
  'agreeModuleInnerMaterial',
  ref(null),
);

const innerConfig = computed(() =>
  normalizeMaterialModuleInner(injectedInner.value),
);

const sections = computed(() => resolveEnabledSections(innerConfig.value));

const signRows = ref<MaterialRow[]>([]);
const certifyRows = ref<MaterialRow[]>([]);
const dirty = ref(false);

watch(
  () => props.detail,
  (val) => {
    signRows.value = val ? cloneJson(val.signMaterials) : [];
    certifyRows.value = val ? cloneJson(val.certifyMaterials) : [];
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

/**
 * 子块对应哪一份数据
 * @param sectionKey 子块
 */
function rowsOf(sectionKey: string) {
  return sectionKey === 'certifyMaterials' ? certifyRows.value : signRows.value;
}

function addRow(section: ModuleInnerSection) {
  if (section.tableOptions?.allowAdd === false) return;
  const row: MaterialRow = {
    id: `m-${Date.now()}`,
    category: '',
    required: '否',
    fileName: '',
    remark: '',
  };
  if (section.key === 'certifyMaterials') certifyRows.value.push(row);
  else signRows.value.push(row);
  markDirty();
}

function removeRow(section: ModuleInnerSection, index: number) {
  if (section.tableOptions?.allowRemove === false) return;
  const minRows = section.tableOptions?.minRows ?? 1;
  const list = rowsOf(section.key);
  if (list.length <= minRows) {
    ElMessage.warning(`${section.label}至少保留 ${minRows} 条`);
    return;
  }
  list.splice(index, 1);
  markDirty();
}

function visibleCols(section: ModuleInnerSection) {
  return resolveEnabledFields(section);
}

function cellValue(row: MaterialRow, key: string) {
  return (row as Record<string, unknown>)[key];
}

function setCell(row: MaterialRow, key: string, val: string) {
  (row as Record<string, unknown>)[key] = val;
  markDirty();
}

function isSelectCol(field: ModuleInnerFieldItem) {
  const cell = field.cellType || field.controlType;
  return cell === 'select' || cell === 'yesno';
}

async function validate() {
  for (const sec of sections.value) {
    const list = rowsOf(sec.key);
    if (!list.length) {
      ElMessage.warning(`${sec.label}不能为空`);
      return false;
    }
    const requiredCols = visibleCols(sec).filter((f) => f.required);
    for (const col of requiredCols) {
      if (list.some((r) => !String(cellValue(r, col.key) ?? '').trim())) {
        ElMessage.warning(`请填写「${sec.label} / ${col.label}」`);
        return false;
      }
    }
  }
  return true;
}

function getValues() {
  return {
    signMaterials: cloneJson(signRows.value),
    certifyMaterials: cloneJson(certifyRows.value),
  };
}

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
</script>

<template>
  <div @input="markDirty">
    <SectionCard
      v-for="sec in sections"
      :key="sec.key"
      :title="sec.label"
      :subtitle="sec.subtitle"
    >
      <template #extra>
        <ElButton
          v-if="sec.tableOptions?.allowAdd !== false"
          size="small"
          type="primary"
          link
          @click="addRow(sec)"
        >
          新增
        </ElButton>
      </template>
      <ElTable :data="rowsOf(sec.key)" border size="small" row-key="id">
        <ElTableColumn
          v-for="col in visibleCols(sec)"
          :key="col.key"
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
              :model-value="String(cellValue(row, col.key) ?? '')"
              :placeholder="col.placeholder"
              @update:model-value="(v: string) => setCell(row, col.key, v)"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn
          v-if="sec.tableOptions?.allowRemove !== false"
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
              @click="removeRow(sec, $index)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </SectionCard>
    <div
      v-if="!sections.length"
      class="py-6 text-center text-xs text-gray-400"
    >
      当前场景未挂载材料表，请在页面配置中启用
    </div>
  </div>
</template>
