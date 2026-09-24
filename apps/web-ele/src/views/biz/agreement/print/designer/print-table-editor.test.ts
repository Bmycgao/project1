import { createApp, h, nextTick, shallowRef } from 'vue';

import { ElMessage } from 'element-plus';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildToolboxPrintElement,
  listPrintElements,
} from '../template/print-element-meta';
import PrintInspector from './print-inspector.vue';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  ElMessage.closeAll();
});
async function flush() {
  await nextTick();
  await nextTick();
}
async function button(text: string) {
  const element = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((el) => el.textContent?.trim() === text);
  if (!element) throw new Error(`Missing button ${text}`);
  element.click();
  await flush();
}
describe('table editor transaction', () => {
  it('keeps a new table selected through source picking, cancel and apply', async () => {
    const current = shallowRef<Record<string, any>>({
      panels: [
        {
          width: 210,
          height: 297,
          printElements: [buildToolboxPrintElement('table', 0, 0)],
        },
      ],
    });
    const original = JSON.stringify(current.value);
    const patches: any[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(PrintInspector, {
          templateJson: current.value,
          selectedKey: listPrintElements(current.value)[0]!.key,
          sampleData: {
            rewardItems: [{ name: '签约奖励', amount: 1234 }],
          } as any,
          onCanvasPatch: (next) => {
            patches.push(next);
            current.value = next;
          },
        }),
    });
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    await flush();
    const chooseSource = async () => {
      await button('选择表格');
      const source = document.querySelector<HTMLElement>(
        '[data-key="table-rewardItems"] .el-tree-node__content',
      );
      expect(source).not.toBeNull();
      source!.click();
      await flush();
      expect(
        document.querySelector('[aria-label="表格样例预览"]')?.textContent,
      ).toContain('签约奖励');
      expect(
        [...document.querySelectorAll('[role="dialog"]')].some(
          (el) => el.getAttribute('aria-label') === '编辑表格 · 明细表',
        ),
      ).toBe(true);
      expect(patches).toHaveLength(0);
    };
    await button('编辑明细表');
    await chooseSource();
    await button('取消');
    expect(JSON.stringify(current.value)).toBe(original);
    await button('编辑明细表');
    await chooseSource();
    await button('应用到画布');
    expect(patches).toHaveLength(1);
    const options = current.value.panels[0].printElements[0].options;
    expect(options.field).toBe('rewardItems');
    expect(options.columns[0].some((col: any) => col.field === 'amount')).toBe(
      true,
    );
    expect(options.columns[0].some((col: any) => col.field === 'col1')).toBe(
      false,
    );
  }, 40_000);
  it('isolates header, column and footer edits until apply; cancel discards them and apply emits once', async () => {
    const current = shallowRef<Record<string, any>>({
      panels: [
        {
          width: 210,
          height: 297,
          printElements: [
            {
              printElementType: { type: 'table' },
              options: {
                title: '奖励',
                field: 'rewardItems',
                width: 500,
                columns: [
                  [
                    { title: '项目', field: 'name', width: 300 },
                    {
                      title: '金额',
                      field: 'amount',
                      width: 200,
                      agreeColFormat: 'money',
                    },
                  ],
                ],
              },
            },
          ],
        },
      ],
    });
    const original = JSON.stringify(current.value);
    const patches: any[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(PrintInspector, {
          templateJson: current.value,
          selectedKey: listPrintElements(current.value)[0]!.key,
          sampleData: {
            rewardItems: [{ name: '签约奖励', amount: 1234 }],
          } as any,
          onCanvasPatch: (next) => {
            patches.push(next);
            current.value = next;
          },
        }),
    });
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    await flush();
    await button('编辑明细表');
    expect(
      document.querySelector('[aria-label="表格样例预览"]')?.textContent,
    ).toContain('签约奖励');
    await button('添加数据列');
    expect(JSON.stringify(current.value)).toBe(original);
    expect(patches).toHaveLength(0);
    expect(
      document.querySelector('[aria-label="表格样例预览"]')?.textContent,
    ).toContain('新列');
    await button('取消');
    expect(JSON.stringify(current.value)).toBe(original);
    await button('编辑明细表');
    expect(
      document.querySelector('[aria-label="表格样例预览"]')?.textContent,
    ).not.toContain('新列');
    await button('添加数据列');
    const footerTab = [
      ...document.querySelectorAll<HTMLElement>('[role="tab"]'),
    ].find((el) => el.textContent?.trim() === '合计与备注')!;
    footerTab.click();
    await flush();
    await button('添加备注行');
    expect(
      document.querySelector('[role="tab"][aria-label="整张表"]'),
    ).toBeNull();
    expect(patches).toHaveLength(0);
    await button('应用到画布');
    expect(patches).toHaveLength(1);
    const options = current.value.panels[0].printElements[0].options;
    expect(options.columns[0]).toHaveLength(3);
    expect(options.agreeFooters).toHaveLength(1);
    expect(options.field).toBe('rewardItems');
    expect(options.agreeFooters[0].cells).toHaveLength(1);
    expect(options.agreeFooters[0].cells[0]).toMatchObject({
      text: '备注：',
      colspan: 3,
    });
  }, 40_000);
  it('openTableEditor focuses 列与表头 and keeps merge tools in the click preview', async () => {
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
                    { title: '项目', field: 'name', width: 300 },
                    { title: '金额', field: 'amount', width: 200 },
                  ],
                ],
              },
            },
          ],
        },
      ],
    });
    let inspector: any;
    const highlights: number[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(PrintInspector, {
          ref: (value: any) => {
            inspector = value;
          },
          templateJson: current.value,
          selectedKey: listPrintElements(current.value)[0]!.key,
          sampleData: {
            rewardItems: [{ name: '签约奖励', amount: 1234 }],
          } as any,
          onHighlightCol: (colIndex: number) => highlights.push(colIndex),
        }),
    });
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    await flush();
    inspector.openTableEditor({ fromLeaf: 0, toLeaf: 0 });
    await flush();
    await flush();
    expect(highlights).toEqual([]);
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
      (el) => el.getAttribute('aria-label') === '编辑表格 · 明细表',
    );
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('点选表头编辑');
    expect(dialog?.textContent).toContain('更多（按列号分组 / 全部转单行）');
    expect(dialog?.textContent).not.toContain('高级表头设置（按列范围分组）');
    expect(dialog?.textContent).toContain('清除筛选');
    expect(dialog?.textContent).not.toContain('应用到模板');
  }, 40_000);
});
