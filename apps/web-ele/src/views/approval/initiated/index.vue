<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ApprovalApi } from '#/api/approval';

import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import { ElButton, ElMessage, ElMessageBox, ElTag } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { createApproval, getInitiatedList } from '#/api/approval';
import { $t } from '#/locales';

const router = useRouter();

/**
 * 状态文案与 Tag 类型
 * @param status 实例状态
 */
function statusMeta(status: ApprovalApi.InstanceStatus) {
  const map: Record<
    ApprovalApi.InstanceStatus,
    { label: string; type: 'danger' | 'info' | 'success' | 'warning' }
  > = {
    approved: { label: $t('approval.statusApproved'), type: 'success' },
    cancelled: { label: $t('approval.statusCancelled'), type: 'info' },
    pending: { label: $t('approval.statusPending'), type: 'warning' },
    rejected: { label: $t('approval.statusRejected'), type: 'danger' },
  };
  return map[status];
}

function goDetail(row: ApprovalApi.Instance) {
  router.push({ name: 'ApprovalDetail', params: { id: row.id } });
}

/** 发起一条演示审批（固定三节点） */
async function onCreateDemo() {
  try {
    const { value } = await ElMessageBox.prompt(
      $t('approval.bizTitle'),
      $t('approval.createDemo'),
      {
        inputValue: `${$t('approval.bizOutbound')}-${Date.now().toString().slice(-4)}`,
        confirmButtonText: $t('common.confirm'),
        cancelButtonText: $t('common.cancel'),
      },
    );
    const instance = await createApproval({
      bizTitle: value,
      bizType: 'outbound',
    });
    ElMessage.success($t('ui.actionMessage.operationSuccess'));
    gridApi.query();
    router.push({ name: 'ApprovalDetail', params: { id: instance.id } });
  } catch {
    // 用户取消
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'bizTitle', minWidth: 180, title: $t('approval.bizTitle') },
      { field: 'bizType', minWidth: 120, title: $t('approval.bizType') },
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
          return await getInitiatedList({
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
    <Grid :table-title="$t('approval.initiated')">
      <template #toolbar-tools>
        <ElButton type="primary" @click="onCreateDemo">
          <Plus class="mr-1 size-4" />
          {{ $t('approval.createDemo') }}
        </ElButton>
      </template>
      <template #status="{ row }">
        <ElTag :type="statusMeta(row.status).type">
          {{ statusMeta(row.status).label }}
        </ElTag>
      </template>
      <template #action="{ row }">
        <ElButton link type="primary" @click="goDetail(row)">
          {{ $t('common.detail') }}
        </ElButton>
      </template>
    </Grid>
  </Page>
</template>
