import { createApp, h, nextTick, shallowRef } from 'vue';

import { afterEach, describe, expect, it } from 'vitest';

import { preparePrintTemplate } from '../runtime/prepare-template';
import { listPrintElements } from '../template/print-element-meta';
import PrintInspector from './print-inspector.vue';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

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
        selectedKey: listPrintElements(current.value)[0]!.key,
        sampleData: {} as any,
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
    const options = listPrintElements(current.value)[0]!.options;
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
    expect(listPrintElements(current.value)[0]!.options).toMatchObject({
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

  it('opens the simple builder after choosing 按条件 without writing a formula', async () => {
    const { current, host } = await mountInspector();
    clickLabeledControl(host, '按条件');
    await nextTick();
    expect(host.textContent).toContain('常用条件');
    expect(host.textContent).toContain('应用条件');
    expect(
      listPrintElements(current.value)[0]!.options.agreeVisibleWhen || '',
    ).toBe('');
  });

  it('shows two-layer expression help in 高级表达式', async () => {
    const { host } = await mountInspector();
    clickLabeledControl(host, '按条件');
    await nextTick();
    clickLabeledControl(host, '高级表达式');
    await nextTick();
    expect(host.textContent).toContain('全部函数与字段');
    expect(host.textContent).toContain('可用：协议字段');
    expect(host.textContent).not.toContain('IF(条件, 真, 假)');
    const open = [...host.querySelectorAll('button')].find(
      (btn) => btn.textContent?.trim() === '全部函数与字段',
    );
    open?.click();
    await nextTick();
    expect(host.textContent).toContain('被征收人');
    expect(host.textContent).not.toContain('IF(条件, 真, 假)');
    const judge = [...host.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent?.trim() === '判断',
    );
    (judge as HTMLElement | undefined)?.click();
    await nextTick();
    expect(host.textContent).toContain('IF(条件, 真, 假)');
  });

  it('writes false when choosing 始终隐藏', async () => {
    const { current, host } = await mountInspector();
    clickLabeledControl(host, '始终显示');
    await nextTick();
    expect(
      listPrintElements(current.value)[0]!.options.agreeVisibleWhen || '',
    ).toBe('');
    clickLabeledControl(host, '始终隐藏');
    await nextTick();
    expect(listPrintElements(current.value)[0]!.options.agreeVisibleWhen).toBe(
      'false',
    );
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
        selectedKey: listPrintElements(current.value)[0]!.key,
        sampleData: {
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
