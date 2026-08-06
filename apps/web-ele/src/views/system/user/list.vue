<script lang="ts" setup>
import type { OnActionClickParams, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { SystemDeptApi, SystemUserApi } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { Page, Tree, useVbenDrawer } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import { ElButton, ElCard, ElInput, ElMessage, ElMessageBox, ElTag } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteUser, getDeptList, getUserList, updateUser } from '#/api';
import { $t } from '#/locales';

import { useColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const deptList = ref<SystemDeptApi.SystemDept[]>([]);
const inputSearchValue = ref('');
/** 当前选中的部门 ID，空字符串表示不过滤 */
const selectedDeptId = ref('');

const [FormDrawer, formDrawerApi] = useVbenDrawer({
  connectedComponent: Form,
  destroyOnClose: true,
});

/**
 * 在部门树中按名称递归过滤（保留匹配节点及其祖先）
 * @param nodes 部门树
 * @param keyword 搜索关键字
 */
function filterDeptTree(
  nodes: SystemDeptApi.SystemDept[],
  keyword: string,
): SystemDeptApi.SystemDept[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return nodes;

  const result: SystemDeptApi.SystemDept[] = [];
  for (const node of nodes) {
    const children = node.children
      ? filterDeptTree(node.children, keyword)
      : [];
    const selfMatch = String(node.name || '')
      .toLowerCase()
      .includes(kw);
    if (selfMatch || children.length > 0) {
      result.push({
        ...node,
        children: children.length > 0 ? children : node.children,
      });
    }
  }
  return result;
}

/** 左侧展示用的部门树（支持搜索） */
const displayDeptList = computed(() =>
  filterDeptTree(deptList.value, inputSearchValue.value),
);

/**
 * 根据 id 查找部门名称
 * @param nodes 部门树
 * @param id 部门 ID
 */
function findDeptName(
  nodes: SystemDeptApi.SystemDept[],
  id: string,
): string {
  for (const node of nodes) {
    if (String(node.id) === String(id)) {
      return node.name;
    }
    if (node.children?.length) {
      const name = findDeptName(node.children, id);
      if (name) return name;
    }
  }
  return '';
}

/** 当前筛选部门名称（用于提示） */
const selectedDeptName = computed(() =>
  selectedDeptId.value
    ? findDeptName(deptList.value, selectedDeptId.value)
    : '',
);

/**
 * 状态切换前确认并调用更新接口
 * @param newStatus 目标状态
 * @param row 当前行
 */
async function onStatusChange(
  newStatus: number,
  row: SystemUserApi.SystemUser,
) {
  try {
    await ElMessageBox.confirm(
      `确认将「${row.name}」状态切换为【${newStatus === 1 ? '启用' : '禁用'}】？`,
      $t('common.prompt'),
      { type: 'warning' },
    );
    await updateUser(row.id, { status: newStatus as 0 | 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 表格操作列点击分发
 * @param params 操作码与行数据
 */
function onActionClick({
  code,
  row,
}: OnActionClickParams<SystemUserApi.SystemUser>) {
  if (code === 'edit') {
    formDrawerApi.setData(row).open();
  } else if (code === 'delete') {
    onDelete(row);
  }
}

/** 删除用户并刷新列表 */
async function onDelete(row: SystemUserApi.SystemUser) {
  await deleteUser(row.id);
  ElMessage.success($t('ui.actionMessage.deleteSuccess', [row.name]));
  onRefresh();
}

function onRefresh() {
  gridApi.query();
}

function onCreate() {
  formDrawerApi.setData({
    deptId: selectedDeptId.value || undefined,
  }).open();
}

/** 加载左侧部门树 */
async function loadDeptList() {
  deptList.value = await getDeptList();
}

/**
 * 从 Tree @select 事件中解析部门 ID
 * Tree 抛出的是 FlattenedItem，真正的数据在 value 上
 * @param node Tree 选中节点
 */
function resolveDeptId(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  const item = node as Record<string, any>;
  return String(item?.value?.id ?? item?.id ?? '');
}

/**
 * 选中部门后按部门（含下级）筛选用户；再点同一部门则取消筛选
 * @param node Tree 选中节点（FlattenedItem）
 */
function selectDept(node: unknown) {
  const id = resolveDeptId(node);
  if (!id) return;
  selectedDeptId.value = selectedDeptId.value === id ? '' : id;
  gridApi.reload();
}

/** 清除部门筛选 */
function clearDeptFilter() {
  selectedDeptId.value = '';
  gridApi.reload();
}

onMounted(() => {
  loadDeptList();
});

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: useColumns(onActionClick, onStatusChange),
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          return await getUserList({
            page: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
            // 仅在选中部门时传参，避免空字符串干扰
            ...(selectedDeptId.value
              ? { deptId: selectedDeptId.value }
              : {}),
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
  } as VxeTableGridOptions<SystemUserApi.SystemUser>,
});
</script>

<template>
  <Page auto-content-height>
    <FormDrawer @success="onRefresh" />
    <div class="flex size-full gap-4">
      <ElCard class="w-1/5 shrink-0" shadow="never">
        <ElInput
          v-model="inputSearchValue"
          class="mb-3"
          clearable
          :placeholder="$t('system.user.placeholder')"
        />
        <div
          v-if="selectedDeptId"
          class="mb-2 flex items-center justify-between gap-2"
        >
          <ElTag type="primary" effect="plain" class="max-w-[70%] truncate">
            {{ selectedDeptName || selectedDeptId }}
          </ElTag>
          <ElButton link type="primary" @click="clearDeptFilter">
            全部
          </ElButton>
        </div>
        <Tree
          label-field="name"
          value-field="id"
          :tree-data="displayDeptList"
          :default-expanded-level="2"
          @select="selectDept"
        />
      </ElCard>
      <div class="min-w-0 flex-1">
        <Grid :table-title="$t('system.user.list')">
          <template #toolbar-tools>
            <ElButton type="primary" @click="onCreate">
              <Plus class="mr-1 size-4" />
              {{ $t('ui.actionTitle.create', [$t('system.user.name')]) }}
            </ElButton>
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>
