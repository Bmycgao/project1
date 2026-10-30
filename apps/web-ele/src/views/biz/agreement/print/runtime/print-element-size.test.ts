import { expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { listPrintElements } from '../template/print-element-meta';
import { toDocumentTemplate } from './document-layout';
import { patchPrintElementSize } from './print-element-size';

it('调整尺寸同步文档流占位，不修改绑定字段和原模板，超出纸面宽度时限制实际尺寸', () => {
  const original = toDocumentTemplate({
    panels: [
      {
        width: 210,
        height: 297,
        printElements: [
          {
            printElementType: { type: 'text' },
            options: {
              field: 'code',
              textType: 'barcode',
              width: 160,
              height: 40,
              left: 20,
              top: 20,
            },
          },
        ],
      },
    ],
  });
  const selected = requireDefined(listPrintElements(original)[0]);
  const actualWidths: number[] = [];
  for (const width of [100, 200, 1000]) {
    const next = patchPrintElementSize(original, selected, {
      width,
      height: 50,
    });
    const options = next.panels[0].printElements[0].options;
    actualWidths.push(options.width);
    expect(options.field).toBe('code');
    expect(options.height).toBe(50);
    expect(options.width).toBeCloseTo(
      (((210 * 72) / 25.4 - 40) * options.agreeDocument.width) / 100,
    );
    expect(options.width).toBeLessThanOrEqual((210 * 72) / 25.4 - 40);
  }
  expect(actualWidths[1]).toBeGreaterThan(requireDefined(actualWidths[0]));
  expect(actualWidths[2]).toBeGreaterThan(requireDefined(actualWidths[1]));
  expect(original.panels[0].printElements[0].options.width).toBe(160);
});
