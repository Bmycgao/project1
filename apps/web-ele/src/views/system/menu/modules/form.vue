<script lang="ts" setup>
import type { SystemMenuApi } from '#/api/system/menu';

import { computed, nextTick, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';

import { useVbenForm } from '#/adapter/form';
import { createMenu, updateMenu } from '#/api/system/menu';
import { $t } from '#/locales';

import { useFormSchema } from '../data';

const emits = defineEmits<{ success: [] }>();

const formData = ref<SystemMenuApi.SystemMenu>();
const id = ref<string>();
/** 抽屉传入的上级 id（新增下级时带入，防止表单未回填丢失） */
const parentId = ref<string | number>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
});

const [Drawer, drawerApi] = useVbenDrawer({
  /** 提交菜单创建/更新 */
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = await formApi.getValues();
    // 合并上级菜单：表单值优先，其次取「新增下级」传入的 pid
    const payload = {
      ...values,
      pid: values.pid ?? parentId.value,
    };
    drawerApi.lock();
    try {
      if (id.value) {
        await updateMenu(id.value, payload as any);
      } else {
        await createMenu(payload as any);
      }
      emits('success');
      drawerApi.close();
    } catch {
      drawerApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) {
      parentId.value = undefined;
      return;
    }
    const data = drawerApi.getData<SystemMenuApi.SystemMenu>();
    formApi.reset();
    formData.value = data;
    id.value = data?.id;
    parentId.value = data?.pid;
    await nextTick();
    if (data) {
      formApi.setValues(data);
    }
  },
});

const getDrawerTitle = computed(() =>
  formData.value?.id
    ? $t('common.edit', [$t('system.menu.name')])
    : $t('common.create', [$t('system.menu.name')]),
);
</script>

<template>
  <Drawer :title="getDrawerTitle">
    <Form />
  </Drawer>
</template>
