<script lang="ts" setup>
/**
 * 基础信息模块：权利人 + 房屋（可编辑）
 */
import type { AgreementDetail, HouseRow, RightHolderRow } from '../types';

import { ref, watch } from 'vue';

import { ElButton, ElInput, ElMessage, ElTable, ElTableColumn } from 'element-plus';

import SectionCard from '../components/section-card.vue';
import { cloneJson } from '../clone';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

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

async function validate() {
  if (!rightHolders.value.length || !rightHolders.value[0]?.name?.trim()) {
    ElMessage.warning('请完善权利人姓名');
    return false;
  }
  if (!houses.value.length || !houses.value[0]?.address?.trim()) {
    ElMessage.warning('请完善房屋地址');
    return false;
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
</script>

<template>
  <div @input="markDirty">
    <SectionCard title="权利人信息" subtitle="可新增多位权利人">
      <template #extra>
        <ElButton size="small" type="primary" link @click="addRightHolder">
          新增
        </ElButton>
      </template>
      <ElTable :data="rightHolders" border size="small" row-key="id">
        <ElTableColumn label="协议编号" min-width="120">
          <template #default="{ row }">
            <ElInput v-model="row.agreementNo" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="姓名" min-width="100">
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
      </ElTable>
    </SectionCard>

    <SectionCard title="房屋列表" subtitle="勾选或维护涉签约房屋">
      <template #extra>
        <ElButton size="small" type="primary" link @click="addHouse">
          新增
        </ElButton>
      </template>
      <ElTable :data="houses" border size="small" row-key="id">
        <ElTableColumn type="selection" width="48" />
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
        <ElTableColumn label="产权类型" min-width="180">
          <template #default="{ row }">
            <ElInput v-model="row.propertyType" size="small" />
          </template>
        </ElTableColumn>
      </ElTable>
    </SectionCard>
  </div>
</template>
