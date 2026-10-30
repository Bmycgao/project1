import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { requireDefined } from '../../../../../../shared/require-defined';
import Preview from './print-preview-dialog.vue';

const { createDocumentPrint, toPdf } = vi.hoisted(() => ({
  createDocumentPrint: vi.fn(),
  toPdf: vi.fn(),
}));

vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: [] }),
}));
vi.mock('./engine/document-print', () => ({ createDocumentPrint }));
vi.mock('./data/build-print-data', () => ({
  buildAgreePrintData: () => ({ agreementNo: 'PDF-TEST' }),
}));
vi.mock('./data/print-sensitive', () => ({
  maskAgreePrintData: (data: unknown) => data,
  mergePrintFieldRules: () => [],
}));
vi.mock('./runtime/prepare-template', () => ({
  preparePrintTemplate: (template: unknown, printData: unknown) => ({
    template,
    printData,
  }),
}));
vi.mock('./runtime/document-layout', () => ({
  toDocumentTemplate: (template: unknown) => template,
}));
vi.mock('./template/template-store', () => ({
  loadPrintTemplateByCode: async () => ({
    panels: [{ width: 210, height: 297, paperType: 'A4' }],
  }),
}));
vi.mock('./print-data-json-dialog.vue', () => ({
  default: { render: () => null },
}));

const cleanups: Array<() => void> = [];
beforeEach(() => {
  toPdf.mockReset();
  createDocumentPrint.mockReset().mockImplementation(async () => ({
    toPdf,
    getHtml: () => ({
      appendTo: (host: HTMLElement) => {
        host.innerHTML =
          '<div class="hiprint-printPanel"><div class="hiprint-printPaper">测试正文</div></div>';
      },
    }),
  }));
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

async function flush() {
  for (let i = 0; i < 12; i++) await nextTick();
}

async function mountPreview() {
  const host = document.createElement('div');
  document.body.append(host);
  const open = ref(false);
  const app = createApp({
    render: () => h(Preview, { modelValue: open.value, detail: {} as never }),
  });
  app.directive('loading', {});
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  open.value = true;
  await flush();
  return requireDefined(document.querySelector<HTMLElement>('[role="dialog"]'));
}

function button(dialog: HTMLElement, label: string) {
  return requireDefined(
    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.textContent?.trim() === label,
    ),
  );
}

it('导出时展示状态、阻止重复提交及更换数据，完成后恢复操作', async () => {
  let finish!: (blob: Blob) => void;
  toPdf.mockImplementation(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-test');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const dialog = await mountPreview();
  const exportButton = button(dialog, '导出 PDF');
  exportButton.click();
  exportButton.click();
  await flush();
  expect(toPdf).toHaveBeenCalledOnce();
  expect(dialog.querySelector('[role="status"]')?.textContent).toContain(
    '正在生成 PDF',
  );
  expect(button(dialog, '使用数据 JSON').disabled).toBe(true);
  expect(button(dialog, '打印').disabled).toBe(true);
  const [template] = requireDefined(createDocumentPrint.mock.calls[1]);
  expect(template.panels[0].paperType).toBeUndefined();
  expect(requireDefined(toPdf.mock.calls[0])[2]).toMatchObject({
    foreignObjectRendering: true,
    scale: 2,
    isDownload: false,
  });
  finish(new Blob(['pdf'], { type: 'application/pdf' }));
  await flush();
  expect(dialog.querySelector('[role="status"]')).toBeNull();
  expect(button(dialog, '使用数据 JSON').disabled).toBe(false);
  expect(button(dialog, '打印').disabled).toBe(false);
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});

it('导出失败后清除生成状态并允许重试', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  toPdf
    .mockRejectedValueOnce(new Error('模拟导出失败'))
    .mockRejectedValueOnce(new Error('再次失败'));
  const dialog = await mountPreview();
  button(dialog, '导出 PDF').click();
  await flush();
  expect(dialog.querySelector('[role="status"]')).toBeNull();
  expect(button(dialog, '使用数据 JSON').disabled).toBe(false);
  button(dialog, '导出 PDF').click();
  await flush();
  expect(toPdf).toHaveBeenCalledTimes(2);
});
