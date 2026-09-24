import { createApp, h, nextTick, shallowRef } from 'vue';

import { ElMessage } from 'element-plus';
import { afterEach, describe, expect, it } from 'vitest';

import {
  listPrintElements,
  patchElementOptions,
} from '../template/print-element-meta';
import PrintStylePanel from './print-style-panel.vue';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  ElMessage.closeAll();
});

function template(type: string, options: Record<string, unknown>) {
  return {
    panels: [{ printElements: [{ printElementType: { type }, options }] }],
  };
}

async function mountPanel(type: string, options: Record<string, unknown>) {
  const original = template(type, options);
  const current = shallowRef<Record<string, any>>(original);
  const patches: Record<string, unknown>[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render() {
      const selected = listPrintElements(current.value)[0] || null;
      return h(PrintStylePanel, {
        selected,
        onPatch(patch) {
          if (!selected) throw new Error('No selected element');
          patches.push(patch);
          current.value = patchElementOptions(current.value, selected, patch);
        },
      });
    },
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  return { host, current, patches, original };
}

function numberInput(host: HTMLElement, label: string) {
  const item = [...host.querySelectorAll('.el-form-item')].find(
    (element) => element.querySelector('label')?.textContent?.trim() === label,
  );
  const input = item?.querySelector('input');
  if (!input) throw new Error(`Missing input: ${label}`);
  return input;
}

async function changeNumber(host: HTMLElement, label: string, value: string) {
  const input = numberInput(host, label);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

describe('print style panel integration', () => {
  it('writes text styles without changing binding, visibility rules or the source template', async () => {
    const panel = await mountPanel('text', {
      field: 'amount',
      agreeVisibleWhen: 'amount > 0',
      fontSize: 12,
      color: '#2563eb',
    });
    await changeNumber(panel.host, '字号（pt）', '18');
    expect(listPrintElements(panel.current.value)[0]?.options).toMatchObject({
      field: 'amount',
      agreeVisibleWhen: 'amount > 0',
      fontSize: 18,
      color: '#2563eb',
    });
    expect(listPrintElements(panel.original)[0]?.options.fontSize).toBe(12);
    expect(panel.patches).toHaveLength(1);
  });

  it('reloads drafts when selection changes and keeps table columns while editing the header', async () => {
    const panel = await mountPanel('text', { fontSize: 12, color: '#dc2626' });
    const columns = [
      [{ title: '金额', field: 'amount', agreeColExpr: 'quantity * price' }],
    ];
    panel.current.value = template('table', {
      fontSize: 10,
      tableHeaderFontSize: 14,
      columns,
    });
    await nextTick();
    expect(Number(numberInput(panel.host, '字号（pt）').value)).toBe(10);
    expect(Number(numberInput(panel.host, '表头字号（pt）').value)).toBe(14);
    expect(panel.patches).toHaveLength(0);
    await changeNumber(panel.host, '表头字号（pt）', '16');
    const options = listPrintElements(panel.current.value)[0]?.options;
    expect(options).toMatchObject({
      fontSize: 10,
      tableHeaderFontSize: 16,
      columns,
    });
    expect(options).not.toHaveProperty('color');
  });

  it('clears styles on reset and refreshes inputs while preserving content and layout', async () => {
    const panel = await mountPanel('text', {
      title: '协议编号',
      field: 'agreementNo',
      left: 25,
      top: 40,
      fontSize: 18,
      color: '#dc2626',
    });
    const reset = [...panel.host.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '恢复默认样式',
    );
    if (!reset) throw new Error('Missing reset button');
    reset.click();
    await nextTick();
    expect(listPrintElements(panel.current.value)[0]?.options).toEqual({
      title: '协议编号',
      field: 'agreementNo',
      left: 25,
      top: 40,
    });
    expect(numberInput(panel.host, '字号（pt）').value).toBe('');
  });

  it('edits shape borders and does not offer typography for QR codes', async () => {
    const panel = await mountPanel('rect', {
      borderWidth: 1,
      borderStyle: 'solid',
    });
    await changeNumber(panel.host, '线宽（pt）', '2');
    expect(listPrintElements(panel.current.value)[0]?.options).toMatchObject({
      borderWidth: 2,
      borderStyle: 'solid',
    });
    panel.current.value = template('text', {
      textType: 'qrcode',
      field: 'agreementNo',
    });
    await nextTick();
    expect(panel.host.textContent).toContain('二维码和条形码');
    expect(panel.host.querySelector('.el-input-number')).toBeNull();
  });
});
