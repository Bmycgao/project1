<script lang="ts" setup>
/**
 * 选择数据源字段：绑的是坑位（field 名），打印时才填入列表选中的那条协议
 */
import type {
  PrintFieldPickMode,
  PrintFieldTreeNode,
} from './print-field-tree';

import { computed, nextTick, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElTree,
} from 'element-plus';

import {
  buildPrintFieldTree,
  isPrintFieldPickAllowed,
} from './print-field-tree';

const props = defineProps<{
  /** text=主表字段；table=整表；column=表列 */
  mode: PrintFieldPickMode;
  modelValue: boolean;
  /** 列模式时限定某张表 */
  tableField?: string;
}>();

const emit = defineEmits<{
  pick: [PrintFieldTreeNode];
  'update:modelValue': [boolean];
}>();

const keyword = ref('');
const treeRef = ref<null | { filter: (q: string) => void }>(null);

const treeData = computed(() =>
  buildPrintFieldTree(
    props.mode,
    props.mode === 'column' ? props.tableField : undefined,
  ),
);

const title = computed(() => {
  if (props.mode === 'table') return '选择表格数据源';
  if (props.mode === 'column') return '选择列字段';
  return '选择数据源字段';
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      keyword.value = '';
      void nextTick(() => treeRef.value?.filter(''));
    }
  },
);

watch(keyword, (q) => {
  treeRef.value?.filter(q);
});

/**
 * 树搜索：中文名或 field 包含关键字
 * @param value 关键字
 * @param data 节点
 */
function filterNode(value: string, data: Record<string, any>) {
  if (!value) return true;
  const kw = value.toLowerCase();
  return (
    String(data.label || '')
      .toLowerCase()
      .includes(kw) ||
    String(data.field || '')
      .toLowerCase()
      .includes(kw)
  );
}

function close() {
  emit('update:modelValue', false);
}

/**
 * 点树节点：分组忽略；派生量只复制字段名；模式不符则提示
 * @param node 节点
 */
function onNodeClick(node: PrintFieldTreeNode) {
  if (node.kind === 'group') return;
  if (node.kind === 'derived') {
    const field = String(node.field || '');
    if (field) {
      void navigator.clipboard?.writeText(field).catch(() => undefined);
    }
    ElMessage.info(
      `「${node.text}」(${field}) 用于条件显隐，已复制字段名，请不要绑到纸面文本`,
    );
    close();
    return;
  }
  if (!isPrintFieldPickAllowed(node, props.mode)) {
    if (props.mode === 'table') {
      ElMessage.info(
        '请点「房屋明细 / 补偿安置 / 奖励补贴」这一层，不要点下面的列',
      );
    } else if (props.mode === 'column') {
      ElMessage.info('请点表格下面的列名（如户名、建筑面积）');
    } else {
      ElMessage.info('文本请点主表字段');
    }
    return;
  }
  emit('pick', node);
  close();
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    width="440px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert
      class="mb-3"
      type="info"
      :closable="false"
      title="这里选的是字段名（纸上的坑）。真正打印时，会填入列表里勾中的那条协议详情。"
    />
    <ElInput
      v-model="keyword"
      size="small"
      clearable
      placeholder="搜索中文名或 field"
      class="mb-2"
    />
    <ElTree
      ref="treeRef"
      class="print-field-picker__tree"
      :data="treeData"
      node-key="id"
      default-expand-all
      highlight-current
      :expand-on-click-node="false"
      :filter-node-method="filterNode"
      :props="{ label: 'label', children: 'children' }"
      @node-click="onNodeClick"
    />
    <template #footer>
      <ElButton @click="close">取消</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.print-field-picker__tree {
  max-height: 420px;
  padding: 4px 0;
  overflow: auto;
  font-size: 13px;
}

.print-field-picker__tree :deep(.el-tree-node__label) {
  font-size: 13px;
}
</style>
