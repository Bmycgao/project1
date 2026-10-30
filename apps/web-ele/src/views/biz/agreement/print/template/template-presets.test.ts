import { describe, expect, it } from 'vitest';

import { buildDesignerSamplePrintData } from '../data/sample-print-data';
import { normalizeDesignerTemplate } from '../designer/normalize-designer-template';
import { preparePrintTemplate } from '../runtime/prepare-template';
import {
  createPrintTemplatePreset,
  PRINT_TEMPLATE_PRESETS,
  readPrintTemplatePreset,
} from './template-presets';

describe('统一起始版式', () => {
  it('仅提供完整示例与空白，旧标记只映射选择项，不修改原模板', () => {
    expect(PRINT_TEMPLATE_PRESETS.map((item) => item.value)).toEqual([
      'example',
      'blank',
    ]);
    for (const marker of ['business', 'demo', 'example', undefined]) {
      const old = {
        agreeTemplatePreset: marker,
        panels: [{ printElements: [] }],
      };
      const snapshot = structuredClone(old);
      expect(readPrintTemplatePreset(old)).toBe('example');
      expect(old).toEqual(snapshot);
    }
    expect(readPrintTemplatePreset(createPrintTemplatePreset('blank'))).toBe(
      'blank',
    );
  });

  it('示例包含两个区段、条形码、多层表头、合计、固定表单和条件正文，不预设筛行', () => {
    const template = normalizeDesignerTemplate(
      createPrintTemplatePreset('example'),
    );
    expect(template.panels).toHaveLength(2);
    const elements = template.panels.flatMap(
      (panel: any) => panel.printElements,
    );
    expect(elements.some((el: any) => el.options.textType === 'qrcode')).toBe(
      false,
    );
    expect(
      elements.find((el: any) => el.options.textType === 'barcode')?.options,
    ).toMatchObject({ field: 'barcodeContent', barAutoWidth: false });
    expect(elements.every((el: any) => !el.options.agreeRowFilter)).toBe(true);
    const compensation = elements.find(
      (el: any) => el.options.field === 'compensationItems',
    );
    expect(compensation.options.columns).toHaveLength(2);
    expect(
      compensation.options.columns
        .flat()
        .some((col: any) => col.tableSummary === 'sum'),
    ).toBe(true);
    const form = elements.find((el: any) => el.options.agreeFormGrid);
    expect(
      form.options.agreeFormGrid.rows.every((row: any) => !row.source),
    ).toBe(true);
    const text = elements.find(
      (el: any) => el.printElementType.type === 'longText',
    );
    expect(text.options.agreeTextSections).toHaveLength(2);
    expect(text.options.agreeTextSections[1].when).toBe(
      'COUNT(rewardItems) > 0',
    );

    const data = buildDesignerSamplePrintData();
    const prepared = preparePrintTemplate(template, data);
    expect(prepared.template.panels).toHaveLength(2);
    expect(JSON.stringify(prepared.template)).not.toContain('NaN');
    expect(data.compensationItems.length).toBeGreaterThan(30);
  });

  it('空白只保留一张空纸；修改副本不污染默认示例', () => {
    const blank = createPrintTemplatePreset('blank');
    expect(blank.panels).toHaveLength(1);
    expect(blank.panels[0]).toMatchObject({
      width: 210,
      height: 297,
      printElements: [],
    });
    const template = createPrintTemplatePreset('example');
    template.panels[0].printElements.length = 0;
    expect(
      createPrintTemplatePreset('example').panels[0].printElements.length,
    ).toBeGreaterThan(0);
  });
});
