<script lang="ts" setup>
import type { OnActionClickParams, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { SystemMenuApi } from '#/api/system/menu';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { AccessControl, useAccess } from '@vben/access';
import { IconifyIcon, Plus } from '@vben/icons';

import { ElButton, ElMessage } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteMenu, getMenuList } from '#/api/system/menu';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';

import { useColumns } from './data';
import Form from './modules/form.vue';

const authStore = useAuthStore();
const { hasAccessByCodes } = useAccess();

const canCreate = hasAccessByCodes(['System:Menu:Create']);
const canEdit = hasAccessByCodes(['System:Menu:Edit']);
const canDelete = hasAccessByCodes(['System:Menu:Delete']);

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
  destroyOnClose: true,
});

/**
 * 菜单保存成功：刷新表格；新建则重建侧栏（权限已写入超管/管理员）
 * @param payload 是否新建
 */
function onFormSuccess(payload?: { created?: boolean }) {
  onRefresh();
  if (!payload?.created) return;
  ElMessage.success(
    '菜单已创建，并已授权给超管与系统管理员；其它角色请到「角色管理」勾选。正在刷新侧栏…',
  );
  // 清动态路由缓存并整页刷新，使 /menu/all 重新生效
  authStore.reloadAccess();
}

function onActionClick({
  code,
  row,
}: OnActionClickParams<SystemMenuApi.SystemMenu>) {
  switch (code) {
    case 'append': {
      formDrawerApi.setData({ pid: row.id }).open();
      break;
    }
    case 'delete': {
      onDelete(row);
      break;
    }
    case 'edit': {
      formDrawerApi.setData(row).open();
      break;
    }
  }
}

async function onDelete(row: SystemMenuApi.SystemMenu) {
  await deleteMenu(row.id);
  ElMessage.success($t('ui.actionMessage.deleteSuccess', [row.name]));
  onRefresh();
}

function onRefresh() {
  gridApi.query();
}

function onCreate() {
  formDrawerApi.setData({}).open();
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: useColumns(onActionClick, {
      canCreate,
      canEdit,
      canDelete,
    }),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      ajax: {
        query: async () => {
          const list = await getMenuList();
          return { items: list };
        },
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: { custom: true, refresh: true, zoom: true },
    treeConfig: {
      parentField: 'pid',
      rowField: 'id',
      transform: false,
    },
  } as VxeTableGridOptions,
});
</script>

<template>
  <Page auto-content-height>
    <FormDrawer @success="onFormSuccess" />
    <Grid>
      <template #toolbar-tools>
        <AccessControl :codes="['System:Menu:Create']" type="code">
          <ElButton type="primary" @click="onCreate">
            <Plus class="mr-1 size-4" />
            {{ $t('ui.actionTitle.create', [$t('system.menu.name')]) }}
          </ElButton>
        </AccessControl>
      </template>
      <template #title="{ row }">
        <div class="flex w-full items-center gap-1">
          <IconifyIcon
            v-if="row.type === 'button'"
            icon="carbon:security"
            class="size-4"
          />
          <IconifyIcon
            v-else-if="row.meta?.icon"
            :icon="row.meta.icon"
            class="size-4"
          />
          <span>{{ $t(row.meta?.title || row.name) }}</span>
        </div>
      </template>
    </Grid>
  </Page>
</template>
