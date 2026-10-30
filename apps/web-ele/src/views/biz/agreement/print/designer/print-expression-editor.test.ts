import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import {
  protocolPrintExprFields,
  rowPrintExprFields,
} from '../runtime/print-expr-catalog';
import PrintExprHelp from './print-expr-help.vue';
import PrintExpressionDialog from './print-expression-dialog.vue';
import PrintFilterPanel from './print-filter-panel.vue';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
async function click(node?: Element | null) {
  expect(node).toBeTruthy();
  await new Promise((resolve) => setTimeout(resolve, 1));
  (node as HTMLElement).click();
  await nextTick();
}
function button(root: ParentNode, text: string) {
  return [...root.querySelectorAll('button')].find(
    (el) => el.textContent?.trim() === text,
  );
}
async function fill(root: ParentNode, label: string, value: string) {
  const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `input[aria-label="${label}"], textarea[aria-label="${label}"]`,
  );
  expect(input).toBeTruthy();
  await new Promise((resolve) => setTimeout(resolve, 1));
  requireDefined(input).value = value;
  requireDefined(input).dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}
async function select(root: ParentNode, label: string, text: string) {
  const input = root.querySelector(`[aria-label="${label}"]`);
  await click(
    input?.closest('.el-select')?.querySelector('.el-select__wrapper'),
  );
  const dropdown = document.querySelector(
    `[id="${input?.getAttribute('aria-controls') || ''}"]`,
  );
  const option = [
    ...(dropdown || document).querySelectorAll('[role="option"]'),
  ].find((el) => el.textContent?.trim() === text);
  await click(option);
}
async function mountHelp(scene: 'cell' | 'filter' | 'text' = 'cell') {
  const tokens: string[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(PrintExprHelp, {
        expanded: true,
        scene,
        fields:
          scene === 'text'
            ? protocolPrintExprFields()
            : rowPrintExprFields([
                { field: 'amount', title: '金额' },
                { field: 'quantity', title: '数量' },
              ]),
        context: {
          amount: 25,
          quantity: 10,
          houses: [{ buildArea: 86 }],
          rewardItems: [{ amount: 10 }, { amount: 20 }],
        },
        onInsert: (token: string) => tokens.push(token),
      }),
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  await click(
    [...host.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent?.trim() === '函数',
    ),
  );
  return { host, tokens };
}
async function chooseFunction(host: ParentNode, name: string) {
  await click(
    [...host.querySelectorAll('.print-expr-help__function')].find(
      (el) => el.querySelector('strong')?.textContent === name,
    ),
  );
}

describe('shared expression authoring', () => {
  it.each(['cell', 'filter', 'text'] as const)(
    'builds IF with fields and automatically quoted literal text in %s',
    async (scene) => {
      const { host, tokens } = await mountHelp(scene);
      await chooseFunction(host, 'IF');
      expect(button(host, '插入函数')?.disabled).toBe(true);
      await select(
        host,
        '条件字段 1',
        scene === 'text' ? '协议金额 (amount)' : '金额 (amount)',
      );
      await select(host, '条件比较方式 1', '大于');
      await fill(host, '条件比较值 1', '0');
      await select(host, '成立时的值输入方式', '字段值');
      await select(
        host,
        '成立时的值',
        scene === 'text' ? '协议金额 (amount)' : '金额 (amount)',
      );
      await select(host, '不成立时的值输入方式', '固定值');
      await fill(host, '不成立时的值', '无"奖励');
      expect(host.textContent).toContain('样例结果：25');
      await click(button(host, '插入函数'));
      expect(tokens).toEqual([String.raw`IF(amount > 0, amount, "无\"奖励")`]);
    },
  );

  it('selects aggregate table and column, resets incompatible column when switching tables', async () => {
    const { host, tokens } = await mountHelp();
    await chooseFunction(host, 'SUM');
    await select(host, '统计字段', '建筑面积 (buildArea)');
    expect(host.textContent).toContain('样例结果：86');
    await select(host, '数据表', '奖励补贴 (rewardItems)');
    expect(button(host, '插入函数')?.disabled).toBe(true);
    await select(host, '统计字段', '金额 (amount)');
    await click(button(host, '插入函数'));
    expect(tokens).toEqual(['SUM(rewardItems, "amount")']);
    expect(host.textContent).toContain('样例结果：30');
  });

  it('adds IFS condition pairs before the default value', async () => {
    const { host, tokens } = await mountHelp();
    await chooseFunction(host, 'IFS');
    await select(host, '条件 1字段 1', '金额 (amount)');
    await select(host, '条件 1比较方式 1', '大于');
    await fill(host, '条件 1比较值 1', '100');
    await select(host, '结果 1输入方式', '固定值');
    await select(host, '结果 1固定值类型', '数字');
    await fill(host, '结果 1', '100');
    await click(button(host, '添加条件与结果'));
    await select(host, '条件 2字段 1', '金额 (amount)');
    await select(host, '条件 2比较方式 1', '大于');
    await fill(host, '条件 2比较值 1', '0');
    await select(host, '结果 2', '金额 (amount)');
    await click(button(host, '插入函数'));
    expect(tokens).toEqual(['IFS(amount > 100, 100, amount > 0, amount, "")']);
    await click(button(host, '移除'));
    await click(button(host, '插入函数'));
    expect(tokens[1]).toBe('IFS(amount > 100, 100, "")');
  });

  it('builds compound field comparisons and keeps advanced drafts', async () => {
    const { host, tokens } = await mountHelp();
    await chooseFunction(host, 'IF');
    await select(host, '条件字段 1', '金额 (amount)');
    await select(host, '条件比较方式 1', '大于等于');
    await select(host, '条件比较值 1输入方式', '字段值');
    await select(host, '条件比较值 1', '数量 (quantity)');
    await click(button(host, '添加判断条件'));
    await select(host, '条件字段 2', '数量 (quantity)');
    await select(host, '条件比较方式 2', '不为空');
    await select(host, '条件条件关系', '满足任一（或）');
    await select(host, '成立时的值', '金额 (amount)');
    await select(host, '不成立时的值输入方式', '固定值');
    await click(button(host, '插入函数'));
    expect(tokens[0]).toBe(
      'IF((amount >= quantity) || (!EMPTY(quantity)), amount, "")',
    );
    await click(
      [...host.querySelectorAll('.el-radio-button')].find(
        (el) => el.textContent === '公式编辑',
      ),
    );
    await fill(host, '条件', 'amount > 100');
    await click(
      [...host.querySelectorAll('.el-radio-button')].find(
        (el) => el.textContent === '条件配置',
      ),
    );
    await click(
      [...host.querySelectorAll('.el-radio-button')].find(
        (el) => el.textContent === '公式编辑',
      ),
    );
    expect(
      host.querySelector<HTMLTextAreaElement>('[aria-label="条件"]')?.value,
    ).toBe('amount > 100');
  });

  it('distinguishes fixed text, numbers and booleans and inserts fields locally', async () => {
    const { host, tokens } = await mountHelp();
    await chooseFunction(host, 'IF');
    await select(host, '条件字段 1', '金额 (amount)');
    await select(host, '条件比较方式 1', '不为空');
    await select(host, '成立时的值输入方式', '固定值');
    await fill(host, '成立时的值', '100 + 20');
    await select(host, '不成立时的值输入方式', '固定值');
    await select(host, '不成立时的值固定值类型', '真 / 假');
    await select(host, '不成立时的值', '假（false）');
    await click(button(host, '插入函数'));
    expect(tokens[0]).toBe('IF(!EMPTY(amount), "100 + 20", false)');
    await select(host, '成立时的值固定值类型', '数字');
    await fill(host, '成立时的值', '100 + 20');
    expect(button(host, '插入函数')?.disabled).toBe(true);
    expect(host.textContent).toContain('请输入有效数字');
    await select(host, '成立时的值输入方式', '计算表达式');
    await fill(host, '成立时的值', ' + 1');
    requireDefined(
      host.querySelector<HTMLTextAreaElement>('[aria-label="成立时的值"]'),
    ).setSelectionRange(0, 0);
    await select(host, '成立时的值插入字段', '金额 (amount)');
    expect(
      host.querySelector<HTMLTextAreaElement>('[aria-label="成立时的值"]')
        ?.value,
    ).toBe('amount + 1');
    expect(tokens).toHaveLength(1);
    await click(
      [...host.querySelectorAll('button')].find(
        (el) =>
          el.classList.contains('el-button--primary') &&
          el.textContent?.trim() === '插入函数',
      ),
    );
    expect(tokens[1]).toBe('IF(!EMPTY(amount), amount + 1, false)');
  });

  it('keeps a dialog draft isolated on cancel and rejects invalid expressions', async () => {
    const open = ref(true);
    const applied: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(PrintExpressionDialog, {
          modelValue: open.value,
          expression: 'amount > 0',
          scene: 'visible',
          context: { amount: 25 },
          fields: [],
          'onUpdate:modelValue': (value: boolean) => {
            open.value = value;
          },
          onApply: (value: string) => applied.push(value),
        }),
    });
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    await nextTick();
    await fill(document, '表达式', 'amount = 0');
    expect(button(document, '应用条件')?.disabled).toBe(true);
    await fill(document, '表达式', 'amount');
    expect(document.body.textContent).toContain('条件通常应返回 true / false');
    await click(button(document, '取消'));
    expect(applied).toEqual([]);
    open.value = true;
    await nextTick();
    expect(
      document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="表达式"]',
      )?.value,
    ).toBe('amount > 0');
    await fill(document, '表达式', 'amount > 100');
    await click(button(document, '应用条件'));
    expect(applied).toEqual(['amount > 100']);
  });
});

