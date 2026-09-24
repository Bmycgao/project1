import { createApp, h, nextTick, shallowRef } from 'vue';

import { afterEach, describe, expect, it } from 'vitest';

import { compileFormGrid, createFormGrid } from '../runtime/print-form-grid';
import { listPrintElements } from '../template/print-element-meta';
import PrintFormGridEditor from './print-form-grid-editor.vue';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

async function clickButton(label: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  button.click();
  await nextTick();
}

describe('form grid editor', () => {
  it('edits independent cell bindings, cancels drafts and saves dynamic rows and merged cells', async () => {
    const current = shallowRef(createFormGrid());
    const applied: any[] = [];
    const element = listPrintElements({
      panels: [
        {
          printElements: [
            {
              printElementType: { type: 'table' },
              options: {
                agreeFormGrid: current.value,
                fontSize: 10,
                title: '已有表单',
              },
            },
          ],
        },
      ],
    })[0]!;
    const sample = {
      agreementNo: 'XY-001',
      householdName: '张三',
      houses: [
        { address: '甲', area: 20, buildArea: 20 },
        { address: '乙', area: 30, buildArea: 30 },
      ],
    };
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(PrintFormGridEditor, {
          modelValue: current.value,
          element,
          sampleData: sample,
          onApply: (patch) => applied.push(patch),
          'onUpdate:modelValue': (grid) => {
            current.value = grid;
          },
        }),
    });
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    await clickButton('编辑自由表单');
    const original = JSON.stringify(current.value);
    const selectCell = async (label: string, shiftKey = false) => {
      const cell = document.querySelector<HTMLElement>(
        `td[aria-label="${label}"]`,
      );
      if (!cell) throw new Error(`Missing cell ${label}`);
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }));
      await nextTick();
    };
    await selectCell('第 1 行第 2 列');
    const input = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="单元格内容值"]',
    )!;
    input.value = 'householdName';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(document.querySelector('.form-grid-sample')?.textContent).toContain(
      '张三',
    );
    expect(JSON.stringify(current.value)).toBe(original);
    await clickButton('取消');
    expect(JSON.stringify(current.value)).toBe(original);
    expect(applied).toHaveLength(0);
    await clickButton('编辑自由表单');
    await selectCell('第 1 行第 2 列');
    const savedInput = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="单元格内容值"]',
    )!;
    savedInput.value = 'householdName';
    savedInput.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    await selectCell('第 4 行第 2 列');
    await selectCell('第 4 行第 3 列', true);
    await clickButton('合并选区');
    await clickButton('应用到画布');
    expect(applied).toHaveLength(1);
    expect(applied[0].options).toMatchObject({
      fontSize: 10,
      title: '已有表单',
    });
    const saved = JSON.parse(JSON.stringify(current.value));
    expect(saved.rows[0].cells[1].value).toBe('householdName');
    expect(saved.rows[3].source).toBe('houses');
    const rows = compileFormGrid(saved, sample).rows;
    expect(rows[0]?.__form_c1).toBe('张三');
    expect(rows[3]?.agreeCellMerges).toEqual([
      [1, 1],
      [1, 2],
      [0, 0],
      [1, 1],
    ]);
    expect(rows[4]?.agreeCellMerges).toEqual(rows[3]?.agreeCellMerges);
  }, 20_000);
});
