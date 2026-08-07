<script lang="ts" setup>
/**
 * 页面字段配置表单：
 * - entity / template：编辑列与查询条件
 * - scene：引用列模板 + 只能勾选动作库中已实现的动作（不可自由发明按钮）
 */
import type { PageSchemaApi } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';

import {
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import { createPageSchema, getPageSchema, updatePageSchema } from '#/api';

import {
  groupAgreeActions,
  resolveToolbarButtons,
} from '../../../biz/agreement/actions';

import {
  getDefaultColumns,
  getDefaultQueryFields,
  useFormSchema,
} from '../data';

const emits = defineEmits<{ success: [] }>();

const formData = ref<PageSchemaApi.PageSchema>();
const id = ref<string>();
const columns = ref<PageSchemaApi.Column[]>([]);
const queryFields = ref<PageSchemaApi.QueryField[]>([]);
/** 场景勾选的动作码（仅动作库内） */
const selectedActionCodes = ref<string[]>([]);
/** 场景数据范围：允许的状态 */
const selectedStatusIn = ref<string[]>([]);
/** 当前配置类型（与表单 schemaKind 同步） */
const schemaKind = ref<'entity' | 'scene' | 'template'>('entity');

/** 常见状态（场景数据范围勾选） */
const STATUS_OPTIONS = [
  '告知单',
  '待复核',
  '草稿',
  '组长已复核',
  '项目经理已审核',
  '签约已确认',
];

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  /**
   * 同步 schemaKind，切换实体/场景编辑区
   * @param values 表单当前值
   */
  handleValuesChange(values) {
    const kind = (values?.schemaKind || 'entity') as typeof schemaKind.value;
    schemaKind.value = kind;
  },
});

const cellTypeOptions = [
  { label: '文本', value: 'text' },
  { label: '状态', value: 'status' },
  { label: '标签', value: 'tag' },
];

const queryCompOptions = [
  { label: '输入框', value: 'Input' },
  { label: '下拉框', value: 'Select' },
];

/** 动作库分组（配置页勾选） */
const actionGroups = groupAgreeActions();

/** 是否场景类型：只勾选动作，不编列 */
const isScene = computed(() => schemaKind.value === 'scene');

/** 安全拷贝列配置（避免非数组脏数据） */
function cloneColumns(list: unknown): PageSchemaApi.Column[] {
  return Array.isArray(list)
    ? structuredClone(list)
    : getDefaultColumns();
}

/** 安全拷贝查询配置 */
function cloneQueryFields(list: unknown): PageSchemaApi.QueryField[] {
  return Array.isArray(list)
    ? structuredClone(list)
    : getDefaultQueryFields();
}

/**
 * 从详情 buttons 提取已注册动作码
 * @param buttons 接口返回的按钮
 */
function codesFromButtons(
  buttons: PageSchemaApi.PageSchema['buttons'],
): string[] {
  const codes = (buttons || []).map((b) => b.code);
  // 只保留动作库中存在的，防止脏数据带入
  return resolveToolbarButtons(codes).map((b) => b.code);
}

/** 新增一列表字段 */
function addColumn() {
  columns.value.push({
    field: `field${columns.value.length + 1}`,
    title: '新字段',
    visible: true,
    width: 120,
    cellType: 'text',
  });
}

/** 删除列 */
function removeColumn(index: number) {
  columns.value.splice(index, 1);
}

/** 新增查询项 */
function addQueryField() {
  queryFields.value.push({
    field: `q${queryFields.value.length + 1}`,
    title: '查询项',
    component: 'Input',
  });
}

/** 删除查询项 */
function removeQueryField(index: number) {
  queryFields.value.splice(index, 1);
}

/**
 * 用详情接口回填（避免列表行被 VXE 改写 columns）
 * @param detail 页面配置详情
 */
