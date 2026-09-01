<script lang="ts" setup>
/**
 * 协议打印预览：按 templateCode 拉模板，条件裁剪 + 房屋户名合并
 */
import type { AgreementDetail } from '../types';
import type { AgreePrintData } from './types';

import { nextTick, ref, watch } from 'vue';

import { ElButton, ElDialog, ElMessage } from 'element-plus';

import { buildAgreePrintData } from './build-print-data';
import { ensureHiprint } from './ensure-hiprint';
import { preparePrintTemplate } from './prepare-template';
import { loadPrintTemplateByCode } from './template-store';

const props = withDefaults(
  defineProps<{
    /** 当前协议详情 */
    detail: AgreementDetail | null;
    /** 是否显示对话框 */
    modelValue: boolean;
    /** 打印模板编码 */
    templateCode?: string;
    /** 弹窗标题 */
    title?: string;
  }>(),
  {
    templateCode: 'PrintAgreement',
    title: '打印预览',
  },
);

const emit = defineEmits<{
  'update:modelValue': [boolean];
}>();

const loading = ref(false);
const previewRef = ref<HTMLElement | null>(null);
const printData = ref<AgreePrintData | null>(null);
/** hiprint 模板实例，供打印复用 */
let templateInst: any = null;

/** 关闭弹窗 */
function close() {
  emit('update:modelValue', false);
}

/** 创建带条件/合并能力的模板实例 */
async function createTemplate(data: AgreePrintData) {
  const { PrintTemplate } = await ensureHiprint();
  const raw = await loadPrintTemplateByCode(props.templateCode);
  const { template: prepared, printData: enriched } = preparePrintTemplate(
    raw,
    data,
  );
  const inst = new PrintTemplate({ template: prepared });
  (inst as any).__agreePrintData = enriched;
  return inst;
}

/**
 * 渲染预览 HTML 到容器
 */
async function renderPreview() {
  if (!props.detail) {
    ElMessage.warning('暂无协议数据');
    return;
  }
  loading.value = true;
  templateInst = null;
  try {
    printData.value = buildAgreePrintData(props.detail);
    templateInst = await createTemplate(printData.value);
    await nextTick();
    const el = previewRef.value;
    if (!el) return;
    el.innerHTML = '';
    const renderData = templateInst.__agreePrintData || printData.value;
    const $html = templateInst.getHtml(renderData);
    if ($html && typeof $html.appendTo === 'function') {
      $html.appendTo(el);
    } else if ($html) {
      el.append(
        $html[0] ||
          (typeof $html === 'string'
            ? document.createRange().createContextualFragment($html)
            : $html),
      );
    }
  } catch (error: any) {
    console.error(error);
    ElMessage.error(error?.message || '打印预览失败');
  } finally {
    loading.value = false;
  }
}

/** 浏览器打印 */
async function onPrint() {
  if (!props.detail) return;
  try {
    loading.value = true;
    const data = printData.value || buildAgreePrintData(props.detail);
    if (!templateInst) {
      templateInst = await createTemplate(data);
    }
    const renderData = (templateInst as any).__agreePrintData || data;
    templateInst.print(
      renderData,
      {},
      {
        callback: () => {
          ElMessage.success('已打开打印窗口');
        },
      },
    );
  } catch (error: any) {
    ElMessage.error(error?.message || '打印失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.modelValue, props.detail, props.templateCode] as const,
  ([open]) => {
    if (open) {
      void renderPreview();
    } else {
      templateInst = null;
      if (previewRef.value) previewRef.value.innerHTML = '';
    }
  },
);
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    width="920px"
    top="4vh"
    destroy-on-close
    append-to-body
    class="agree-print-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="agree-print-preview">
      <div class="mb-2 text-xs text-gray-500">模板：{{ templateCode }}</div>
      <div ref="previewRef" class="agree-print-preview__body"></div>
    </div>
    <template #footer>
      <ElButton @click="close">关闭</ElButton>
      <ElButton type="primary" :loading="loading" @click="onPrint">
        打印
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.agree-print-preview {
  min-height: 360px;
  max-height: 72vh;
  padding: 12px;
  overflow: auto;
  background: #f0f2f5;
  border-radius: 6px;
}

.agree-print-preview__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.agree-print-preview__body :deep(.hiprint-printPaper) {
  background: #fff;
  box-shadow: 0 1px 6px rgb(0 0 0 / 12%);
}
</style>
