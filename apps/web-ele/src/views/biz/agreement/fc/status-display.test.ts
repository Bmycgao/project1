import { describe, expect, it } from 'vitest';

import { withCurrentAgreementStatus } from './status-display';

describe('旧模板中的当前协议状态', () => {
  it('在嵌套布局中补当前值，保留模板配置且不改发布快照', () => {
    const rule = [
      {
        type: 'row',
        children: [
          {
            type: 'radio',
            field: 'statusValue',
            props: { disabled: true },
            options: [{ label: '自定义标题', value: '草稿' }],
          },
        ],
      },
    ];
    const runtime = withCurrentAgreementStatus(rule, '项目经理已审核');
    expect(runtime[0]?.children[0].options).toEqual([
      { label: '自定义标题', value: '草稿' },
      { label: '项目经理已审核', value: '项目经理已审核' },
    ]);
    expect(runtime[0]?.children[0].props.disabled).toBe(true);
    expect(rule[0]?.children[0]?.options).toHaveLength(1);
    expect(withCurrentAgreementStatus(runtime, '项目经理已审核')).toEqual(
      runtime,
    );
  });

  it('不替换其他字段的选项，也不给输入框或隐藏缺失字段新增状态控件', () => {
    const rule = [
      { field: 'statusValue', type: 'input' },
      {
        field: 'other',
        options: [{ label: '其他', value: 'other' }],
      },
    ];
    expect(withCurrentAgreementStatus(rule, '旧值')).toEqual(rule);
  });
});
