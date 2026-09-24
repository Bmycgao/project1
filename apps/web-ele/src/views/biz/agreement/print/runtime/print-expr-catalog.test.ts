import { createApp, h, nextTick } from 'vue';

import { afterEach, describe, expect, it } from 'vitest';

import PrintExprHelp from '../designer/print-expr-help.vue';
import {
  applyPrintExprInsert,
  colorPrintExprFields,
  filterPrintExprFields,
  PRINT_EXPR_CALC_GROUPS,
  PRINT_EXPR_FUNCTION_GROUPS,
  PRINT_EXPR_JUDGE_GROUPS,
  PRINT_EXPR_SCENE_META,
  protocolPrintExprFields,
  splitPrintExprHelpFields,
  splicePrintExprToken,
} from './print-expr-catalog';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

describe('print expr catalog', () => {
  it('parks the caret inside empty function parentheses', () => {
    expect(splicePrintExprToken('', 'IF(, , )')).toEqual({
      cursor: 3,
      next: 'IF(, , )',
    });
    expect(splicePrintExprToken('amount', ' > ', 6, 6).next).toBe('amount > ');
    expect(splicePrintExprToken('', ' ?  : ').cursor).toBe(2);
  });

  it('inserts at the current input caret', () => {
    const input = document.createElement('textarea');
    document.body.append(input);
    input.value = 'amount';
    input.focus();
    input.setSelectionRange(6, 6);
    expect(applyPrintExprInsert('amount', ' > 0', input)).toBe('amount > 0');
    input.remove();
  });

  it('keeps a full function catalog and scene-specific values', () => {
    expect(PRINT_EXPR_JUDGE_GROUPS.map((g) => g.title)).toEqual([
      '条件',
      '空值与包含',
    ]);
    expect(PRINT_EXPR_CALC_GROUPS.map((g) => g.title)).toEqual([
      '数字',
      '文本与格式',
      '表统计',
    ]);
    expect(PRINT_EXPR_FUNCTION_GROUPS).toHaveLength(5);
    expect(PRINT_EXPR_SCENE_META.filter.summary).toContain('本行列字段');
    expect(
      protocolPrintExprFields().some((f) => f.value === 'compensatee'),
    ).toBe(true);
    expect(
      filterPrintExprFields([{ field: 'certNo', title: '产权证号' }])[0],
    ).toMatchObject({ group: '本行列', value: 'certNo' });
    expect(colorPrintExprFields([])[0]).toMatchObject({ value: 'value' });
    const split = splitPrintExprHelpFields(
      'filter',
      filterPrintExprFields([{ field: 'certNo', title: '产权证号' }]),
    );
    expect(split.primary).toEqual([
      { group: '本行列', label: '产权证号', value: 'certNo' },
    ]);
    expect(split.extra.some((item) => item.group === '协议字段')).toBe(true);
  });
});

describe('print expr help', () => {
  it('stays collapsed until 全部函数与字段 is opened, then inserts chips', async () => {
    const inserted: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(PrintExprHelp, {
          scene: 'filter',
          fields: [
            { group: '本行列', label: '金额', value: 'amount' },
            { group: '协议字段', label: '被征收人', value: 'compensatee' },
          ],
          onInsert: (token: string) => inserted.push(token),
        }),
    });
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    expect(host.textContent).toContain('可用：本行列字段');
    expect(host.textContent).not.toContain('IF(条件, 真, 假)');
    const open = [...host.querySelectorAll('button')].find(
      (btn) => btn.textContent?.trim() === '全部函数与字段',
    );
    expect(open).toBeTruthy();
    open?.click();
    await nextTick();
    expect(host.textContent).toContain('金额');
    expect(host.textContent).toContain('更多值（协议 / 合计 / 整表）');
    expect(host.textContent).not.toContain('被征收人');
    expect(host.textContent).not.toContain('IF(条件, 真, 假)');
    const amount = [...host.querySelectorAll('button')].find(
      (btn) => btn.textContent?.trim() === '金额',
    );
    amount?.click();
    expect(inserted).toEqual(['amount']);
    const judge = [...host.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent?.trim() === '判断',
    );
    (judge as HTMLElement | undefined)?.click();
    await nextTick();
    expect(host.textContent).toContain('IF(条件, 真, 假)');
  });
});
