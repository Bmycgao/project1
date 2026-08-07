<script lang="ts" setup>
/**
 * 通用材料清单模块（签约材料 / 认定材料复用）
 */
import type { AgreementDetail, MaterialRow } from '../types';

import { computed, ref, watch } from 'vue';

import { ElButton, ElInput, ElMessage, ElTable, ElTableColumn } from 'element-plus';

import SectionCard from '../components/section-card.vue';
import { cloneJson } from '../clone';

const props = defineProps<{
  detail: AgreementDetail | null;
  /** 取详情里哪一段材料 */
  field: 'signMaterials' | 'certifyMaterials';
  title: string;
  subtitle?: string;
}>();
const emit = defineEmits<{ dirty: [] }>();

const rows = ref<MaterialRow[]>([]);
const dirty = ref(false);

const list = computed(() => props.detail?.[props.field] || []);

watch(
  list,
  (val) => {
    rows.value = cloneJson(val);
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

function addRow() {
  rows.value.push({
    id: `m-${Date.now()}`,
    category: '',
    required: '否',
    fileName: '',
    remark: '',
  });
  markDirty();
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
  markDirty();
}

async function validate() {
  if (!rows.value.length) {
    ElMessage.warning(`${props.title}不能为空`);
    return false;
  }
  if (rows.value.some((r) => !r.category?.trim())) {
    ElMessage.warning('请填写材料类别');
    return false;
  }
  return true;
}

function getValues() {
  return { [props.field]: cloneJson(rows.value) };
}

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
</script>

<template>
  <div @input="markDirty">
    <SectionCard :title="title" :subtitle="subtitle">
      <template #extra>
        <ElButton size="small" type="primary" link @click="addRow">
          新增
        </ElButton>
      </template>
      <ElTable :data="rows" border size="small" row-key="id">
        <ElTableColumn label="材料类别" min-width="140">
          <template #default="{ row }">
            <ElInput v-model="row.category" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="是否必备" min-width="100">
          <template #default="{ row }">
            <ElInput v-model="row.required" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="附件" min-width="140">
          <template #default="{ row }">
            <ElInput
              v-model="row.fileName"
              size="small"
              placeholder="演示：填写文件名"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="备注" min-width="140">
          <template #default="{ row }">
            <ElInput v-model="row.remark" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" fixed="right" align="center">
          <template #default="{ $index }">
            <ElButton type="danger" link size="small" @click="removeRow($index)">
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </SectionCard>
  </div>
</template>
