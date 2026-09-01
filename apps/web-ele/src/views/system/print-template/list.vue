<script lang="ts" setup>
/**
 * 打印模板库列表：系统管理维护 hiprint 模板，业务按钮按 templateCode 引用
 */
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { PrintTemplateApi } from '#/api';

import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import { ElButton, ElMessage, ElMessageBox } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deletePrintTemplate, getPrintTemplateList } from '#/api';

import { useColumns, useGridFormSchema } from './data';

const router = useRouter();

function onActionClick({
  code,
  row,
}: OnActionClickParams<PrintTemplateApi.PrintTemplate>) {
  if (code === 'edit') {
    router.push({
      name: 'SystemPrintTemplateEdit',
      params: { id: row.id },
    });
  } else if (code === 'delete') {
    onDelete(row);
  }
}

async function onDelete(row: PrintTemplateApi.PrintTemplate) {
  await ElMessageBox.confirm(`确定删除模板「${row.name}」？`, '删除确认');
  await deletePrintTemplate(row.id);
  ElMessage.success('已删除');
  gridApi.query();
}

function onCreate() {
  router.push({ name: 'SystemPrintTemplateEdit', params: { id: 'new' } });
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: useColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      ajax: {
        query: async (_params, formValues) => {
          const list = await getPrintTemplateList(formValues);
          return { items: list, total: list.length };
        },
      },
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: {
      custom: true,
      refresh: true,
      zoom: true,
    },
  } as VxeTableGridOptions,
});
</script>

<template>
  <Page auto-content-height>
    <Grid table-title="打印模板">
      <template #toolbar-tools>
        <ElButton type="primary" @click="onCreate">
          <Plus class="size-4" />
          新建模板
        </ElButton>
      </template>
    </Grid>
  </Page>
</template>
