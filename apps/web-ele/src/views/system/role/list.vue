<script lang="ts" setup>
import type { OnActionClickParams, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { SystemRoleApi } from '#/api';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { AccessControl, useAccess } from '@vben/access';
import { Plus } from '@vben/icons';

import { ElButton, ElMessage, ElMessageBox } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteRole, getRoleList, updateRole } from '#/api';
import { $t } from '#/locales';

import { useColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const { hasAccessByCodes } = useAccess();

/** 角色新建 */
const canCreate = hasAccessByCodes(['System:Role:Create']);
/** 角色编辑（删除菜单未挂独立码，与编辑共用） */
const canEdit = hasAccessByCodes(['System:Role:Edit']);

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
  destroyOnClose: true,
});

/**
 * 状态切换确认
 * @param newStatus 目标状态
 * @param row 角色行
 */
async function onStatusChange(
  newStatus: number,
  row: SystemRoleApi.SystemRole,
) {
  try {
    await ElMessageBox.confirm(
      `确认将「${row.name}」状态切换为【${newStatus === 1 ? '启用' : '禁用'}】？`,
      $t('common.prompt'),
      { type: 'warning' },
    );
    await updateRole(row.id, { status: newStatus as 0 | 1 });
    return true;
  } catch {
    return false;
  }
}

function onActionClick({
  code,
  row,
}: OnActionClickParams<SystemRoleApi.SystemRole>) {
  if (code === 'edit') {
    formDrawerApi.setData(row).open();
  } else if (code === 'delete') {
    onDelete(row);
  }
}

async function onDelete(row: SystemRoleApi.SystemRole) {
  await deleteRole(row.id);
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
  formOptions: {
    schema: useGridFormSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: useColumns(
      onActionClick,
      canEdit ? onStatusChange : undefined,
      { canEdit, canDelete: canEdit },
    ),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getRoleList({
            page: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          });
        },
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: {
      custom: true,
      refresh: true,
      search: true,
      zoom: true,
    },
  } as VxeTableGridOptions<SystemRoleApi.SystemRole>,
});
</script>

<template>
  <Page auto-content-height>
    <FormDrawer @success="onRefresh" />
    <Grid :table-title="$t('system.role.list')">
      <template #toolbar-tools>
        <AccessControl :codes="['System:Role:Create']" type="code">
          <ElButton type="primary" @click="onCreate">
            <Plus class="mr-1 size-4" />
            {{ $t('ui.actionTitle.create', [$t('system.role.name')]) }}
          </ElButton>
        </AccessControl>
      </template>
    </Grid>
  </Page>
</template>
