<script lang="ts" setup>
/**
 * 签约信息模块：签约表单 + 通讯信息（单行业务不用宽表）
 */
import type { AgreementDetail, ContactInfo, SigningInfo } from '../types';

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

const signing = reactive<SigningInfo>({
  houseAddress: '',
  compensateMethod: '',
  decorateEval: '否',
  hasMortgage: '否',
  mortgagee: '',
  debtAmount: 0,
  hasSeal: '否',
  sealCourt: '',
});

const contact = reactive<ContactInfo>({
  address: '',
  contact: '',
  phone: '',
  emergency: '',
});

const dirty = ref(false);

watch(
  () => props.detail,
  (val) => {
    if (!val) return;
    Object.assign(signing, cloneJson(val.signing));
    Object.assign(contact, cloneJson(val.contact));
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  dirty.value = true;
  emit('dirty');
}

async function validate() {
  if (!signing.houseAddress?.trim()) {
    ElMessage.warning('请填写签约房屋地址');
    return false;
  }
  if (!signing.compensateMethod) {
    ElMessage.warning('请选择补偿方式');
    return false;
  }
  return true;
}

function getValues() {
  return {
    signing: cloneJson(signing),
    contact: cloneJson(contact),
  };
}

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
</script>

<template>
  <div @change="markDirty" @input="markDirty">
    <SectionCard title="签约信息" subtitle="按房屋维度维护签约要素">
      <ElForm label-width="140px" class="max-w-4xl">
        <ElRow :gutter="16">
          <ElCol :span="24">
            <ElFormItem label="房屋地址">
              <ElInput v-model="signing.houseAddress" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="补偿方式">
              <ElSelect v-model="signing.compensateMethod" class="w-full">
                <ElOption label="产权调换" value="产权调换" />
                <ElOption label="货币补偿" value="货币补偿" />
                <ElOption label="货币+调换" value="货币+调换" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="装修装饰评估">
              <ElSelect v-model="signing.decorateEval" class="w-full">
                <ElOption label="是" value="是" />
                <ElOption label="否" value="否" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="是否存在抵押">
              <ElSelect v-model="signing.hasMortgage" class="w-full">
                <ElOption label="是" value="是" />
                <ElOption label="否" value="否" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="抵押权人">
              <ElInput v-model="signing.mortgagee" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="担保主债权金额">
              <ElInput v-model="signing.debtAmount" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="是否存在查封">
              <ElSelect v-model="signing.hasSeal" class="w-full">
                <ElOption label="是" value="是" />
                <ElOption label="否" value="否" />
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :span="24">
            <ElFormItem label="查封法院">
              <ElInput v-model="signing.sealCourt" />
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </SectionCard>

    <SectionCard title="通讯信息" subtitle="用于送达与紧急联系">
      <ElForm label-width="120px" class="max-w-4xl">
        <ElRow :gutter="16">
          <ElCol :span="24">
            <ElFormItem label="通讯地址">
              <ElInput v-model="contact.address" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="联系人">
              <ElInput v-model="contact.contact" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="联系电话">
              <ElInput v-model="contact.phone" />
            </ElFormItem>
          </ElCol>
          <ElCol :xs="24" :md="12">
            <ElFormItem label="紧急联系人">
              <ElInput v-model="contact.emergency" />
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </SectionCard>
  </div>
</template>
