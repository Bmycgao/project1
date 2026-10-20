<script lang="ts" setup>
import type {
  PageSchemaKind,
  PageSchemaSection,
} from '../../../../../shared/page-schema';

/**
 * 页面配置管理：
 * - 列表页面与公共列方案：保留现有菜单和业务场景
 * - 办理详情：只组装模块和表单，直接供流程引用
 */
import type {
  OnActionClickParams,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { PageSchemaApi } from '#/api';

import { nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page, useVbenDrawer } from '@vben/common-ui';
import { Plus } from '@vben/icons';

import {
  ElAlert,
  ElButton,
  ElMessage,
  ElMessageBox,
  ElTabPane,
  ElTabs,
} from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deletePageSchema, getPageSchemaList, getPageSchemaUsage } from '#/api';
import { getMenuList } from '#/api/system/menu';

import { pageSchemaSection } from '../../../../../shared/page-schema';
import { useColumns, useGridFormSchema } from './data';
import Form from './modules/form.vue';

const route = useRoute();
const router = useRouter();
const section = ref<PageSchemaSection>('list');
const menuLoadFailed = ref(false);
const detailTitleMap = ref<Record<string, string>>({});

/** 配置编号 → 已挂菜单名称 */
const menuTitleMap = ref<Record<string, string>>({});

/**
 * 把菜单树上的 schemaId 收成「配置 → 菜单名」
 * @param nodes 菜单树
 * @param bucket 收集结果
 */
function collectSchemaMenus(
  nodes:
    | undefined
    | {
        children?: any[];
        meta?: Record<string, any>;
        name?: string;
        type?: string;
      }[],
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
  return menuLoadFailed.value
    ? '菜单引用加载失败'
    : menuTitleMap.value[schemaId] || '未挂菜单';
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
  } else if (code === 'history' || code === 'usage') {
    formDrawerApi
      .setData({ ...row, focusTab: code === 'usage' ? 'usage' : 'check' })
      .open();
  } else if (code === 'remove') {
    void onDelete(row);
  }
}

async function onDelete(row: PageSchemaApi.PageSchema) {
  let usage;
  try {
    usage = await getPageSchemaUsage(row.id);
  } catch {
    ElMessage.error('无法检查使用位置，暂不能删除，请稍后重试');
    return;
  }
  if (usage.liveCount > 0) {
    ElMessage.warning('此配置仍被引用，请先在“使用位置”中查看并解除引用');
    formDrawerApi.setData({ ...row, focusTab: 'usage' }).open();
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确认删除「${row.title}」及其配置历史？${usage.snapshotCount ? '已发布流程保留冻结快照，不受此删除影响。' : ''}`,
      '删除页面配置',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await deletePageSchema(row.id);
    ElMessage.success(`已删除配置「${row.title}」`);
    onRefresh();
  } catch {
    // 请求层显示服务端返回的引用冲突或保存错误。
  }
}

function onRefresh() {
  gridApi.query();
}

function onSaved(kind: PageSchemaKind) {
  const nextSection = pageSchemaSection(kind);
  if (section.value === nextSection) onRefresh();
  else section.value = nextSection;
}

function onCreate() {
  const schemaKind: PageSchemaKind =
    section.value === 'list' ? 'scene' : section.value;
  formDrawerApi.setData({ schemaKind }).open();
}

function sectionColumns() {
  return (
    useColumns(
      onActionClick,
      menuTitleOf,
      (id) => detailTitleMap.value[id] || id,
    ) || []
  ).filter(
    (column) =>
      section.value === 'list' ||
      !['boundMenus', 'buttonCount', 'linkedDetailLabel', 'scene'].includes(
        String(column.field),
      ),
  );
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: useGridFormSchema(),
    submitOnChange: true,
  },
  gridOptions: {
    columns: sectionColumns(),
    height: 'auto',
    keepSource: true,
    pagerConfig: { enabled: false },
    proxyConfig: {
      ajax: {
        query: async (_params, formValues) => {
          const [list, menuResult] = await Promise.all([
            getPageSchemaList(formValues),
            getMenuList()
              .then((menus) => ({ menus, failed: false }))
              .catch(() => ({ menus: [], failed: true })),
          ]);
          const bucket: Record<string, string[]> = {};
          menuLoadFailed.value = menuResult.failed;
          collectSchemaMenus(menuResult.menus, bucket);
          menuTitleMap.value = Object.fromEntries(
            Object.entries(bucket).map(([key, titles]) => [
              key,
              titles.join('、'),
            ]),
          );
          const items = list.filter(
            (item) => pageSchemaSection(item.schemaKind) === section.value,
          );
          detailTitleMap.value = Object.fromEntries(
            list
              .filter((page) => page.schemaKind === 'detail')
              .map((page) => [
                page.id,
                `${page.title}${page.status === 1 ? '' : '（已停用）'}`,
              ]),
          );
          return { items, total: items.length };
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

watch(section, () => {
  gridApi.setGridOptions({ columns: sectionColumns() });
  onRefresh();
});
watch(
  () => route.query.create,
  async (purpose) => {
    if (purpose !== 'detail') return;
    section.value = 'detail';
    await nextTick();
    formDrawerApi.setData({ schemaKind: 'detail' }).open();
    const { create: _create, ...query } = route.query;
    await router.replace({ query });
  },
  { immediate: true },
);
</script>

<template>
  <Page auto-content-height>
    <FormDrawer @success="onSaved" />
    <ElTabs v-model="section">
      <ElTabPane label="列表页面" name="list" />
      <ElTabPane label="办理详情" name="detail" />
      <ElTabPane label="公共列方案" name="template" />
    </ElTabs>
    <ElAlert
      class="mb-4"
      type="info"
      show-icon
      :closable="false"
      :title="
        section === 'detail'
          ? '办理详情可直接供流程引用，无需先挂菜单'
          : section === 'template'
            ? '公共列方案供多个业务列表复用'
            : '列表页面通过菜单访问，原有业务场景继续兼容'
      "
      :description="
        section === 'detail'
          ? '只需配置资料模块、表单模板和布局。流程发布时冻结配置；后续修改需发布新流程版本，已发布版本保持原快照。'
          : section === 'template'
            ? '修改会影响实时继承该方案的列表和流程草稿。请在使用位置中检查引用范围。'
            : '保存后重新加载业务页面读取配置。菜单引用只统计菜单，完整引用请查看使用位置；未挂菜单不代表未被流程使用。'
      "
    />
    <Grid
      :table-title="
        section === 'detail'
          ? '办理详情页面'
          : section === 'template'
            ? '公共列方案'
            : '列表页面'
      "
    >
      <template #toolbar-tools>
        <ElButton type="primary" @click="onCreate">
          <Plus class="mr-1 size-4" />
          {{
            section === 'detail'
              ? '新建办理详情'
              : section === 'template'
                ? '新建公共列方案'
                : '新建列表页面'
          }}
        </ElButton>
      </template>
    </Grid>
  </Page>
</template>
