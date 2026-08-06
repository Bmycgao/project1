<script lang="ts" setup>
import type { SystemRoleApi } from '#/api/system/role';

import { computed, nextTick, ref } from 'vue';

import { Tree, useVbenDrawer } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { useVbenForm } from '#/adapter/form';
import { getMenuList } from '#/api/system/menu';
import { createRole, updateRole } from '#/api/system/role';
import { $t } from '#/locales';

import { useFormSchema } from '../data';

const emits = defineEmits<{ success: [] }>();

const formData = ref<SystemRoleApi.SystemRole>();
const id = ref<string>();
const permissions = ref<any[]>([]);
const loadingPermissions = ref(false);

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
});

/** 加载菜单树作为授权数据源 */
async function loadPermissions() {
  loadingPermissions.value = true;
  try {
    permissions.value = await getMenuList();
  } finally {
    loadingPermissions.value = false;
  }
}

const [Drawer, drawerApi] = useVbenDrawer({
  /** 保存角色及菜单授权 */
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = await formApi.getValues();
    drawerApi.lock();
    try {
      if (id.value) {
        await updateRole(id.value, values as any);
      } else {
        await createRole(values as any);
      }
      emits('success');
      drawerApi.close();
    } catch {
      drawerApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    const data = drawerApi.getData<SystemRoleApi.SystemRole>();
    formApi.reset();
    formData.value = data;
    id.value = data?.id;
    if (permissions.value.length === 0) {
      await loadPermissions();
    }
    await nextTick();
    if (data?.id) {
      formApi.setValues(data);
    }
  },
});

const getDrawerTitle = computed(() =>
  formData.value?.id
    ? $t('common.edit', [$t('system.role.name')])
    : $t('common.create', [$t('system.role.name')]),
);
</script>

<template>
  <Drawer :title="getDrawerTitle">
    <Form>
      <template #permissions="slotProps">
        <div v-loading="loadingPermissions" class="w-full min-h-40">
          <Tree
            :tree-data="permissions"
            multiple
            bordered
            :default-expanded-level="2"
            v-bind="slotProps.componentProps"
            value-field="id"
            label-field="meta.title"
            icon-field="meta.icon"
          >
            <template #node="{ value }">
              <IconifyIcon
                v-if="value.meta?.icon"
                :icon="value.meta.icon"
                class="mr-1"
              />
              {{ $t(value.meta?.title || value.name) }}
            </template>
          </Tree>
        </div>
      </template>
    </Form>
  </Drawer>
</template>