describe('shared filter conditions', () => {
  it('preserves field comparisons, removes business shortcuts and blocks partial conditions', async () => {
    const applied: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const panel = ref<InstanceType<typeof PrintFilterPanel>>();
    const app = createApp({
      render: () =>
        h(PrintFilterPanel, {
          ref: panel,
          columns: [
            { field: 'amount', title: '金额' },
            { field: 'quantity', title: '数量' },
          ],
          filterExpr: 'amount > quantity',
          tableField: 'rewardItems',
          sampleData: {
            rewardItems: [
              { amount: 20, quantity: 10 },
              { amount: 5, quantity: 10 },
            ],
          } as any,
          onApply: (value: string) => applied.push(value),
        }),
    });
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    await nextTick();
    expect(host.textContent).not.toContain('隐藏金额为 0 的行');
    expect(host.textContent).toContain('样例将打印 1 / 2 行');
    expect(applied).toEqual([]);
    expect(panel.value?.apply()).toBe(true);
    expect(applied).toEqual(['amount > quantity']);
    await click(button(host, '添加判断条件'));
    expect(panel.value?.apply()).toBe(false);
    expect(applied).toHaveLength(1);
  });
  it('keeps saved IN rules in formula mode until explicitly applied', async () => {
    const applied: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(PrintFilterPanel, {
          columns: [{ field: 'name', title: '项目名称' }],
          filterExpr: 'IN(name, "a", "b")',
          tableField: 'rewardItems',
          sampleData: { rewardItems: [{ name: 'a' }, { name: 'c' }] } as any,
          onApply: (value: string) => applied.push(value),
        }),
    });
    app.mount(host);
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });
    await nextTick();
    expect(
      host.querySelector<HTMLTextAreaElement>('[aria-label="表达式"]')?.value,
    ).toBe('IN(name, "a", "b")');
    expect(host.textContent).toContain('样例将打印 1 / 2 行');
    expect(applied).toEqual([]);
  });
});
