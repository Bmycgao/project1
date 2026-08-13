<script lang="ts" setup>
import type { OnActionClickParams, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { SystemDeptApi } from '#/api/system/dept';

import { Page, useVbenModal } from '@vben/common-ui';
import { AccessControl, useAccess } from '@vben/access';
import { Plus } from '@vben/icons';

import { ElButton, ElMessage } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteDept, getDeptList } from '#/api/system/dept';
import { $t } from '#/locales';

import { useColumns } from './data';
import Form from './modules/form.vue';

const { hasAccessByCodes } = useAccess();

const canCreate = hasAccessByCodes(['System:Dept:Create']);
const canEdit = hasAccessByCodes(['System:Dept:Edit']);
const canDelete = hasAccessByCodes(['System:Dept:Delete']);

const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true,
});

function onActionClick({
  code,
  row,
}: OnActionClickParams<SystemDeptApi.SystemDept>) {
  switch (code) {
    case 'append': {
      formModalApi.setData({ pid: row.id }).open();
      break;
    }
    case 'delete': {
      onDelete(row);
      break;
    }
    case 'edit': {
      formModalApi.setData(row).open();
      break;
    }
  }
}

async function onDelete(row: SystemDeptApi.SystemDept) {
  await deleteDept(row.id);
  ElMessage.success($t('ui.actionMessage.deleteSuccess', [row.name]));
  refreshGrid();
}

function refreshGrid() {
  gridApi.query();
}

function onCreate() {
  formModalApi.setData({}).open();
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
          const list = await getDeptList();
          return { items: list };
        },
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: { custom: true, refresh: true, zoom: true },
    treeConfig: {
      childrenField: 'children',
      rowField: 'id',
      transform: false,
    },
  } as VxeTableGridOptions,
});
</script>

<template>
  <Page auto-content-height>
    <FormModal @success="refreshGrid" />
    <Grid :table-title="$t('system.dept.list')">
      <template #toolbar-tools>
        <AccessControl :codes="['System:Dept:Create']" type="code">
          <ElButton type="primary" @click="onCreate">
            <Plus class="mr-1 size-4" />
            {{ $t('ui.actionTitle.create', [$t('system.dept.name')]) }}
          </ElButton>
        </AccessControl>
      </template>
    </Grid>
  </Page>
</template>
