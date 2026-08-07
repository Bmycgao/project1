<script lang="ts" setup>
/**
 * 基础信息模块：权利人信息 + 房屋列表（可编辑，供详情页分存/总提）
 */
import type {
  HouseRow,
  MortgageBasicModule,
  MortgageDetail,
  RightHolderRow,
} from '../types';

import { nextTick, ref, watch } from 'vue';

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

const rightHolders = ref<RightHolderRow[]>([]);
const houses = ref<HouseRow[]>([]);
const houseTableRef = ref<InstanceType<typeof ElTable>>();

/** 从详情同步本地可编辑数据 */
function syncFromDetail(detail: MortgageDetail | null) {
  if (!detail) {
    rightHolders.value = [];
    houses.value = [];
    return;
  }
  rightHolders.value = cloneJson(detail.rightHolders || []);
  houses.value = cloneJson(detail.houses || []);
}

watch(
  () => props.detail,
  (val) => {
    syncFromDetail(val);
    nextTick(() => {
      try {
        houses.value.forEach((row) => {
          houseTableRef.value?.toggleRowSelection?.(row, true);
        });
      } catch {
        // 表格未就绪时忽略勾选
      }
    });
  },
  { immediate: true },
);

/** 新增权利人 */
function addRightHolder() {
  rightHolders.value.push({
    id: `rh-${Date.now()}`,
    agreementNo: props.detail?.agreementNo || '',
    name: '',
    idNo: '',
    phone: '',
  });
}

/** 删除权利人 */
function removeRightHolder(index: number) {
  rightHolders.value.splice(index, 1);
}

/** 新增房屋 */
function addHouse() {
  houses.value.push({
    id: `hs-${Date.now()}`,
    address: '',
    certNo: '',
    propertyType: '',
  });
}

/** 删除房屋 */
function removeHouse(index: number) {
  houses.value.splice(index, 1);
}

/**
 * 校验本模块
 * @returns 是否通过
 */
async function validate(): Promise<boolean> {
  if (rightHolders.value.length === 0) {
    ElMessage.warning('请至少录入一条权利人信息');
    return false;
  }
  const bad = rightHolders.value.find((r) => !r.name?.trim());
  if (bad) {
    ElMessage.warning('权利人姓名不能为空');
    return false;
  }
  if (houses.value.length === 0) {
    ElMessage.warning('请至少录入一条房屋信息');
    return false;
  }
  const badHouse = houses.value.find((h) => !h.address?.trim());
  if (badHouse) {
    ElMessage.warning('房屋地址不能为空');
    return false;
  }
  return true;
}

/** 取出本模块数据 */
function getValues(): MortgageBasicModule {
  return {
    rightHolders: cloneJson(rightHolders.value),
    houses: cloneJson(houses.value),
  };
}

defineExpose({ validate, getValues, syncFromDetail });
</script>

<template>
  <div class="mortgage-basic-info space-y-4">
    <section class="overflow-hidden rounded border border-gray-200">
      <div class="section-title section-title--teal flex items-center justify-between">
        <span>权利人信息</span>
        <ElButton size="small" type="primary" link @click="addRightHolder">
          新增
        </ElButton>
      </div>
      <ElTable
        :data="rightHolders"
        border
        size="small"
        row-key="id"
        empty-text="暂无权利人"
      >
        <ElTableColumn type="selection" width="48" align="center" />
        <ElTableColumn label="协议编号" min-width="130">
          <template #default="{ row }">
            <ElInput v-model="row.agreementNo" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="姓名" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.name" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="身份证号/营业执照号" min-width="180">
          <template #default="{ row }">
            <ElInput v-model="row.idNo" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="联系电话" min-width="120">
          <template #default="{ row }">
            <ElInput v-model="row.phone" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" align="center" fixed="right">
          <template #default="{ $index }">
            <ElButton
              type="danger"
              link
              size="small"
              @click="removeRightHolder($index)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <div class="pager-hint">
        显示第 1 到第 {{ rightHolders.length }} 条记录，总共
        {{ rightHolders.length }} 条记录
      </div>
    </section>

    <section class="overflow-hidden rounded border border-gray-200">
      <div class="section-title section-title--pink flex items-center justify-between">
        <span>房屋列表</span>
        <ElButton size="small" type="primary" link @click="addHouse">
          新增
        </ElButton>
      </div>
      <ElTable
        ref="houseTableRef"
        :data="houses"
        border
        size="small"
        row-key="id"
        empty-text="暂无房屋"
      >
        <ElTableColumn type="selection" width="48" align="center" />
        <ElTableColumn label="房屋地址" min-width="180">
          <template #default="{ row }">
            <ElInput v-model="row.address" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="产权证号" min-width="200">
          <template #default="{ row }">
            <ElInput v-model="row.certNo" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="产权类型" min-width="200">
          <template #default="{ row }">
            <ElInput v-model="row.propertyType" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" align="center" fixed="right">
          <template #default="{ $index }">
            <ElButton
              type="danger"
              link
              size="small"
              @click="removeHouse($index)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <div class="pager-hint">
        显示第 1 到第 {{ houses.length }} 条记录，总共
        {{ houses.length }} 条记录
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
}

.section-title--teal {
  background: #d7ecec;
}

.section-title--pink {
  background: #f5d6d6;
}

.pager-hint {
  padding: 8px 12px;
  font-size: 12px;
  color: #909399;
  border-top: 1px solid #ebeef5;
}
</style>
