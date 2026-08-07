<script lang="ts" setup>
/**
 * 通用动态列表页：同一套壳子，按 route.meta.schemaId 加载字段配置并渲染
 * 抵押信息录入：点击协议编号跳转详情页（三模块可分存 / 总提）
 */
import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { PageSchemaApi } from '#/api';

import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { ElAlert, ElEmpty, ElLink, ElMessage, ElTag } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getDynamicDataList, getPageSchema } from '#/api';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const schema = ref<PageSchemaApi.PageSchema | null>(null);
const loadError = ref('');
const ready = ref(false);

/** 从路由读取关联的页面配置 ID */
const schemaId = computed(
  () =>
    String(
      (route.meta as Record<string, any>)?.schemaId ||
        route.query.schemaId ||
        '',
    ),
);

/** 是否抵押信息录入页（协议编号跳转详情） */
const isMortgagePage = computed(
  () =>
    schemaId.value === 'PS1100' ||
    schema.value?.columns?.some((c) => c.field === 'agreementNo'),
);

/**
 * 点击协议编号进入抵押详情页
 * @param row 当前列表行
 */
function openMortgageDetail(row: Record<string, any>) {
  const no = String(row.agreementNo || '').trim();
  if (!no) {
    ElMessage.warning('协议编号为空');
    return;
  }
  router.push({
    name: 'BizMortgageDetail',
    params: { agreementNo: no },
    query: {
      id: row.id,
      compensatee: row.compensatee,
      houseAddress: row.houseAddress,
    },
  });
}

/**
 * 按配置生成搜索表单
 * @param queryFields 查询字段配置
 */
function buildFormSchema(
  queryFields: PageSchemaApi.QueryField[],
): VbenFormSchema[] {
  return (queryFields || []).map((item) => {
    if (item.component === 'Select') {
      return {
        component: 'Select',
        componentProps: {
          clearable: true,
          options: item.options || [],
        },
        fieldName: item.field,
        label: item.title,
      };
    }
    return {
      component: 'Input',
      fieldName: item.field,
      label: item.title,
    };
  });
}

/**
 * 按配置生成表格列
 * @param columns 列配置
 */
function buildColumns(columns: PageSchemaApi.Column[]): VxeTableGridColumns {
  return (columns || [])
    .filter((col) => col.visible)
    .map((col) => {
      const base: Record<string, any> = {
        field: col.field,
        title: col.title,
        minWidth: col.minWidth || 120,
      };
      if (col.width) base.width = col.width;

      if (col.field === 'agreementNo' && isMortgagePage.value) {
        base.slots = { default: 'agreementNoCell' };
      } else if (col.cellType === 'status') {
        base.cellRender = { name: 'CellTag' };
        base.width = col.width || 100;
      } else if (col.cellType === 'tag') {
        base.slots = { default: 'tagCell' };
      }
      return base;
    });
}

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: [],
    submitOnChange: true,
  },
  gridOptions: {
    columns: [],
    height: 'auto',
    keepSource: true,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) => {
          if (!schemaId.value) {
            return { items: [], total: 0 };
          }
          return await getDynamicDataList({
            page: page.currentPage,
            pageSize: page.pageSize,
            schemaId: schemaId.value,
            ...formValues,
          });
        },
      },
      autoLoad: true,
    },
    rowConfig: { keyField: 'id' },
    toolbarConfig: {
      custom: true,
      refresh: true,
      search: true,
      zoom: true,
    },
  } as VxeTableGridOptions,
});

/** 等 Grid 挂载后再查询 */
async function queryAfterGridMounted() {
  for (let i = 0; i < 20; i++) {
    if (typeof (gridApi.grid as any)?.commitProxy === 'function') {
      await gridApi.query();
      return;
    }
    await nextTick();
  }
}

/** 加载配置并刷新表格结构 */
async function loadSchemaAndGrid() {
  loadError.value = '';
  schema.value = null;
  ready.value = false;

  if (!schemaId.value) {
    loadError.value =
      '未绑定页面配置。请在菜单 meta.schemaId 填写配置 ID（如 PS1001），组件填写 /system/dynamic-list/index';
    return;
  }

  loading.value = true;
  try {
    const data = await getPageSchema(schemaId.value);
    schema.value = data;

    gridApi.setState({
      formOptions: {
        schema: buildFormSchema(data.queryFields),
        submitOnChange: true,
      },
    });
    gridApi.setGridOptions({
      columns: buildColumns(data.columns),
    });

    await nextTick();
    ready.value = true;
    await queryAfterGridMounted();
  } catch (error: any) {
    loadError.value =
      error?.response?.data?.message ||
      error?.message ||
      '加载页面配置失败';
    ElMessage.error(loadError.value);
  } finally {
    loading.value = false;
  }
}

watch(schemaId, () => loadSchemaAndGrid(), { immediate: true });
</script>

<template>
  <Page auto-content-height :title="schema?.title">
    <ElAlert
      v-if="loadError"
      class="mb-4"
      type="warning"
      :title="loadError"
      show-icon
      :closable="false"
    />
    <ElEmpty v-else-if="!schema && !loading" description="暂无配置" />
    <template v-else-if="schema">
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <span>配置化列表（改「页面配置」即可换字段，无需新写 Vue）</span>
        <ElTag size="small" type="info">{{ schemaId }}</ElTag>
        <span v-if="schema.remark">· {{ schema.remark }}</span>
      </div>
      <Grid v-if="ready" :table-title="schema.title">
        <template #agreementNoCell="{ row }">
          <ElLink
            type="primary"
            :underline="'never'"
            @click="openMortgageDetail(row)"
          >
            {{ row.agreementNo }}
          </ElLink>
        </template>
        <template #tagCell="{ row, column }">
          <ElTag size="small">{{ row[column.field] }}</ElTag>
        </template>
      </Grid>
    </template>
  </Page>
</template>
