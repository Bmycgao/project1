<script lang="ts" setup>
/**
 * 页面配置管理：
 * - 实体/列模板：配字段
 * - 协议场景：勾选已开通动作 + 数据范围，菜单挂协议列表后即时生效
 */
import type { OnActionClickParams, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { PageSchemaApi } from '#/api';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import { ElAlert, ElButton, ElMessage } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deletePageSchema, getPageSchemaList } from '#/api';

import { useColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
  destroyOnClose: true,
});

function onActionClick({
  code,
  row,
}: OnActionClickParams<PageSchemaApi.PageSchema>) {
  if (code === 'edit') {
    formDrawerApi.setData(row).open();
  } else if (code === 'delete') {
    onDelete(row);
  }
}

async function onDelete(row: PageSchemaApi.PageSchema) {
  await deletePageSchema(row.id);
  ElMessage.success(`已删除配置「${row.title}」`);
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
    columns: useColumns(onActionClick),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      ajax: {
        query: async (_params, formValues) => {
          const list = await getPageSchemaList(formValues);
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
    <FormDrawer @success="onRefresh" />
    <ElAlert
      class="mb-4"
      type="info"
      show-icon
      :closable="false"
      title="可视化配置台怎么用"
      description="① 业务场景：勾选已开通按钮与数据状态；② 菜单挂协议列表 + 本场景；③ 编辑底部可「按角色预览」列/按钮/字段；④ 每次保存会留历史，可一键回滚。角色/用户与页面配置会落盘到 mock data 目录，重启一般不丢。"
    />
    <Grid table-title="页面与场景配置">
      <template #toolbar-tools>
        <ElButton type="primary" @click="onCreate">
          <Plus class="mr-1 size-4" />
          新建页面/场景
        </ElButton>
      </template>
    </Grid>
  </Page>
</template>
