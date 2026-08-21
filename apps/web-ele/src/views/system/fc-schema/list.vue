<script lang="ts" setup>
/**
 * FormCreate 模板库列表：在此新建/编辑表单与表格模板
 * 页面配置场景仅引用模板 id（fcBindings）
 */
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { FcSchemaApi } from '#/api';

import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import { ElButton, ElMessage, ElMessageBox } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteFcSchema, getFcSchemaList } from '#/api';

import { useColumns, useGridFormSchema } from './data';

const router = useRouter();

function onActionClick({
  code,
  row,
}: OnActionClickParams<FcSchemaApi.FcSchema>) {
  if (code === 'edit') {
    router.push({ name: 'SystemFcSchemaEdit', params: { id: row.id } });
  } else if (code === 'delete') {
    onDelete(row);
  }
}

async function onDelete(row: FcSchemaApi.FcSchema) {
  await ElMessageBox.confirm(`确定删除模板「${row.name}」？`, '删除确认');
  await deleteFcSchema(row.id);
  ElMessage.success('已删除');
  gridApi.query();
}

function onCreate() {
  router.push({ name: 'SystemFcSchemaEdit', params: { id: 'new' } });
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
          const list = await getFcSchemaList(formValues);
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
    <Grid table-title="表单 / 表格模板">
      <template #toolbar-tools>
        <ElButton type="primary" @click="onCreate">
          <Plus class="size-4" />
          新建模板
        </ElButton>
      </template>
    </Grid>
  </Page>
</template>
