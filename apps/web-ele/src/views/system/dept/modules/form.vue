<script lang="ts" setup>
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { useVbenForm } from '#/adapter/form';
import { createDept, updateDept } from '#/api/system/dept';
import { $t } from '#/locales';

import { useFormSchema } from '../data';

const emits = defineEmits<{ success: [] }>();

const formData = ref<SystemDeptApi.SystemDept>();
const id = ref<string>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenModal({
  /** 提交部门创建/更新 */
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = await formApi.getValues();
    modalApi.lock();
    try {
      if (id.value) {
        await updateDept(id.value, values as any);
      } else {
        await createDept(values as any);
      }
      emits('success');
      modalApi.close();
    } catch {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    const data = modalApi.getData<SystemDeptApi.SystemDept>();
    formApi.reset();
    formData.value = data?.id ? data : undefined;
    id.value = data?.id;
    await nextTick();
    if (data?.id || data?.pid) {
      formApi.setValues(data);
    }
  },
});

const getModalTitle = computed(() =>
  formData.value?.id
    ? $t('common.edit', [$t('system.dept.name')])
    : $t('common.create', [$t('system.dept.name')]),
);
</script>

<template>
  <Modal :title="getModalTitle">
    <Form />
  </Modal>
</template>
