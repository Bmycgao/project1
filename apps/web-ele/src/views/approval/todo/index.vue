<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ApprovalApi } from '#/api/approval';

import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { ElButton, ElTag } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getTodoList } from '#/api/approval';
import { $t } from '#/locales';

const router = useRouter();

/**
 * 跳转审批详情
 * @param row 待办行
 */
/** 进入详情并标记来自待办，可执行审批操作 */
function goDetail(row: ApprovalApi.Instance) {
  router.push({
    name: 'ApprovalDetail',
    params: { id: row.id },
    query: { from: 'todo' },
  });
}

const [Grid] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'bizTitle', minWidth: 180, title: $t('approval.bizTitle') },
      { field: 'bizType', minWidth: 120, title: $t('approval.bizType') },
      {
        field: 'initiatorName',
        minWidth: 100,
        title: $t('approval.initiator'),
      },
      {
        field: 'currentNodeCode',
        minWidth: 120,
        title: $t('approval.currentNode'),
      },
      {
        field: 'createTime',
        title: $t('approval.createTime'),
        width: 180,
      },
      {
        field: 'status',
        slots: { default: 'status' },
        title: $t('approval.status'),
        width: 100,
      },
      {
        field: 'operation',
        fixed: 'right',
        slots: { default: 'action' },
        title: $t('approval.operation'),
        width: 100,
      },
    ],
    height: 'auto',
    proxyConfig: {
      ajax: {
        query: async ({ page }) => {
          return await getTodoList({
            page: page.currentPage,
            pageSize: page.pageSize,
          });
        },
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: { refresh: true, zoom: true },
  } as VxeTableGridOptions<ApprovalApi.Instance>,
});
</script>

<template>
  <Page auto-content-height>
    <Grid :table-title="$t('approval.todo')">
      <template #status>
        <ElTag type="warning">{{ $t('approval.statusPending') }}</ElTag>
      </template>
      <template #action="{ row }">
        <ElButton link type="primary" @click="goDetail(row)">
          {{ $t('common.detail') }}
        </ElButton>
      </template>
    </Grid>
  </Page>
</template>
