<script lang="ts" setup>
/**
 * 协议打印预览：按 templateCode 拉模板，可用协议详情或粘贴的数据源 JSON
 */
import type { AgreeFieldRule } from '../access/field-access';
import type { AgreementDetail } from '../types';
import type { AgreePrintData } from './types';

import { computed, nextTick, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import { ElButton, ElDialog, ElMessage } from 'element-plus';

import { cloneJson as cloneTemplate } from '../clone';
import { buildAgreePrintData } from './data/build-print-data';
import {
  maskAgreePrintData,
  mergePrintFieldRules,
} from './data/print-sensitive';
import { buildDesignerSamplePrintData } from './data/sample-print-data';
import { createDocumentPrint } from './engine/document-print';
import PrintDataJsonDialog from './print-data-json-dialog.vue';
import { toDocumentTemplate } from './runtime/document-layout';
import { preparePrintTemplate } from './runtime/prepare-template';
import {
  applyPrintPageSizeFromTemplate,
  fitPrintPreviewHost,
  normalizePrintPreviewPages,
} from './runtime/print-page-css';
import {
  describePrintPaper,
  previewDialogWidthCss,
  readTemplatePaperSpec,
} from './runtime/print-paper';
import { loadPrintTemplateByCode } from './template/template-store';

const props = withDefaults(
  defineProps<{
    /** 当前协议详情 */
    detail: AgreementDetail | null;
    /** 页面字段权限（与列表/详情同源）；不传则用默认规则 */
    fieldRules?: AgreeFieldRule[];
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
    fieldRules: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [boolean];
}>();

const accessStore = useAccessStore();

const loading = ref(false);
const pdfExporting = ref(false);
const previewRef = ref<HTMLElement | null>(null);
const printData = ref<AgreePrintData | null>(null);
/** 粘贴的数据源，优先于当前协议详情 */
const dataOverride = ref<AgreePrintData | null>(null);
const dataJsonOpen = ref(false);
/** 当前预览纸张说明 */
const paperHint = ref('');
const dialogWidth = ref('920px');
/** hiprint 模板实例，供打印复用 */
let templateInst: any = null;
/** 最近一次准备好的模板（取纸张） */
let lastPrepared: null | Record<string, any> = null;

/** 弹窗里编辑器用的底稿：覆盖 > 已渲染 > 当前协议 > 样例 */
const dataJsonInitial = computed(() => {
  if (dataOverride.value) return dataOverride.value;
  if (printData.value) return printData.value;
  if (props.detail) return buildAgreePrintData(props.detail);
  return buildDesignerSamplePrintData();
});

/** 关闭弹窗 */
function close() {
  emit('update:modelValue', false);
}

/**
 * 本次预览/打印实际用的数据
 */
function resolvePrintData(): AgreePrintData | null {
  if (dataOverride.value) return dataOverride.value;
  if (props.detail) return buildAgreePrintData(props.detail);
  return null;
}

/** 创建带条件/合并能力的模板实例；正式打印先按字段权限打码 */
async function createTemplate(data: AgreePrintData) {
  const raw = await loadPrintTemplateByCode(props.templateCode);
  const masked = maskAgreePrintData(
    data,
    mergePrintFieldRules(props.fieldRules),
    accessStore.accessCodes,
  );
  const { template: prepared, printData: enriched } = preparePrintTemplate(
    toDocumentTemplate(raw),
    masked,
  );
  // hiprint 初始化时会原地整理表格结构。先保留一份未编译的模板，
  // PDF 导出再基于它创建实例，避免多层表头被二次处理后 rowspan 错位。
  lastPrepared = cloneTemplate(prepared);
  const inst = await createDocumentPrint(prepared, enriched);
  applyPrintPageSizeFromTemplate(prepared);
  paperHint.value = describePrintPaper(readTemplatePaperSpec(prepared));
  dialogWidth.value = previewDialogWidthCss(
    Number(prepared?.panels?.[0]?.width) || 210,
  );
  (inst as any).__agreePrintData = enriched;
  return inst;
}

/**
 * 渲染预览 HTML 到容器
 */
async function renderPreview() {
  const data = resolvePrintData();
  if (!data) {
    ElMessage.warning('暂无协议数据，可点「使用数据 JSON」粘贴');
    return;
  }
  loading.value = true;
  templateInst = null;
  try {
    printData.value = data;
    templateInst = await createTemplate(printData.value);
    await nextTick();
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
    await nextTick();
    const w = Number(lastPrepared?.panels?.[0]?.width) || 210;
    const h = Number(lastPrepared?.panels?.[0]?.height) || 297;
    normalizePrintPreviewPages(el, h);
    fitPrintPreviewHost(el, w);
  } catch (error: any) {
    console.error(error);
    ElMessage.error(error?.message || '打印预览失败');
  } finally {
    loading.value = false;
  }
}

/** 浏览器打印 */
async function onPrint() {
  const data = dataOverride.value || printData.value || resolvePrintData();
  if (!data) {
    ElMessage.warning('暂无协议数据，可点「使用数据 JSON」粘贴');
    return;
  }
  try {
    loading.value = true;
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

/**
 * 把 hiprint 的 jQuery Deferred 转成原生 Promise，并自行下载 Blob。
 * 使用 isDownload:false 才能可靠获知导出完成或失败。
 */
function createPdfBlob(inst: any, data: AgreePrintData, filename: string) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      const task = inst.toPdf(data, filename, {
        // hiprint 默认的 canvas DOM 解析会把 thead 的 rowspan 当成普通单元格，
        // 造成 PDF 中「序号 / 备注」被拆到第二行。ForeignObject 交给浏览器
        // 自身排版后再栅格化，与 getHtml 预览的表格布局保持一致。
        foreignObjectRendering: true,
        isDownload: false,
        scale: 2,
        type: 'blob',
        useCORS: true,
      });
      if (!task || typeof task.then !== 'function') {
        reject(new TypeError('当前打印引擎不支持 PDF 导出'));
        return;
      }
      task.then(
        (blob: unknown) => {
          if (blob instanceof Blob) resolve(blob);
          else reject(new TypeError('打印引擎未返回有效 PDF 文件'));
        },
        (error: unknown) => reject(error),
      );
    } catch (error) {
      reject(error);
    }
  });
}

