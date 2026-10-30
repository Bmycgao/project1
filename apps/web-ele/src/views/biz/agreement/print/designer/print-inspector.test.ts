import { createApp, h, nextTick, ref, shallowRef } from 'vue';

import { afterEach, describe, expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { toDocumentTemplate } from '../runtime/document-layout';
import { preparePrintTemplate } from '../runtime/prepare-template';
import { agreePrintTemplate } from '../template/agreement-template';
import { listPrintElements } from '../template/print-element-meta';
import { normalizeDesignerTemplate } from './normalize-designer-template';
import PrintInspector from './print-inspector.vue';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

it('updates a text binding when the editor loses focus', async () => {
  const current = shallowRef<Record<string, any>>({
    panels: [
      {
        printElements: [
          {
            printElementType: { type: 'text' },
            options: {
              field: 'agreementNo',
              title: '协议编号',
              top: 20,
              left: 20,
            },
          },
        ],
      },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(PrintInspector, {
        templateJson: current.value,
        selectedKey: requireDefined(listPrintElements(current.value)[0]).key,
        sampleData: {} as any,
        onCanvasPatch: (next) => {
          current.value = next;
        },
      }),
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();

  const item = [...host.querySelectorAll('.el-form-item')].find(
    (el) => el.querySelector('label')?.textContent?.trim() === '绑定字段',
  );
  const input = item?.querySelector<HTMLInputElement>('input');
  if (!input) throw new Error('Missing binding input');
  input.value = 'signDate';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
  expect(
    requireDefined(listPrintElements(current.value)[0]).options.field,
  ).toBe('signDate');
});

it('keeps property tabs available after restoring and reselecting an element', async () => {
  const current = shallowRef<Record<string, any>>(
    toDocumentTemplate(JSON.parse(JSON.stringify(agreePrintTemplate))),
  );
  const selectedKey = ref('');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(PrintInspector, {
        templateJson: current.value,
        selectedKey: selectedKey.value,
        sampleData: {} as any,
      }),
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });

  current.value = normalizeDesignerTemplate(agreePrintTemplate);
  await nextTick();
  selectedKey.value = requireDefined(
    listPrintElements(current.value).find(
      (element) => element.options.field === 'agreementName',
    ),
  ).key;
  await nextTick();
  expect(host.textContent).toContain('agreementName');
  expect(
    [...host.querySelectorAll('[role="tab"]')].map((el) =>
      el.textContent?.trim(),
    ),
  ).toEqual(expect.arrayContaining(['内容与数据', '外观', '规则']));
});

async function mountInspector() {
  const current = shallowRef<Record<string, any>>({
    panels: [
      {
        printElements: [
          {
            printElementType: { type: 'text' },
            options: {
              field: 'agreementNo',
              top: 100,
              left: 20,
              width: 100,
              height: 18,
              agreeFlowGroup: 'header',
              agreeFlowFloat: 'right',
              agreeFlowCollapse: true,
              agreeFlowStretch: true,
              agreeVisibleWhen: 'false',
            },
          },
          {
            printElementType: { type: 'text' },
            options: {
              field: 'signDate',
              top: 130,
              left: 20,
              width: 100,
              height: 18,
              agreeFlowGroup: 'header',
            },
          },
        ],
      },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render() {
      return h(PrintInspector, {
        templateJson: current.value,
        selectedKey: requireDefined(listPrintElements(current.value)[0]).key,
        sampleData: { rewardItems: [{ amount: 10 }], amount: 25 } as any,
        onCanvasPatch: (next) => {
          current.value = next;
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
  const rulesTab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (el) => el.textContent?.trim() === '规则',
  );
  if (!rulesTab) throw new Error('Missing rules tab');
  rulesTab.click();
  await nextTick();
  return { current, host };
}

describe('flow group controls', () => {
  it('clears optional group settings through the UI and still automatically fills space after reload', async () => {
    const { current, host } = await mountInspector();
    const advanced = [
      ...host.querySelectorAll<HTMLElement>('[role="button"]'),
    ].find((el) => el.textContent?.trim() === '高级排版设置');
    if (!advanced) throw new Error('Missing advanced layout control');
    expect(advanced.getAttribute('aria-expanded')).toBe('false');
    const beforeExpand = JSON.stringify(current.value);
    advanced.click();
    await nextTick();
    expect(advanced.getAttribute('aria-expanded')).toBe('true');
    expect(JSON.stringify(current.value)).toBe(beforeExpand);
    const item = [...host.querySelectorAll('.el-form-item')].find(
      (el) =>
        el.querySelector('label')?.textContent?.trim() === '内容分组（可选）',
    );
    item
      ?.querySelector('.el-select')
      ?.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    const clear = item?.querySelector<HTMLElement>('.el-select__clear');
    if (!clear) throw new Error('Missing group clear control');
    clear.click();
    await nextTick();
    const options = requireDefined(listPrintElements(current.value)[0]).options;
    expect(options).not.toHaveProperty('agreeFlowGroup');
    expect(options).not.toHaveProperty('agreeFlowFloat');
    expect(options).not.toHaveProperty('agreeFlowStretch');
    expect(options.agreeFlowCollapse).toBe(true);
    expect(options.agreeVisibleWhen).toBe('false');
    expect(host.textContent).toContain('上方正文隐藏后自动上移，无需分组');
    const saved = JSON.parse(JSON.stringify(current.value));
    const prepared = preparePrintTemplate(saved, {} as any).template;
    expect(prepared.panels[0].printElements[0].options.top).toBe(100);
  });

  it('can independently choose fixed positioning and preserve it after save and reload', async () => {
    const { current, host } = await mountInspector();
    const item = [...host.querySelectorAll('.el-form-item')].find(
      (el) => el.querySelector('label')?.textContent?.trim() === '排版方式',
    );
    item?.querySelector<HTMLElement>('.el-select__wrapper')?.click();
    await nextTick();
    const fixed = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((el) => el.textContent?.trim() === '固定位置');
    if (!fixed) throw new Error('Missing fixed positioning option');
    fixed.click();
    await nextTick();
    expect(
      requireDefined(listPrintElements(current.value)[0]).options,
    ).toMatchObject({
      agreeFlowMode: 'fixed',
      agreeFlowGroup: 'header',
    });
    expect(host.textContent).toContain('保留设计位置，不跟随上方内容移动');
    const saved = JSON.parse(JSON.stringify(current.value));
    const prepared = preparePrintTemplate(saved, {} as any).template;
    expect(prepared.panels[0].printElements[0].options.top).toBe(130);
  });
});

describe('visible condition display modes', () => {
  /** 只点分段按钮文案，避免误点帮助里的「按条件」 */
  function clickLabeledControl(host: HTMLElement, text: string) {
    const el = [...host.querySelectorAll('.el-radio-button__inner')].find(
      (node) => node.textContent?.trim() === text,
    );
    if (!el) throw new Error(`Missing control: ${text}`);
    (el as HTMLElement).click();
  }

  it('keeps the expression editor collapsed while always hidden', async () => {
    const { host } = await mountInspector();
    expect(host.textContent).toContain('当前元素始终隐藏');
    expect(host.textContent).not.toContain('插入字段');
    expect(host.textContent).not.toContain('全部函数与字段');
    expect(host.textContent).not.toContain('应用条件');
  });

  it('opens a shared condition dialog and preserves an always-hidden rule on cancel', async () => {
    const { current, host } = await mountInspector();
    clickLabeledControl(host, '按条件显示');
    await nextTick();
    expect(document.body.textContent).toContain('条件配置');
    expect(document.body.textContent).toContain('应用条件');
    expect(
      requireDefined(listPrintElements(current.value)[0]).options
        .agreeVisibleWhen,
    ).toBe('false');
    const cancel = [...document.querySelectorAll('button')].find(
      (el) => el.textContent?.trim() === '取消',
    );
    cancel?.click();
    await nextTick();
    expect(
      requireDefined(listPrintElements(current.value)[0]).options
        .agreeVisibleWhen,
    ).toBe('false');
    expect(host.textContent).toContain('当前元素始终隐藏');
  });

  it('uses shared field/function help and only writes a formula on apply', async () => {
    const { current, host } = await mountInspector();
    clickLabeledControl(host, '按条件显示');
    await nextTick();
    clickLabeledControl(document.body, '公式编辑');
    await nextTick();
    expect(document.body.textContent).toContain('被征收人');
    const input = requireDefined(
      document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="表达式"]',
      ),
    );
    input.value = 'COUNT(rewardItems) > 0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    input.dispatchEvent(new FocusEvent('blur'));
    await nextTick();
    expect(
      requireDefined(listPrintElements(current.value)[0]).options
        .agreeVisibleWhen,
    ).toBe('false');
    const apply = [...document.querySelectorAll('button')].find(
      (el) => el.textContent?.trim() === '应用条件',
    );
    apply?.click();
    await nextTick();
    expect(
      requireDefined(listPrintElements(current.value)[0]).options
        .agreeVisibleWhen,
    ).toBe('COUNT(rewardItems) > 0');
  });

  it('writes false when choosing 始终隐藏', async () => {
    const { current, host } = await mountInspector();
    clickLabeledControl(host, '始终显示');
    await nextTick();
    expect(
      requireDefined(listPrintElements(current.value)[0]).options
        .agreeVisibleWhen || '',
    ).toBe('');
    clickLabeledControl(host, '始终隐藏');
    await nextTick();
    expect(
      requireDefined(listPrintElements(current.value)[0]).options
        .agreeVisibleWhen,
    ).toBe('false');
  });
});

async function mountTableInspector() {
  const current = shallowRef<Record<string, any>>({
    panels: [
      {
        printElements: [
          {
            printElementType: { type: 'table' },
            options: {
              field: 'rewardItems',
              columns: [
                [
                  { title: '奖励项目', field: 'name', width: 80 },
                  { title: '金额', field: 'amount', width: 80 },
                ],
              ],
              agreeRowFilter: 'amount > 0 && !EMPTY(name)',
            },
          },
        ],
      },
    ],
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render() {
      return h(PrintInspector, {
        templateJson: current.value,
        selectedKey: requireDefined(listPrintElements(current.value)[0]).key,
        sampleData: {
          amount: 25,
          rewardItems: [
            { name: 'a', amount: 1 },
            { name: '', amount: 0 },
          ],
        } as any,
        onCanvasPatch: (next: Record<string, any>) => {
          current.value = next;
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
  const rulesTab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (el) => el.textContent?.trim() === '规则',
  );
  if (!rulesTab) throw new Error('Missing rules tab');
  rulesTab.click();
  await nextTick();
  return { current, host };
}

describe('table filter chips', () => {
  it('shows one chip per simple AND condition', async () => {
    const { host } = await mountTableInspector();
    const text = host.textContent || '';
    expect(text).toContain('金额 大于 0');
    expect(text).toContain('奖励项目 不为空');
    expect(text).toContain('更多条件');
  });
});

it('opens visibility conditions for a table and accepts a root field also used by a column', async () => {
  const { current, host } = await mountTableInspector();
  const when = [
    ...host.querySelectorAll<HTMLElement>('.el-radio-button__inner'),
  ].find((el) => el.textContent?.trim() === '按条件显示');
  when?.click();
  await nextTick();
  expect(document.body.textContent).toContain('设置元素显示条件');
  const formula = [
    ...document.querySelectorAll<HTMLElement>('.el-radio-button__inner'),
  ].find((el) => el.textContent?.trim() === '公式编辑');
  formula?.click();
  await nextTick();
  const input = requireDefined(
    document.querySelector<HTMLTextAreaElement>('[aria-label="表达式"]'),
  );
  input.value = 'amount > 0';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  const apply = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((el) => el.textContent?.trim() === '应用条件');
  apply?.click();
  await nextTick();
  expect(
    requireDefined(listPrintElements(current.value)[0]).options
      .agreeVisibleWhen,
  ).toBe('amount > 0');
  expect(host.textContent).not.toContain('amount 是表体行字段');
});
