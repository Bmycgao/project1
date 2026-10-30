import { describe, expect, it, vi } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { renderDocument } from './document-renderer';
import { preparePrintTemplate } from './prepare-template';
import { buildPrintBarcode } from './print-barcode';

describe('条形码编码与尺寸', () => {
  it('不同内容保留左右静区、使用固定尺寸视窗，内容变化只影响密度', async () => {
    for (const value of ['PRINT-123', '12345678901234567890']) {
      const result = await buildPrintBarcode(value, { width: 160 });
      const svg = new DOMParser().parseFromString(
        decodeURIComponent(requireDefined(result.src.split(',')[1])),
        'image/svg+xml',
      ).documentElement;
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg.getAttribute('viewBox')).toMatch(/^0 0 \d+ 100$/);
      expect(svg.querySelector('g')?.getAttribute('transform')).toBe(
        'translate(10, 0)',
      );
    }
  });
  it('中文、空值、不符合码制的内容给出具体错误，长内容提示加宽', async () => {
    await expect(buildPrintBarcode('张三', {})).rejects.toThrow('不支持中文');
    await expect(buildPrintBarcode('', {})).rejects.toThrow('编码内容为空');
    await expect(
      buildPrintBarcode('ABC', { barcodeMode: 'EAN13' }),
    ).rejects.toThrow('EAN13 无法编码');
    const responseValue1 = await buildPrintBarcode('X'.repeat(80), {
      width: 160,
    });
    expect(responseValue1.warning).toContain('增加打印宽度');
  });
});

async function render(
  elements: any[],
  data: Record<string, unknown> = {},
  design = false,
) {
  const fonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  const decode = vi
    .spyOn(HTMLImageElement.prototype, 'decode')
    .mockResolvedValue();
  try {
    const prepared = preparePrintTemplate(
      {
        agreeLayout: 'document-flow',
        panels: [{ width: 210, height: 297, printElements: elements }],
      },
      data as any,
    );
    return await renderDocument(prepared.template, prepared.printData, {
      design,
    });
  } finally {
    decode.mockRestore();
    if (fonts) Object.defineProperty(document, 'fonts', fonts);
    else Reflect.deleteProperty(document, 'fonts');
  }
}

describe('线条与条形码的画布、打印共用渲染', () => {
  it('竖线与横线仅有一条边，矩形保留四边，支持细线设置', async () => {
    const root = await render(
      ['vline', 'hline', 'rect'].map((type, index) => ({
        printElementType: { type },
        options: {
          left: 20,
          top: 20 + index * 150,
          width: 100,
          height: 100,
          borderWidth: 0.25,
        },
      })),
    );
    const vertical = requireDefined(
      root.querySelector<HTMLElement>('[data-doc-type="vline"] > div'),
    );
    expect(vertical.style.borderLeftWidth).toBe('0.25pt');
    expect(vertical.style.borderRightWidth).toBe('');
    expect(vertical.style.borderTopWidth).toBe('');
    const horizontal = requireDefined(
      root.querySelector<HTMLElement>('[data-doc-type="hline"] > div'),
    );
    expect(horizontal.style.borderTopWidth).toBe('0.25pt');
    expect(horizontal.style.borderBottomWidth).toBe('');
    expect(
      requireDefined(
        root.querySelector<HTMLElement>('[data-doc-type="rect"] > div'),
      ).style.borderRightWidth,
    ).toBeTruthy();
  });
  it('切换字段后外框宽度和条高相同，非法内容仅在设计态展示提示、打印报错', async () => {
    const element = {
      printElementType: { type: 'text' },
      options: {
        field: 'code',
        textType: 'barcode',
        title: '条形码',
        width: 160,
        height: 40,
        left: 20,
        top: 20,
      },
    };
    for (const code of ['P-123', '12345678901234567890']) {
      const root = await render([element], { code });
      const image = requireDefined(
        root.querySelector<HTMLImageElement>('[data-doc-barcode]'),
      );
      expect(image.style.width).toBe('160pt');
      expect(image.style.height).toBe('40pt');
    }
    const root = await render([element], { code: '中文' }, true);
    expect(root.querySelector('[data-doc-code-error]')?.textContent).toContain(
      '不支持中文',
    );
    await expect(render([element], { code: '中文' })).rejects.toThrow(
      '条形码：CODE128',
    );
  });
});
