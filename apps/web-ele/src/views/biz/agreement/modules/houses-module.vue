<script lang="ts" setup>
/**
 * 房屋信息表格模块（详情 Tab）
 * 列配置来自 moduleInner.houses
 */
import type { AgreementDetail, HouseRow } from '../types';
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
  normalizeHousesModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

const { fieldVisible, fieldEditable } = useAgreeFieldAccess();

const injectedInner = inject<Ref<ModuleInnerConfig | null>>(
  'agreeModuleInnerHouses',
  ref(null),
);

const innerConfig = computed(() =>
  normalizeHousesModuleInner(injectedInner.value),
);

const section = computed(() => {
  const secs = resolveEnabledSections(innerConfig.value);
  return secs.find((s) => s.key === 'houses') || secs[0] || null;
});

const rows = ref<HouseRow[]>([]);
const dirty = ref(false);

watch(
  () => props.detail,
  (val) => {
    rows.value = val ? cloneJson(val.houses) : [];
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

function columnVisible(field: ModuleInnerFieldItem) {
  if (!field.enabled) return false;
  if (field.accessField) return fieldVisible(field.accessField);
  return true;
}

function columnEditable(field: ModuleInnerFieldItem) {
  if (field.accessField) return fieldEditable(field.accessField);
  return true;
}

function sectionFields(sec: ModuleInnerSection) {
  return resolveEnabledFields(sec).filter((f) => columnVisible(f));
}

function isSelectCol(field: ModuleInnerFieldItem) {
  const cell = field.cellType || field.controlType;
  return cell === 'select' || cell === 'yesno';
}

function addRow() {
  if (section.value?.tableOptions?.allowAdd === false) return;
  rows.value.push({
    id: `hs-${Date.now()}`,
    address: '',
    certNo: '',
    propertyType: '',
    buildArea: '',
    expropriatedArea: '',
    houseType: '',
    structure: '',
    yearBuilt: '',
    floor: '',
    evalValue: '',
  });
  markDirty();
}

function removeRow(index: number) {
  if (section.value?.tableOptions?.allowRemove === false) return;
  const minRows = section.value?.tableOptions?.minRows ?? 1;
  if (rows.value.length <= minRows) {
    ElMessage.warning(`至少保留 ${minRows} 套房屋`);
    return;
  }
  rows.value.splice(index, 1);
  markDirty();
}

function cellValue(row: HouseRow, key: string) {
  return (row as unknown as Record<string, unknown>)[key];
}

function setCell(row: HouseRow, key: string, val: string) {
  (row as unknown as Record<string, unknown>)[key] = val;
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
  return { houses: cloneJson(rows.value) };
}

/** 评估价值合计（对标参考页底部红字） */
const evalTotalText = computed(() => {
  const sum = rows.value.reduce(
    (acc, r) => acc + (Number(r.evalValue) || 0),
    0,
  );
  return sum.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
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
                :disabled="!columnEditable(col)"
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
                :disabled="!columnEditable(col)"
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
      <div
        v-if="rows.length"
        class="mt-2 text-right text-sm font-medium text-red-500"
      >
        评估总价值：¥ {{ evalTotalText }}
      </div>
    </SectionCard>
    <div v-else class="py-8 text-center text-xs text-gray-400">
      当前场景未挂载房屋列，请在页面配置中启用
    </div>
  </div>
</template>
