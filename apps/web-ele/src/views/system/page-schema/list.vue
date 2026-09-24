<script lang="ts" setup>
/**
 * 页面配置管理：
 * - 实体/列模板：配字段
 * - 协议场景：勾选已开通动作 + 数据范围，菜单挂协议列表后即时生效
 */
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { PageSchemaApi } from '#/api';

import { ref } from 'vue';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import { ElAlert, ElButton, ElMessage } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deletePageSchema, getPageSchemaList } from '#/api';
import { getMenuList } from '#/api/system/menu';

import { useColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

/** 配置编号 → 已挂菜单名称 */
const menuTitleMap = ref<Record<string, string>>({});

/**
 * 把菜单树上的 schemaId 收成「配置 → 菜单名」
 * @param nodes 菜单树
 * @param bucket 收集结果
 */
function collectSchemaMenus(
  nodes:
    | {
        children?: any[];
        meta?: Record<string, any>;
        name?: string;
        type?: string;
      }[]
    | undefined,
  bucket: Record<string, string[]>,
) {
  for (const node of nodes || []) {
    const schemaId = String(node.meta?.schemaId || '');
    if (schemaId && node.type === 'menu') {
      const title = String(node.meta?.title || node.name || schemaId);
      bucket[schemaId] = [...(bucket[schemaId] || []), title];
    }
    if (node.children?.length) collectSchemaMenus(node.children, bucket);
  }
}

/**
 * 列表「已挂菜单」列
 * @param schemaId 配置编号
 */
function menuTitleOf(schemaId: string) {
  return menuTitleMap.value[schemaId] || '未使用';
}

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
  } else if (code === 'history') {
    formDrawerApi.setData({ ...row, focusTab: 'check' }).open();
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
    columns: useColumns(onActionClick, menuTitleOf),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      ajax: {
        query: async (_params, formValues) => {
          const [list, menus] = await Promise.all([
            getPageSchemaList(formValues),
            getMenuList().catch(() => []),
          ]);
          const bucket: Record<string, string[]> = {};
          collectSchemaMenus(menus, bucket);
          menuTitleMap.value = Object.fromEntries(
            Object.entries(bucket).map(([key, titles]) => [
              key,
              titles.join('、'),
            ]),
          );
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
      title="保存配置不会生成新页面"
      description="普通列表挂到「动态列表」菜单，业务场景挂到协议列表菜单。没挂菜单时，下面会显示「未使用」。停用后，已挂上的菜单不再读取这份配置。"
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
