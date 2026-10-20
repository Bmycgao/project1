/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { describe, expect, it } from 'vitest';

import { buildDefaultBasicModuleInner } from '../web-ele/src/views/biz/agreement/config/module-inner-config';
import { buildDefaultFcRuleMap } from './agreement-default-rules';
import {
  agreementStatusFilterOptions,
  agreementStatusTagType,
  appendAgreementStatusOptions,
  buildAgreementDemoStatusOptions,
} from './agreement-demo-status';

describe('协议演示状态展示', () => {
  it('列表、默认 FC 表单和备用表单使用同一组选项，包括所有种子记录状态', () => {
    const expected = buildAgreementDemoStatusOptions();
    const fc = buildDefaultFcRuleMap().basic?.find(
      (item) => item.field === 'statusValue',
    );
    const field = buildDefaultBasicModuleInner()
      .sections.flatMap((section) => section.fields)
      .find((item) => item.key === 'statusValue');
    expect(fc?.options).toEqual(expected);
    expect(field?.options).toEqual(expected);
    expect(agreementStatusFilterOptions()).toEqual(
      expected.map((item) => item.value),
    );
    expect(expected).toContainEqual({
      label: '项目经理已审核',
      value: '项目经理已审核',
    });
    // 不能在没有业务映射规则时把两个历史值偷偷合并。
    expect(expected).toContainEqual({ label: '已签约', value: '已签约' });
    expect(expected).toContainEqual({
      label: '签约已确认',
      value: '签约已确认',
    });
  });

  it('未知历史值可筛选，但不会扩展显式配置的场景范围', () => {
    expect(
      agreementStatusFilterOptions(undefined, ['旧系统状态', '', '旧系统状态']),
    ).toEqual([...agreementStatusFilterOptions(), '旧系统状态']);
    expect(
      agreementStatusFilterOptions(['待复核'], ['旧系统状态', '已签约']),
    ).toEqual(['待复核']);
  });

  it('补充当前值时保留自定义标签和属性，不修改模板或重复添加', () => {
    const source = [{ label: '已调整的标题', value: '草稿', disabled: true }];
    const options = appendAgreementStatusOptions(source, [
      '草稿',
      '旧系统状态',
      '旧系统状态',
    ]);
    expect(options).toEqual([
      ...source,
      { label: '旧系统状态', value: '旧系统状态' },
    ]);
    expect(source).toHaveLength(1);
    options[0]!.label = '其他标题';
    expect(source[0]!.label).toBe('已调整的标题');
  });

  it('旧值颜色一致，未知文案不按“通过”“锁定”等字眼猜测含义', () => {
    expect(agreementStatusTagType('签约已确认')).toBe('success');
    expect(agreementStatusTagType('已签约')).toBe('success');
    expect(agreementStatusTagType('项目经理已审核')).toBe('warning');
    expect(agreementStatusTagType('自定义通过或锁定')).toBe('info');
    expect(agreementStatusTagType('')).toBe('info');
  });
});