async function fillForm(detail: PageSchemaApi.PageSchema) {
  formData.value = detail;
  id.value = detail.id;
  schemaKind.value = detail.schemaKind || 'entity';
  await formApi.setValues({
    name: detail.name,
    title: detail.title,
    status: detail.status,
    remark: detail.remark,
    schemaKind: detail.schemaKind || 'entity',
    scene: detail.scene || '',
    columnTemplateId: detail.columnTemplateId || '',
  });
  columns.value = cloneColumns(detail.columns);
  queryFields.value = cloneQueryFields(detail.queryFields);
  selectedActionCodes.value = codesFromButtons(detail.buttons);
  selectedStatusIn.value = Array.isArray(detail.statusIn)
    ? [...detail.statusIn]
    : [];
}

const [Drawer, drawerApi] = useVbenDrawer({
  class: 'w-[780px]',
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = await formApi.getValues();
    const kind = (values.schemaKind || 'entity') as typeof schemaKind.value;

    if (kind === 'scene') {
      if (!values.scene) {
        ElMessage.warning('场景类型必须填写场景码');
        return;
      }
      if (!values.columnTemplateId) {
        ElMessage.warning('场景类型必须填写列模板 ID');
        return;
      }
      if (!selectedActionCodes.value.length) {
        ElMessage.warning('请至少勾选一个已实现动作');
        return;
      }
    } else if (!columns.value.some((c) => c.visible)) {
      ElMessage.warning('至少保留一列可见字段');
      return;
    }

    /** 场景：按钮只存动作库解析结果；列交给模板 */
    const payload =
      kind === 'scene'
        ? ({
            ...values,
            schemaKind: 'scene',
            columns: [],
            queryFields: queryFields.value,
            buttons: resolveToolbarButtons(selectedActionCodes.value),
            statusIn: selectedStatusIn.value,
          } as any)
        : ({
            ...values,
            schemaKind: kind,
            columns: columns.value,
            queryFields: queryFields.value,
            buttons: undefined,
            scene: undefined,
            columnTemplateId: undefined,
            statusIn: undefined,
          } as any);

    drawerApi.lock();
    try {
      if (id.value) {
        await updatePageSchema(id.value, payload);
      } else {
        await createPageSchema(payload);
      }
      emits('success');
      drawerApi.close();
    } catch {
      drawerApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    const data = drawerApi.getData<PageSchemaApi.PageSchema>();
    await formApi.reset();
    columns.value = [];
    queryFields.value = [];
    selectedActionCodes.value = [];
    selectedStatusIn.value = [];
    schemaKind.value = 'entity';
    formData.value = data;
    id.value = data?.id;
    await nextTick();

    if (data?.id) {
      try {
        // 始终拉详情，保证 columns / queryFields 完整
        const detail = await getPageSchema(data.id);
        await fillForm(detail);
      } catch {
        // 接口失败时尽量用行数据兜底
        await fillForm({
          ...data,
          columns: Array.isArray(data.columns) ? data.columns : [],
          queryFields: Array.isArray(data.queryFields) ? data.queryFields : [],
        });
        ElMessage.warning('详情加载失败，已尝试使用列表行数据');
      }
    } else {
      id.value = undefined;
      columns.value = getDefaultColumns();
      queryFields.value = getDefaultQueryFields();
      await formApi.setValues({ schemaKind: 'entity', status: 1 });
    }
  },
});

const title = computed(() => {
  if (!formData.value?.id) return '新建页面配置';
  return isScene.value ? '配置场景动作' : '配置列表字段';
});
</script>

