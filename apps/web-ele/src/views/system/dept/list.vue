<script lang="ts" setup>
/**
 * 部门管理阅读入口：本文件负责列表与按钮事件；data.ts 定义列/表单字段；modules/form.vue 处理弹窗编辑。
 * 数据链路：Grid 自动查询 → getDeptList → #/api/system/dept → Nitro 部门接口。
 * Vben 组件/API 对照见仓库根目录《业务代码阅读指南.md》。
 */
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { SystemDeptApi } from '#/api/system/dept';

import { AccessControl, useAccess } from '@vben/access';
import { Page, useVbenModal } from '@vben/common-ui';
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

// Vben 返回两个对象：FormModal 是模板里的弹窗组件，formModalApi 是控制它的工具。
// setData 传入新增/编辑数据，open 打开弹窗；具体表单在 modules/form.vue。
const [FormModal, formModalApi] = useVbenModal({
  connectedComponent: Form,
  destroyOnClose: true, // 关闭后销毁弹窗内容，避免下一次沿用上一次的表单状态。
});

// data.ts 的 CellOperation 把操作代号 code 与当前行 row 传到这里，再由页面决定业务动作。
// 删除确认弹框由 #/adapter/vxe-table.ts 的 CellOperation 渲染器处理。
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
  // 重新执行下面 proxyConfig.ajax.query 的查数流程，而不是刷新整个浏览器。
  gridApi.query();
}

function onCreate() {
  formModalApi.setData({}).open();
}

// 数组解构：Grid 是 <Grid /> 表格组件，gridApi 是 query/reload 等控制方法。
// 先理解“输入配置、返回组件和工具”即可；封装入口在 #/adapter/vxe-table.ts。
const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    // 本页的列定义来自同目录 data.ts；权限决定操作列显示哪些按钮。
    columns: useColumns(onActionClick, {
      canCreate,
      canEdit,
      canDelete,
    }),
    height: 'auto', // 表格高度随所在容器计算，外层 Page 配合 auto-content-height。
    keepSource: true, // 保留原始行数据，供表格比较改动等功能使用；不是保存到后端。
    pagerConfig: { enabled: false }, // 部门是树形全量列表，本页不使用分页器。
    // 这里的 proxy 是表格“数据代理”，与 Vite 转发 HTTP 的开发代理不是一回事。
    proxyConfig: {
      ajax: {
        // 项目适配器启用了 autoLoad；首次加载或 gridApi.query() 时由表格调用此函数。
        query: async () => {
          const list = await getDeptList();
          // 适配器的 response.list/result 都配置为 items，所以要把数组放进 items 字段。
          return { items: list };
        },
      },
    },
    rowConfig: { keyField: 'id' }, // 用部门 id 区分每一行，避免依赖数组位置。
    toolbarConfig: { custom: true, refresh: true, zoom: true }, // 列自定义、刷新、最大化工具。
    treeConfig: {
      childrenField: 'children', // 子部门存放在每一项的 children 数组中。
      rowField: 'id', // 树节点的唯一标识字段。
      transform: false, // 接口已经返回嵌套树，不需要再从扁平列表转换成树。
    },
  } as VxeTableGridOptions, // TypeScript 类型断言；不会在运行时校验或转换接口数据。
});
</script>

<template>
  <Page auto-content-height>
    <!-- 表单保存成功后发出 success，列表重新查询，显示最新数据。 -->
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
