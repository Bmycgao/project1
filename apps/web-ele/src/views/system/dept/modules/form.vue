<script lang="ts" setup>
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { useVbenForm } from '#/adapter/form';
import { createDept, updateDept } from '#/api/system/dept';
import { $t } from '#/locales';

import { useFormSchema } from '../data';

/** 部门新增/编辑弹窗：list.vue 用 formModalApi.setData(...).open() 把数据交给本组件。 */

// 保存成功后通知外层列表重新查询，而不是让本表单直接操作列表表格。
const emits = defineEmits<{ success: [] }>();

// 保存正在编辑的部门，用于标题等界面显示；没有 id 表示新增。
const formData = ref<SystemDeptApi.SystemDept>();
// 当前编辑记录的 id；新增下级时只传 pid，没有 id，因此仍走创建接口。
const id = ref<string>();

// Form 是模板中的表单组件，formApi 提供校验、取值、重置和填值方法。
const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false, // 使用弹窗底部的确认按钮，不重复显示表单自己的提交按钮。
});

const [Modal, modalApi] = useVbenModal({
  /** 提交部门创建/更新 */
  async onConfirm() {
    // 按 data.ts 中 schema 的 rules 校验字段，未通过就不发保存请求。
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = await formApi.getValues();
    modalApi.lock(); // 保存期间锁定弹窗，防止重复提交。
    try {
      await (id.value
        ? updateDept(id.value, values as any)
        : createDept(values as any));
      emits('success'); // list.vue 的 @success="refreshGrid" 接收这个事件。
      modalApi.close();
    } catch {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    // 取得列表页 setData 传来的数据；先清空旧表单，再按新增/编辑场景填值。
    const data = modalApi.getData<SystemDeptApi.SystemDept>();
    formApi.reset();
    formData.value = data?.id ? data : undefined;
    id.value = data?.id;
    await nextTick(); // 等待本轮 Vue 更新，再向已更新的表单填入数据。
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
