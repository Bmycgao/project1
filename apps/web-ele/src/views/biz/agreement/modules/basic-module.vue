<script lang="ts" setup>
/**
 * 基础信息模块：权利人 + 房屋
 * 子块/列由场景 moduleInner.basic 配置驱动（可挂卸、可排序）
 */
import type { AgreementDetail, HouseRow, RightHolderRow } from '../types';
import type {
  BasicModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';

import { computed, inject, ref, type Ref, watch } from 'vue';

import { ElButton, ElInput, ElMessage, ElTable, ElTableColumn } from 'element-plus';

import SectionCard from '../components/section-card.vue';
import { cloneJson } from '../clone';
import {
  normalizeBasicModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

const { fieldVisible, fieldEditable } = useAgreeFieldAccess();

/** 详情页注入的基础信息内部配置 */
const injectedBasicInner = inject<Ref<BasicModuleInnerConfig | null>>(
  'agreeModuleInnerBasic',
  ref(null),
);

const innerConfig = computed(() =>
  normalizeBasicModuleInner(injectedBasicInner.value),
);

const sections = computed(() => resolveEnabledSections(innerConfig.value));

const rightHolders = ref<RightHolderRow[]>([]);
const houses = ref<HouseRow[]>([]);
const dirty = ref(false);

watch(
  () => props.detail,
  (val) => {
    rightHolders.value = val ? cloneJson(val.rightHolders) : [];
    houses.value = val ? cloneJson(val.houses) : [];
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

function addRightHolder() {
  rightHolders.value.push({
    id: `rh-${Date.now()}`,
    agreementNo: props.detail?.agreementNo || '',
    name: '',
    idNo: '',
    phone: '',
  });
  markDirty();
}

function addHouse() {
  houses.value.push({
    id: `hs-${Date.now()}`,
    address: '',
    certNo: '',
    propertyType: '',
  });
  markDirty();
}

/**
 * 列是否最终可见：配置启用 ∩（可选）字段权限
 * @param field 字段配置
 */
function columnVisible(field: ModuleInnerFieldItem) {
  if (!field.enabled) return false;
  if (field.accessField) {
    return fieldVisible(field.accessField);
  }
  return true;
}

/**
 * 列是否可编辑
 * @param field 字段配置
 */
function columnEditable(field: ModuleInnerFieldItem) {
  if (field.accessField) {
    return fieldEditable(field.accessField);
  }
  return true;
}

/**
 * 读权利人单元格
 * @param row 行
 * @param key 字段
 */
function rhValue(row: RightHolderRow, key: string) {
  return (row as Record<string, unknown>)[key];
}

/**
 * 写权利人单元格
 * @param row 行
 * @param key 字段
 * @param val 值
 */
function setRhValue(row: RightHolderRow, key: string, val: string) {
  (row as Record<string, unknown>)[key] = val;
  markDirty();
}

/**
 * 读房屋单元格
 * @param row 行
 * @param key 字段
 */
function hsValue(row: HouseRow, key: string) {
  return (row as Record<string, unknown>)[key];
}

/**
 * 写房屋单元格
 * @param row 行
 * @param key 字段
 * @param val 值
 */
function setHsValue(row: HouseRow, key: string, val: string) {
  (row as Record<string, unknown>)[key] = val;
  markDirty();
}

async function validate() {
  const secs = sections.value;
  const needRh = secs.some((s) => s.key === 'rightHolders');
  const needHs = secs.some((s) => s.key === 'houses');
  if (needRh) {
    if (!rightHolders.value.length || !rightHolders.value[0]?.name?.trim()) {
      ElMessage.warning('请完善权利人姓名');
      return false;
    }
  }
  if (needHs) {
    if (!houses.value.length || !houses.value[0]?.address?.trim()) {
      ElMessage.warning('请完善房屋地址');
      return false;
    }
  }
  return true;
}

function getValues() {
  return {
    rightHolders: cloneJson(rightHolders.value),
    houses: cloneJson(houses.value),
  };
}

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });

/** 权利人启用列 */
function rhFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => columnVisible(f));
}

/** 房屋启用列 */
function hsFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => columnVisible(f));
}
</script>

<template>
  <div @input="markDirty">
    <template v-for="sec in sections" :key="sec.key">
      <SectionCard
        v-if="sec.key === 'rightHolders'"
        :title="sec.label"
        :subtitle="sec.subtitle"
      >
        <template #extra>
          <ElButton size="small" type="primary" link @click="addRightHolder">
            新增
          </ElButton>
        </template>
        <ElTable :data="rightHolders" border size="small" row-key="id">
          <ElTableColumn
            v-for="col in rhFields(sec)"
            :key="col.key"
            :label="col.label"
            :min-width="col.minWidth || 100"
          >
            <template #default="{ row }">
              <ElInput
                size="small"
                :model-value="String(rhValue(row, col.key) ?? '')"
                :disabled="!columnEditable(col)"
                @update:model-value="(v: string) => setRhValue(row, col.key, v)"
              />
            </template>
          </ElTableColumn>
        </ElTable>
      </SectionCard>

      <SectionCard
        v-else-if="sec.key === 'houses'"
        :title="sec.label"
        :subtitle="sec.subtitle"
      >
        <template #extra>
          <ElButton size="small" type="primary" link @click="addHouse">
            新增
          </ElButton>
        </template>
        <ElTable :data="houses" border size="small" row-key="id">
          <template v-for="col in hsFields(sec)" :key="col.key">
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
                <ElInput
                  size="small"
                  :model-value="String(hsValue(row, col.key) ?? '')"
                  :disabled="!columnEditable(col)"
                  @update:model-value="
                    (v: string) => setHsValue(row, col.key, v)
                  "
                />
              </template>
            </ElTableColumn>
          </template>
        </ElTable>
      </SectionCard>
    </template>

    <div
      v-if="!sections.length"
      class="py-8 text-center text-xs text-gray-400"
    >
      当前场景未挂载基础信息子块，请在页面配置「基础信息 · 内部字段」中启用
    </div>
  </div>
</template>
