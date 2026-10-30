import { createApp, h, nextTick, shallowRef } from 'vue';

import { ElMessage } from 'element-plus';
import { afterEach, describe, expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
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

async function clickControl(element: HTMLElement | null) {
  if (!element) throw new Error('Missing control');
  await new Promise((resolve) => setTimeout(resolve, 1));
  element.click();
  await nextTick();
}
async function setLine(host: HTMLElement, label: string, show: boolean) {
  await clickControl(
    host.querySelector<HTMLElement>(
      `[role="radiogroup"][aria-label="${label}"] input[value="${show}"]`,
    ),
  );
}

describe('print style panel integration', () => {
  it('edits the bottom edge without a footer, keeps unrelated legacy styles and restores border defaults', async () => {
    const columns = [[{ title: '金额', field: 'amount' }]];
    const panel = await mountPanel('table', {
      field: 'items',
      columns,
      tableHeaderRepeat: 'none',
      tableHeaderBorder: 'noBorder',
    });
    expect(panel.host.textContent).not.toContain('默认（有边框）');
    expect(panel.host.textContent).not.toContain('表尾外边框');
    expect(panel.host.textContent).toContain('半选表示旧模板');
    const bottom = requireDefined(
      panel.host.querySelector<HTMLInputElement>(
        '[aria-label="表格外框下边"] input',
      ),
    );
    expect(bottom.checked).toBe(true);
    await clickControl(bottom);
    let options = requireDefined(
      listPrintElements(panel.current.value)[0],
    ).options;
    expect(options.agreeTableBorders).toEqual({ outer: { bottom: false } });
    expect(options.tableHeaderBorder).toBe('noBorder');
    await setLine(panel.host, '表头与明细分隔线', true);
    await setLine(panel.host, '明细内部格子线', false);
    options = requireDefined(listPrintElements(panel.current.value)[0]).options;
    expect(options.agreeTableBorders).toEqual({
      outer: { bottom: false },
      headerDivider: true,
      bodyInner: false,
    });
    const borders = JSON.parse(JSON.stringify(options.agreeTableBorders));
    await changeNumber(panel.host, '字号（pt）', '18');
    expect(
      requireDefined(listPrintElements(panel.current.value)[0]).options
        .agreeTableBorders,
    ).toEqual(borders);
    panel.current.value = JSON.parse(JSON.stringify(panel.current.value));
    await nextTick();
    expect(
      requireDefined(
        panel.host.querySelector<HTMLInputElement>(
          '[aria-label="表格外框下边"] input',
        ),
      ).checked,
    ).toBe(false);
    expect(
      requireDefined(
        panel.host.querySelector<HTMLInputElement>(
          '[aria-label="明细内部格子线"] input[value="false"]',
        ),
      ).checked,
    ).toBe(true);
    await clickControl(
      requireDefined(
        [...panel.host.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === '恢复默认样式',
        ),
      ),
    );
    options = requireDefined(listPrintElements(panel.current.value)[0]).options;
    expect(options).not.toHaveProperty('agreeTableBorders');
    expect(options).not.toHaveProperty('tableHeaderBorder');
    expect(options.tableHeaderRepeat).toBe('none');
    expect(options.columns).toEqual(columns);
    expect(
      requireDefined(
        panel.host.querySelector<HTMLInputElement>(
          '[aria-label="表格外框下边"] input',
        ),
      ).checked,
    ).toBe(true);
  });

  it('shows summary and note controls only when content exists, including automatic totals', async () => {
    const panel = await mountPanel('table', {
      columns: [[{ title: '金额', field: 'amount' }]],
    });
    expect(
      panel.host.querySelector('[aria-label="合计与备注内部格子线"]'),
    ).toBeNull();
    expect(panel.host.textContent).toContain('添加后显示对应边框设置');
    panel.current.value = template('table', {
      columns: [[{ title: '金额', field: 'amount', tableSummary: 'sum' }]],
    });
    await nextTick();
    expect(
      panel.host.querySelector('[aria-label="合计与备注内部格子线"]'),
    ).not.toBeNull();
    await setLine(panel.host, '合计与备注前分隔线', false);
    expect(
      requireDefined(listPrintElements(panel.current.value)[0]).options
        .agreeTableBorders,
    ).toEqual({ footerDivider: false });
    panel.current.value = template('table', {
      columns: [[{ title: '金额', field: 'amount' }]],
      agreeFooters: [{ cells: [{ text: '备注', colspan: 1 }] }],
    });
    await nextTick();
    expect(
      panel.host.querySelector('[aria-label="合计与备注内部格子线"]'),
    ).not.toBeNull();
    panel.current.value = template('table', {
      agreeFormGrid: { rows: [] },
      columns: [],
    });
    await nextTick();
    expect(
      panel.host.querySelector('[aria-label="表头内部格子线"]'),
    ).toBeNull();
    expect(
      panel.host.querySelector('[aria-label="合计与备注内部格子线"]'),
    ).toBeNull();
    expect(
      panel.host.querySelector('[aria-label="内部格子线"]'),
    ).not.toBeNull();
    expect(
      panel.host.querySelector('[aria-label="表格外框下边"] input'),
    ).not.toBeNull();
  });

  it('edits individual header row heights, detail minimum height and clears row overrides on reset', async () => {
    const panel = await mountPanel('table', {
      tableHeaderRowHeight: 18,
      columns: [
        [{ title: '项目信息', colspan: 2 }],
        [
          { title: '名称', field: 'name' },
          { title: '金额', field: 'amount' },
        ],
      ],
    });
    await changeNumber(panel.host, '第 2 行表头最小高度（pt）', '36');
    await changeNumber(panel.host, '默认明细行最小高度（pt）', '30');
    const options = requireDefined(
      listPrintElements(panel.current.value)[0],
    ).options;
    expect(options.agreeHeaderRowHeights).toEqual([null, 36]);
    expect(options.tableHeaderRowHeight).toBe(18);
    expect(options.tableBodyRowHeight).toBe(30);
    requireDefined(
      [...panel.host.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === '恢复默认样式',
      ),
    ).click();
    await nextTick();
    expect(
      requireDefined(listPrintElements(panel.current.value)[0]).options,
    ).not.toHaveProperty('agreeHeaderRowHeights');
  });
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
    expect(panel.host.textContent).toContain('打印宽度（mm）');
    expect(panel.host.textContent).not.toContain('字号（pt）');
    await changeNumber(panel.host, '打印高度（mm）', '20');
    expect(
      requireDefined(listPrintElements(panel.current.value)[0]).options.height,
    ).toBeCloseTo((20 * 72) / 25.4);
  });
});
