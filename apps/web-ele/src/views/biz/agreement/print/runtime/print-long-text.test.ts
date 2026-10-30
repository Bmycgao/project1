import { describe, expect, it } from 'vitest';

import { resolveTextPreview } from '../designer/template-model';
import { preparePrintTemplate } from './prepare-template';
import {
  normalizePrintTextSectionGap,
  resolvePrintTextBlocks,
  resolvePrintTextSections,
  resolvePrintTextTemplate,
} from './print-long-text';

describe('conditional long text', () => {
  const sections = [
    { content: '甲方：{{name}}', when: '' },
    { content: '高额条款\n金额 {{amount}} 元', when: 'amount > 500000' },
    { content: '普通条款', when: 'amount <= 500000' },
  ];
  it('accepts zero and positive gaps while keeping missing or invalid values at the legacy default', () => {
    expect(normalizePrintTextSectionGap(0)).toBe(0);
    expect(normalizePrintTextSectionGap('6.5')).toBe(6.5);
    for (const gap of [undefined, null, '', -1, Number.NaN, Infinity, 'bad'])
      expect(normalizePrintTextSectionGap(gap)).toBeUndefined();
  });
  it('omits hidden and empty blocks while preserving manual newlines inside visible blocks', () => {
    expect(
      resolvePrintTextBlocks(
        [
          { content: '甲\n\n乙', when: '' },
          { content: '隐藏', when: 'false' },
          { content: '{{missing}}', when: '' },
          { content: '  \n ', when: '' },
          { content: '丙', when: '' },
        ],
        {},
      ),
    ).toEqual(['甲\n\n乙', '丙']);
  });
  it.each([0, 6.5])(
    'prepares independent block data for custom gap %s without rewriting the saved template',
    (gap) => {
      const template = {
        agreeLayout: 'document-flow',
        panels: [
          {
            printElements: [
              {
                printElementType: { type: 'longText' },
                options: {
                  agreeTextSections: sections,
                  agreeTextSectionGap: gap,
                },
              },
            ],
          },
        ],
      };
      const snapshot = JSON.stringify(template);
      const result = preparePrintTemplate(template, {
        amount: 600_000,
        name: '张三',
      } as any);
      const options = result.template.panels[0].printElements[0].options;
      expect(options.__agreeTextBlocks).toEqual([
        '甲方：张三',
        '高额条款\n金额 600000 元',
      ]);
      expect(
        (result.printData as unknown as Record<string, unknown>)[options.field],
      ).toBe('甲方：张三\n高额条款\n金额 600000 元');
      expect(options.agreeTextSectionGap).toBe(gap);
      expect(JSON.stringify(template)).toBe(snapshot);
    },
  );
  it('selects clauses from parameters and preserves paragraph breaks', () => {
    expect(
      resolvePrintTextSections(sections, { amount: 600_000, name: '张三' }),
    ).toBe('甲方：张三\n\n高额条款\n金额 600000 元');
    expect(
      resolvePrintTextSections(sections, { amount: 500_000, name: '张三' }),
    ).toBe('甲方：张三\n\n普通条款');
    expect(
      resolvePrintTextSections([{ content: '隐藏', when: 'false' }], {}),
    ).toBe('');
  });
  it('supports multiple variables and conditional expressions in one sentence', () => {
    expect(
      resolvePrintTextTemplate(
        '甲方 {{compensatee}}，奖励金额 {{IF(rewardTotal > 0, FORMAT_MONEY(rewardTotal), "0.00")}} 元。',
        {
          compensatee: '张三',
          rewardTotal: 130_000,
        },
      ),
    ).toBe('甲方 张三，奖励金额 130,000.00 元。');
    expect(
      resolvePrintTextTemplate('编号 {{agreementNo}} / {{missingField}}', {
        agreementNo: 'A-001',
      }),
    ).toBe('编号 A-001 / ');
  });
  it('compares original numbers even when another text formats that field as money', () => {
    const result = preparePrintTemplate(
      {
        panels: [
          {
            printElements: [
              {
                printElementType: { type: 'text' },
                options: { field: 'amount', agreeFormat: 'money' },
              },
              {
                printElementType: { type: 'longText' },
                options: { agreeTextSections: sections },
              },
            ],
          },
        ],
      },
      { amount: 600_000, name: '张三' } as any,
    );
    expect(
      resolveTextPreview(
        result.template.panels[0].printElements[1].options,
        result.printData,
      ),
    ).toBe('甲方：张三\n\n高额条款\n金额 600000 元');
  });
  it('prepares isolated values shared by canvas and formal printing without changing saved template or data', () => {
    const element = (content: string) => ({
      printElementType: { type: 'longText' },
      options: {
        field: 'name',
        top: 100,
        agreeTextSections: [{ content, when: '' }],
      },
    });
    const template = {
      panels: [
        {
          printElements: [
            element('第一段 {{name}}'),
            element('第二段 {{name}}'),
          ],
        },
      ],
    };
    const data = { name: '张三' } as any;
    const result = preparePrintTemplate(template, data);
    const [first, second] = result.template.panels[0].printElements;
    expect(resolveTextPreview(first.options, result.printData)).toBe(
      '第一段 张三',
    );
    expect(resolveTextPreview(second.options, result.printData)).toBe(
      '第二段 张三',
    );
    expect(first.options.field).not.toBe(second.options.field);
    expect(template.panels[0]?.printElements[0]?.options.field).toBe('name');
    expect(data).toEqual({ name: '张三' });
  });
});