<template>
  <Drawer :title="title">
    <Form />

    <!-- 场景：只能勾选动作库 -->
    <div v-if="isScene" class="mt-4">
      <div class="mb-2 font-medium">数据范围（状态）</div>
      <p class="mb-2 text-xs text-gray-500">
        列表接口按场景码过滤；此处勾选的状态会写入配置，后端优先按此过滤。不勾选则未知场景看全量。
      </p>
      <ElCheckboxGroup v-model="selectedStatusIn" class="mb-4">
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <ElCheckbox
            v-for="s in STATUS_OPTIONS"
            :key="s"
            :value="s"
          >
            {{ s }}
          </ElCheckbox>
        </div>
      </ElCheckboxGroup>

      <div class="mb-2 font-medium">工具栏动作（仅可勾选已实现）</div>
      <p class="mb-3 text-xs text-gray-500">
        新按钮需开发先在
        <code class="rounded bg-gray-100 px-1">actions.ts</code>
        注册 handler，此处才能勾选；不可自由发明动作码。
      </p>
      <div
        v-for="group in actionGroups"
        :key="group.key"
        class="mb-4 rounded-lg border border-gray-200/80 p-3"
      >
        <div class="mb-2 text-sm font-medium text-gray-700">
          {{ group.title }}
        </div>
        <ElCheckboxGroup v-model="selectedActionCodes">
          <div class="flex flex-wrap gap-x-4 gap-y-2">
            <ElCheckbox
              v-for="act in group.items"
              :key="act.code"
              :value="act.code"
            >
              <span>{{ act.label }}</span>
              <span class="ml-1 text-xs text-gray-400">({{ act.code }})</span>
            </ElCheckbox>
          </div>
        </ElCheckboxGroup>
      </div>

      <div class="mb-2 mt-2 flex items-center justify-between">
        <div class="font-medium">查询条件（可选）</div>
        <ElButton size="small" type="primary" @click="addQueryField">
          添加条件
        </ElButton>
      </div>
      <ElTable :data="queryFields" border size="small">
        <ElTableColumn label="字段名" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.field" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="标题" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.title" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="控件" width="120">
          <template #default="{ row }">
            <ElSelect v-model="row.component" size="small" class="w-full">
              <ElOption
                v-for="opt in queryCompOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" align="center">
          <template #default="{ $index }">
            <ElButton
              link
              type="danger"
              size="small"
              @click="removeQueryField($index)"
            >
              删
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <!-- 实体 / 列模板：编辑列 -->
    <template v-else>
      <div class="mb-2 mt-4 flex items-center justify-between">
        <div class="font-medium">表格字段</div>
        <ElButton size="small" type="primary" @click="addColumn">添加列</ElButton>
      </div>
      <ElTable :data="columns" border size="small" class="mb-4">
        <ElTableColumn label="字段名" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.field" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="列标题" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.title" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="类型" width="110">
          <template #default="{ row }">
            <ElSelect v-model="row.cellType" size="small" class="w-full">
              <ElOption
                v-for="opt in cellTypeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
          </template>
        </ElTableColumn>
        <ElTableColumn label="宽度" width="100">
          <template #default="{ row }">
            <ElInputNumber
              v-model="row.width"
              size="small"
              :min="60"
              :max="400"
              controls-position="right"
              class="w-full"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn label="显示" width="70" align="center">
          <template #default="{ row }">
            <ElSwitch v-model="row.visible" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" align="center">
          <template #default="{ $index }">
            <ElButton
              link
              type="danger"
              size="small"
              @click="removeColumn($index)"
            >
              删
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="mb-2 flex items-center justify-between">
        <div class="font-medium">查询条件</div>
        <ElButton size="small" type="primary" @click="addQueryField">
          添加条件
        </ElButton>
      </div>
      <ElTable :data="queryFields" border size="small">
        <ElTableColumn label="字段名" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.field" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="标题" min-width="110">
          <template #default="{ row }">
            <ElInput v-model="row.title" size="small" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="控件" width="120">
          <template #default="{ row }">
            <ElSelect v-model="row.component" size="small" class="w-full">
              <ElOption
                v-for="opt in queryCompOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="70" align="center">
          <template #default="{ $index }">
            <ElButton
              link
              type="danger"
              size="small"
              @click="removeQueryField($index)"
            >
              删
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </template>
  </Drawer>
</template>
