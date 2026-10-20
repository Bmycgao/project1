/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { describe, expect, it, vi } from 'vitest';

import { buildDefaultFcRuleMap } from '../../shared/agreement-default-rules';
import { buildAgreementDemoStatusOptions } from '../../shared/agreement-demo-status';
import { findFcSchema } from './mock-fc-schema';

const { writePersistJson } = vi.hoisted(() => ({ writePersistJson: vi.fn() }));
vi.mock('./mock-persist', () => ({
  readPersistJson: () => ({
    schemas: [
      {
        id: 'CUSTOM_BASIC',
        name: '用户模板',
        kind: 'form',
        status: 1,
        rule: [
          {
            field: 'statusValue',
            options: [{ label: '自定义', value: 'custom' }],
          },
        ],
      },
      {
        id: 'FC_BASIC',
        name: '已调整的基础模板',
        kind: 'form',
        status: 1,
        rule: [
          { type: 'input', field: 'customTitle', title: '自定义字段' },
          {
            type: 'radio',
            field: 'statusValue',
            options: [{ label: '原有状态', value: 'custom' }],
          },
        ],
      },
    ],
  }),
  writePersistJson,
}));

describe('演示状态模板兼容', () => {
  it('旧版内置模板补齐状态选项，保留其他自定义内容', () => {
    const basic = findFcSchema('FC_BASIC')!;
    expect(basic.name).toBe('已调整的基础模板');
    expect(basic.rule[0]?.field).toBe('customTitle');
    expect(
      basic.rule.find((rule) => rule.field === 'statusValue')?.options,
    ).toEqual([
      { label: '原有状态', value: 'custom' },
      ...buildAgreementDemoStatusOptions(),
    ]);
    expect(writePersistJson).toHaveBeenCalledOnce();
  });

  it('不扩展用户自建模板的选项', () => {
    expect(findFcSchema('CUSTOM_BASIC')?.rule[0]?.options).toEqual([
      { label: '自定义', value: 'custom' },
    ]);
  });

  it('前端默认基础模板也包含草稿状态', () => {
    const rules = buildDefaultFcRuleMap();
    expect(
      rules.basic?.find((rule) => rule.field === 'statusValue')?.options,
    ).toContainEqual({ label: '草稿', value: '草稿' });
  });
});
