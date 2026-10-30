/** 使用向量条码，外框宽度与条高由模板决定，内容变化只改变条纹密度。 */
export async function buildPrintBarcode(
  value: string,
  options: Record<string, any>,
) {
  const mode = String(options.barcodeMode || 'CODE128').toUpperCase();
  if (!value.trim()) throw new Error('编码内容为空，请绑定有值的编号字段。');
  if (
    mode.startsWith('CODE128') &&
    [...value].some((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 127 && (code < 200 || code > 211);
    })
  ) {
    throw new Error('CODE128 不支持中文等字符，请绑定编号字段，或改用二维码。');
  }
  const { default: barcode } = await import('jsbarcode');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  let valid = true;
  try {
    barcode(svg, value, {
      format: mode,
      width: 1,
      height: 100,
      displayValue: false,
      // 留出左右静区，避免条码紧贴边缘。
      margin: 0,
      marginLeft: 10,
      marginRight: 10,
      valid: (result: boolean) => {
        valid = result;
      },
    });
  } catch {
    throw new Error(`${mode} 无法编码当前内容，请检查码制与字段值。`);
  }
  if (!valid) throw new Error(`${mode} 无法编码当前内容，请检查码制与字段值。`);
  const units = Number.parseFloat(svg.getAttribute('width') || '');
  if (!units) throw new Error(`${mode} 无法生成条码，请检查编码内容。`);
  svg.setAttribute('viewBox', `0 0 ${units} 100`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const width = Number(options.width) || 160;
  return {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`,
    warning:
      width / units < 0.5
        ? '当前内容较长，条纹较细；建议增加打印宽度或改用二维码，并验收打印后的扫码效果。'
        : '',
  };
}
