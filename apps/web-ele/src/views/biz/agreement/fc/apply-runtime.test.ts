/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { describe, expect, it } from 'vitest';

import { prepareFcRuntimeRule } from './apply-runtime';

describe('协议系统编号访问约束', () => {
  it('仅服务端允许的草稿可以编辑编号，旧模板的固定锁不会阻止编辑', () => {
    const rule = [
      {
        type: 'input',
        field: 'agreementNo',
        props: { disabled: true, readonly: true },
      },
    ];
    const ctx = {
      pageEditable: true,
      fieldVisible: () => true,
      fieldEditable: () => true,
      agreementNoEditable: true,
    };
    expect(prepareFcRuntimeRule(rule, ctx)[0]!.props).toMatchObject({
      disabled: false,
      readonly: false,
    });
    expect(
      prepareFcRuntimeRule(rule, { ...ctx, agreementNoEditable: false })[0]!
        .props.disabled,
    ).toBe(true);
    expect(
      prepareFcRuntimeRule(rule, { ...ctx, fieldEditable: () => false })[0]!
        .props.disabled,
    ).toBe(true);
    expect(
      prepareFcRuntimeRule(rule, { ...ctx, pageEditable: false })[0]!.props
        .disabled,
    ).toBe(true);
  });
  it('旧模板与最大编辑权限均不能放开系统编号，其他字段仍可编辑', () => {
    const rule = [
      {
        type: 'row',
        children: [
          {
            type: 'input',
            field: 'agreementNo',
            props: {
              readonly: false,
              disabled: false,
              accessField: 'customAlias',
            },
          },
          {
            type: 'input',
            field: 'basic.agreementNo',
            props: { disabled: false },
          },
          { type: 'input', field: 'agreementName', props: { disabled: false } },
        ],
      },
    ];
    const result = prepareFcRuntimeRule(rule, {
      pageEditable: true,
      fieldVisible: () => true,
      fieldEditable: () => true,
    });
    expect(result[0]!.children[0].props.disabled).toBe(true);
    expect(result[0]!.children[1].props.disabled).toBe(true);
    expect(result[0]!.children[2].props.disabled).toBe(false);
    expect(rule[0]!.children[0]!.props.disabled).toBe(false);
  });
});