function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 去掉 Windows 非法文件名字符和控制字符，避免导出 PDF 失败。 */
function safePdfFilename(data: AgreePrintData, template: Record<string, any>) {
  const spec = readTemplatePaperSpec(template);
  const prefix = [
    ...String(data.agreementNo || props.templateCode || '协议附件').trim(),
  ]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 32 || String.raw`<>:"/\|?*`.includes(ch) ? '-' : ch;
    })
    .join('')
    .slice(0, 80);
  const size = spec.sizeId === 'custom' ? '自定义' : spec.sizeId;
  return `${prefix || '协议附件'}-${size}-${spec.widthMm}x${spec.heightMm}mm.pdf`;
}

/** 导出与当前预览完全相同的数据和模板，并强制按实际毫米宽高创建 PDF。 */
async function onExportPdf() {
  const data = dataOverride.value || printData.value || resolvePrintData();
  if (!data) {
    ElMessage.warning('暂无协议数据，可点「使用数据 JSON」粘贴');
    return;
  }
  pdfExporting.value = true;
  try {
    if (!templateInst || !lastPrepared) {
      templateInst = await createTemplate(data);
    }
    if (!lastPrepared) throw new Error('打印模板尚未准备完成');

    const exactPaperTemplate = cloneTemplate(lastPrepared);
    for (const panel of exactPaperTemplate.panels || []) {
      /** 遗留 paperType 会让 jsPDF 忽略自定义 width/height，必须以毫米尺寸为准。 */
      delete panel.paperType;
    }
    const renderData = (templateInst as any).__agreePrintData || data;
    const pdfTemplate = await createDocumentPrint(
      exactPaperTemplate,
      renderData,
    );
    const filename = safePdfFilename(data, exactPaperTemplate);
    const blob = await createPdfBlob(pdfTemplate, renderData, filename);
    downloadPdfBlob(blob, filename);
    ElMessage.success(
      `已导出 ${describePrintPaper(readTemplatePaperSpec(exactPaperTemplate))} PDF`,
    );
  } catch (error: any) {
    console.error(error);
    ElMessage.error(error?.message || 'PDF 导出失败');
  } finally {
    pdfExporting.value = false;
  }
}

/**
 * 用粘贴 JSON 覆盖当前协议数据并重渲染
 * @param data 解析后的 printData
 */
function onDataJsonApply(data: AgreePrintData) {
  dataOverride.value = data;
  void renderPreview();
  ElMessage.success('已按数据源 JSON 刷新预览');
}

watch(
  () => [props.modelValue, props.detail, props.templateCode] as const,
  ([open]) => {
    if (open) {
      void renderPreview();
    } else {
      templateInst = null;
      dataOverride.value = null;
      printData.value = null;
      lastPrepared = null;
      if (previewRef.value) {
        previewRef.value.innerHTML = '';
        previewRef.value.style.zoom = '1';
      }
    }
  },
);
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    :width="dialogWidth"
    top="4vh"
    destroy-on-close
    append-to-body
    class="agree-print-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="agree-print-preview">
      <div class="mb-2 text-xs text-gray-500">
        模板：{{ templateCode }}
        <span v-if="paperHint"> · {{ paperHint }}</span>
        <span> · 灰色间隔为实际分页边界</span>
        <span> · 导出文件名会标注纸型及毫米尺寸</span>
        <span v-if="dataOverride" class="text-amber-600">
          （当前使用粘贴的数据源 JSON）
        </span>
      </div>
      <div ref="previewRef" class="agree-print-preview__body"></div>
    </div>
    <template #footer>
      <ElButton @click="dataJsonOpen = true">使用数据 JSON</ElButton>
      <ElButton @click="close">关闭</ElButton>
      <ElButton
        :loading="pdfExporting"
        :disabled="loading"
        @click="onExportPdf"
      >
        导出 PDF
      </ElButton>
      <ElButton type="primary" :loading="loading" @click="onPrint">
        打印
      </ElButton>
    </template>
  </ElDialog>
  <PrintDataJsonDialog
    v-model="dataJsonOpen"
    :initial-data="dataJsonInitial"
    @apply="onDataJsonApply"
  />
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
  gap: 0;
  align-items: center;
}

.agree-print-preview__body :deep(.hiprint-printPaper) {
  flex: 0 0 auto;
  outline: 1px solid #d7dce3;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  background: #fff;
  box-shadow: 0 1px 6px rgb(0 0 0 / 12%);
}

/*
 * hiprint 的多 panel 和表格自动续页都会生成真实纸张节点；只给相邻页加
 * 预览间隔，不改变任何纸内坐标，因此与系统打印使用完全相同的分页结果。
 */
.agree-print-preview__body :deep(.hiprint-printPanel + .hiprint-printPanel),
.agree-print-preview__body :deep(.hiprint-printPaper + .hiprint-printPaper) {
  margin-top: 14px !important;
}
</style>
