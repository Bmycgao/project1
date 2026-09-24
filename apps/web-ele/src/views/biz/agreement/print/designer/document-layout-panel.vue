<script setup lang="ts">
import type { PrintElementRef } from '../template/print-element-meta';

import { computed } from 'vue';

import {
  ElButton,
  ElFormItem,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSwitch,
} from 'element-plus';

import { cloneJson } from '../../clone';
import {
  adjustDocumentElementSpacing,
  documentElementSpacing,
  documentRows,
  documentWidthLimits,
  MAX_DOCUMENT_SPACE_PT,
  moveDocumentElement,
  setDocumentElementWidth,
} from '../runtime/document-layout';

const props = defineProps<{
  selected: PrintElementRef;
  template: Record<string, any>;
}>();
const emit = defineEmits<{ change: [Record<string, any>] }>();
const layout = computed(() => props.selected.options.agreeDocument as any);
const spacing = computed(() =>
  documentElementSpacing(
    props.template,
    `${props.selected.panelIndex}:${props.selected.elementIndex}`,
  ),
);
const peers = computed<any[]>(() =>
  props.template.panels[props.selected.panelIndex].printElements.filter(
    (el: any) => el.options.agreeDocument.row === layout.value.row,
  ),
);
const alignment = computed(() =>
  Math.abs(layout.value.left - (100 - layout.value.width) / 2) < 1
    ? 'center'
    : layout.value.left > 1
      ? 'right'
      : 'left',
);
function update(field: string, value: unknown) {
  if (field === 'spaceBefore') {
    emit(
      'change',
      adjustDocumentElementSpacing(
        props.template,
        `${props.selected.panelIndex}:${props.selected.elementIndex}`,
        Number(value) - spacing.value,
      ),
    );
    return;
  }
  if (field === 'width') {
    emit(
      'change',
      setDocumentElementWidth(
        props.template,
        `${props.selected.panelIndex}:${props.selected.elementIndex}`,
        Number(value),
      ),
    );
    return;
  }
  const next = cloneJson(props.template);
  const elements = next.panels[props.selected.panelIndex].printElements;
  const element = elements[props.selected.elementIndex];
  const box = element.options.agreeDocument;
  const row: any[] = elements
    .filter((item: any) => item.options.agreeDocument.row === box.row)
    .toSorted(
      (a: any, b: any) =>
        a.options.agreeDocument.left - b.options.agreeDocument.left,
    );
  if (field === 'gap')
    row.forEach((item) => {
      item.options.agreeDocument.gap = Number(value) || 0;
    });
  else if (field === 'align')
    box.left =
      value === 'right'
        ? 100 - box.width
        : value === 'center'
          ? (100 - box.width) / 2
          : 0;
  else box[field] = value;
  emit('change', next);
}
function move(direction: -1 | 1) {
  const panel = props.template.panels[props.selected.panelIndex];
  const rows = documentRows(panel);
  const index = rows.findIndex(
    (row) => row[0].options.agreeDocument.row === layout.value.row,
  );
  const target = rows[index + direction]?.[0];
  if (!target) return;
  emit(
    'change',
    moveDocumentElement(
      props.template,
      `${props.selected.panelIndex}:${props.selected.elementIndex}`,
      `${props.selected.panelIndex}:${panel.printElements.indexOf(target)}`,
      direction === -1 ? 'before' : 'after',
    ),
  );
}
function separate() {
  const panel = props.template.panels[props.selected.panelIndex];
  const current = panel.printElements[props.selected.elementIndex];
  const other = peers.value.find((el) => el !== current);
  if (!other) return;
  emit(
    'change',
    moveDocumentElement(
      props.template,
      `${props.selected.panelIndex}:${props.selected.elementIndex}`,
      `${props.selected.panelIndex}:${panel.printElements.indexOf(other)}`,
      'after',
    ),
  );
}
</script>

<template>
  <p class="mb-3 text-xs text-gray-500">
    文档流：内容自动增高，后续内容顺延；放不下时自动续页。
  </p>
  <ElFormItem label="正文顺序">
    <ElButton size="small" @click="move(-1)">上移</ElButton><ElButton size="small" @click="move(1)">下移</ElButton><ElButton v-if="peers.length > 1" size="small" @click="separate">
      独占一行
    </ElButton>
  </ElFormItem>
  <ElFormItem label="上方间距（pt）">
    <ElInputNumber
      :model-value="spacing"
      :min="0"
      :max="Math.max(MAX_DOCUMENT_SPACE_PT, spacing)"
      @change="(value) => update('spaceBefore', value || 0)"
    />
    <p class="mt-1 w-full text-xs text-gray-500">
      仅移动当前元素；可向上收紧到 0。
    </p>
  </ElFormItem>
  <ElFormItem label="占正文宽度（%）">
    <ElInputNumber
      :model-value="Math.round(layout.width)"
      :min="documentWidthLimits(peers.length).min"
      :max="documentWidthLimits(peers.length).max"
      @change="(value) => update('width', value)"
    />
  </ElFormItem>
  <ElFormItem v-if="peers.length === 1" label="所在位置">
    <ElSelect
      :model-value="alignment"
      @change="(value) => update('align', value)"
    >
      <ElOption label="靠左" value="left" /><ElOption
        label="居中"
        value="center"
      /><ElOption label="靠右" value="right" />
    </ElSelect>
  </ElFormItem>
  <ElFormItem label="分页">
    <ElSwitch
      :model-value="!!layout.keepNext"
      active-text="尽量与下一段同页"
      @change="(value) => update('keepNext', value)"
    />
  </ElFormItem>
</template>
