<script lang="ts" setup>
/**
 * 抵押信息模块：贷款主数据（可编辑）
 */
import type { MortgageDetail, MortgageInfoData } from '../types';

import { ref, watch } from 'vue';

import { ElInput, ElMessage, ElTable, ElTableColumn } from 'element-plus';

import { cloneJson } from '../clone';

const props = defineProps<{
  /** 详情数据 */
  detail: MortgageDetail | null;
}>();

const rows = ref<MortgageInfoData[]>([]);

/** 从详情同步 */
function syncFromDetail(detail: MortgageDetail | null) {
  rows.value = detail?.mortgageInfo ? cloneJson(detail.mortgageInfo) : [];
}

watch(
  () => props.detail,
  (val) => syncFromDetail(val),
  { immediate: true },
);

/** 校验本模块 */
async function validate(): Promise<boolean> {
  if (rows.value.length === 0) {
    ElMessage.warning('请填写抵押信息');
    return false;
  }
  const row = rows.value[0];
  if (!row?.loanStartTime) {
    ElMessage.warning('贷款起始时间不能为空');
    return false;
  }
  return true;
}

/** 取出本模块数据 */
function getValues(): MortgageInfoData[] {
  return cloneJson(rows.value);
}

defineExpose({ validate, getValues, syncFromDetail });
</script>

<template>
  <div class="mortgage-info-tab">
    <section class="overflow-hidden rounded border border-gray-200">
      <div class="section-title">主要数据</div>
      <div class="overflow-x-auto">
        <ElTable
          :data="rows"
          border
          size="small"
          empty-text="暂无抵押信息"
          style="min-width: 1100px"
        >
          <ElTableColumn label="贷款起始时间" min-width="170">
            <template #default="{ row }">
              <ElInput v-model="row.loanStartTime" size="small" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="贷款期限" min-width="100">
            <template #default="{ row }">
              <ElInput v-model="row.loanTerm" size="small" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="贷款剩余期限" min-width="120">
            <template #default="{ row }">
              <ElInput v-model="row.remainingTerm" size="small" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="剩余贷款" min-width="120">
            <template #default="{ row }">
              <ElInput v-model="row.remainingLoan" size="small" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="还款方式" min-width="150">
            <template #default="{ row }">
              <ElInput v-model="row.repayMethod" size="small" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="贷款利率" min-width="100">
            <template #default="{ row }">
              <ElInput v-model="row.interestRate" size="small" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="履约情况" min-width="140">
            <template #default="{ row }">
              <ElInput v-model="row.performance" size="small" />
            </template>
          </ElTableColumn>
          <ElTableColumn label="补偿款账号和还款账户是否一致" min-width="220">
            <template #default="{ row }">
              <ElInput v-model="row.accountConsistent" size="small" />
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
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
