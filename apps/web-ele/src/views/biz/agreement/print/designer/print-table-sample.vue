<script setup lang="ts">
import type { AgreePrintData } from '../types';

import { computed, ref, watchEffect } from 'vue';

import { renderDocumentTable } from '../runtime/document-renderer';
import { preparePrintTemplate } from '../runtime/prepare-template';

const props = defineProps<{
  options: Record<string, any>;
  sampleData: Record<string, unknown>;
}>();
const previewHost = ref<HTMLElement>();
const prepared = computed(() =>
  preparePrintTemplate(
    {
      agreeLayout: 'document-flow',
      panels: [
        {
          width: 210,
          height: 297,
          printElements: [
            {
              printElementType: { type: 'table' },
              options: {
                ...props.options,
                agreeDocument: { row: 0, left: 0, width: 100, gap: 0 },
              },
            },
          ],
        },
      ],
    },
    props.sampleData as unknown as AgreePrintData,
  ),
);
// 样例与画布/打印共用表格渲染，避免边框、颜色、合并样式不一致。
watchEffect(
  () => {
    const host = previewHost.value;
    if (!host) return;
    const element = prepared.value.template.panels[0]?.printElements?.[0];
    host.replaceChildren();
    if (element && !element.options.__documentHidden) {
      const table = renderDocumentTable(
        element.options,
        prepared.value.printData,
        12,
      );
      table.setAttribute('aria-label', '表格样例预览');
      host.append(table);
    } else {
      host.textContent = '当前样例不显示此表格，请检查显隐条件或空数据设置。';
    }
  },
  { flush: 'post' },
);
</script>

<template>
  <details class="table-sample">
    <summary>样例预览 · 最多显示 12 行，完整分页请使用快速预览</summary>
    <div ref="previewHost" class="table-sample-scroll"></div>
  </details>
</template>

<style scoped>
.table-sample {
  padding: 10px;
  margin-bottom: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

summary {
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
}

.table-sample-scroll {
  max-height: 220px;
  margin-top: 8px;
  overflow: auto;
  background: #fff;
}

.table-sample-scroll :deep(td) {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
