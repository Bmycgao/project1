<script lang="ts" setup>
/**
 * 补偿安置信息模块
 */
import type { AgreementDetail, CompensationInfo } from '../types';

import { reactive, ref, watch } from 'vue';

import {
  ElCol,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElRow,
  ElSelect,
} from 'element-plus';

import SectionCard from '../components/section-card.vue';
import { cloneJson } from '../clone';

const props = defineProps<{ detail: AgreementDetail | null }>();
const emit = defineEmits<{ dirty: [] }>();

const form = reactive<CompensationInfo>({
  settleType: '',
  settleAddress: '',
  amount: 0,
  remark: '',
});

const dirty = ref(false);

watch(
  () => props.detail,
  (val) => {
    if (!val) return;
    Object.assign(form, cloneJson(val.compensation));
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

async function validate() {
  if (!form.settleType) {
    ElMessage.warning('请选择安置方式');
    return false;
  }
  return true;
}

function getValues() {
  return { compensation: cloneJson(form) };
}

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
</script>

<template>
  <div @change="markDirty" @input="markDirty">
    <SectionCard title="补偿安置信息" subtitle="安置方式与补偿金额">
      <ElForm label-width="120px" class="max-w-3xl">
        <ElRow :gutter="16">
          <ElCol :xs="24" :md="12">
            <ElFormItem label="安置方式">
              <ElSelect v-model="form.settleType" class="w-full">
                <ElOption label="产权调换" value="产权调换" />
                <ElOption label="货币补偿" value="货币补偿" />
                <ElOption label="货币+调换" value="货币+调换" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="补偿金额">
              <ElInput v-model="form.amount" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="24">
            <ElFormItem label="安置地址">
              <ElInput v-model="form.settleAddress" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="24">
            <ElFormItem label="备注">
              <ElInput v-model="form.remark" type="textarea" :rows="3" />
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </SectionCard>
  </div>
</template>
