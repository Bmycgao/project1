<script setup lang="ts">
import type {
  TableBorderOverrides,
  TableBorderSide,
} from '../runtime/print-table-border';

import { computed } from 'vue';

import {
  ElCheckbox,
  ElForm,
  ElFormItem,
  ElRadioButton,
  ElRadioGroup,
} from 'element-plus';

import {
  normalizeTableBorders,
  resolveTableBorderControls,
} from '../runtime/print-table-border';

const props = defineProps<{
  hasFooter: boolean;
  isFormGrid: boolean;
  options: Record<string, any>;
}>();
const emit = defineEmits<{ patch: [Record<string, unknown>] }>();
const state = computed(() =>
  resolveTableBorderControls(props.options, {
    header: !props.isFormGrid,
    footer: !props.isFormGrid && props.hasFooter,
  }),
);
const sides: Array<{ key: TableBorderSide; label: string }> = [
  { key: 'top', label: '上' },
  { key: 'bottom', label: '下' },
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
];
const controls = computed(() => [
  ...(props.isFormGrid
    ? []
    : [
        { key: 'headerInner' as const, label: '表头内部格子线' },
        { key: 'headerDivider' as const, label: '表头与明细分隔线' },
      ]),
  {
    key: 'bodyInner' as const,
    label: props.isFormGrid ? '内部格子线' : '明细内部格子线',
  },
  ...(!props.isFormGrid && props.hasFooter
    ? [
        { key: 'footerInner' as const, label: '合计与备注内部格子线' },
        { key: 'footerDivider' as const, label: '合计与备注前分隔线' },
      ]
    : []),
]);
function setSide(side: TableBorderSide, value: boolean) {
  const current = normalizeTableBorders(props.options.agreeTableBorders);
  emit('patch', {
    agreeTableBorders: {
      ...current,
      outer: { ...current.outer, [side]: value },
    },
  });
}
function setInner(
  key: Exclude<keyof TableBorderOverrides, 'outer'>,
  value: boolean,
) {
  emit('patch', {
    agreeTableBorders: {
      ...normalizeTableBorders(props.options.agreeTableBorders),
      [key]: value,
    },
  });
}
</script>

<template>
  <ElForm class="table-border-panel" label-position="top" size="small">
    <ElFormItem label="表格外框">
      <div class="table-border-panel__sides" role="group" aria-label="表格外框">
        <ElCheckbox
          v-for="side in sides"
          :key="side.key"
          :model-value="state.outer[side.key]"
          :indeterminate="
            (side.key === 'left' || side.key === 'right') &&
            state.mixedOuter[side.key]
          "
          :aria-label="`表格外框${side.label}边`"
          @change="(value) => setSide(side.key, Boolean(value))"
        >
          {{ side.label }}
        </ElCheckbox>
      </div>
    </ElFormItem>
    <p class="table-border-panel__hint">
      “下”控制表格最底部横线，无需添加合计或备注行。跨页时分别控制每页表格的外框。
    </p>
    <p
      v-if="state.mixedOuter.left || state.mixedOuter.right"
      class="table-border-panel__hint"
    >
      半选表示旧模板各区域的外框不同；点击对应边后统一设置整张表的这一边，其他设置保留。
    </p>
    <div
      v-for="control in controls"
      :key="control.key"
      class="table-border-panel__row"
    >
      <span>{{ control.label }}</span>
      <ElRadioGroup
        :model-value="state[control.key]"
        :aria-label="control.label"
        size="small"
        @change="(value) => setInner(control.key, Boolean(value))"
      >
        <ElRadioButton :value="true">显示</ElRadioButton>
        <ElRadioButton :value="false">隐藏</ElRadioButton>
      </ElRadioGroup>
    </div>
    <p v-if="!isFormGrid && !hasFooter" class="table-border-panel__hint">
      合计与备注行可在“编辑明细表 → 合计与备注”中添加；添加后显示对应边框设置。
    </p>
  </ElForm>
</template>

<style scoped>
.table-border-panel__sides {
  display: flex;
  gap: 20px;
}

.table-border-panel__sides :deep(.el-checkbox) {
  margin-right: 0;
}

.table-border-panel__row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  font-size: 12px;
}

.table-border-panel__hint {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
