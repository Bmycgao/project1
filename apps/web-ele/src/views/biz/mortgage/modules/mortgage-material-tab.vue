<script lang="ts" setup>
/**
 * 抵押资料模块：材料类别等（可编辑）
 */
import type { MortgageDetail, MortgageMaterialRow } from '../types';

import { ref, watch } from 'vue';

import {
  ElButton,
  ElInput,
  ElMessage,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import { cloneJson } from '../clone';

const props = defineProps<{
  /** 详情数据 */
  detail: MortgageDetail | null;
}>();

const rows = ref<MortgageMaterialRow[]>([]);

/** 从详情同步 */
function syncFromDetail(detail: MortgageDetail | null) {
  rows.value = detail?.materials ? cloneJson(detail.materials) : [];
}

watch(
  () => props.detail,
  (val) => syncFromDetail(val),
  { immediate: true },
);

/** 新增材料行 */
function addRow() {
  rows.value.push({
    id: `mt-${Date.now()}`,
    category: '',
    required: '否',
    limitFile: '',
    supplementFile: '',
  });
}

/** 删除材料行 */
function removeRow(index: number) {
  rows.value.splice(index, 1);
}

/** 校验本模块 */
async function validate(): Promise<boolean> {
  if (rows.value.length === 0) {
    ElMessage.warning('请至少录入一条抵押资料');
    return false;
  }
  const bad = rows.value.find((r) => !r.category?.trim());
  if (bad) {
    ElMessage.warning('材料类别不能为空');
    return false;
  }
  return true;
}

/** 取出本模块数据 */
function getValues(): MortgageMaterialRow[] {
  return cloneJson(rows.value);
}

defineExpose({ validate, getValues, syncFromDetail });
</script>

<template>
  <div class="mortgage-material-tab">
    <section class="overflow-hidden rounded border border-gray-200">
      <div class="section-title flex items-center justify-between">
        <span>主要数据</span>
        <ElButton size="small" type="primary" link @click="addRow">
          新增
        </ElButton>
      </div>
      <ElTable :data="rows" border size="small" empty-text="暂无抵押资料">
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
        <ElTableColumn label="限制文件" min-width="140">
          <template #default="{ row }">
            <ElInput v-model="row.limitFile" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="限制文件补传" min-width="140">
          <template #default="{ row }">
            <ElInput v-model="row.supplementFile" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" align="center" fixed="right">
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
    </section>
  </div>
</template>

<style scoped>
.section-title {
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  background: #d7ecec;
}
</style>
