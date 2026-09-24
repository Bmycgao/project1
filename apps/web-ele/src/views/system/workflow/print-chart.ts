const PRINT_COLORS: Record<string, string> = {
  '--el-bg-color': '#ffffff',
  '--el-text-color-primary': '#1f2937',
  '--el-text-color-secondary': '#64748b',
  '--el-border-color': '#dcdfe6',
};

/** 打印页没有主题变量，把 var(--el-*) 换成固定颜色 */
export function replacePrintColors(value: string) {
  return value.replace(
    /var\((--[\w-]+)\)/g,
    (_all, name: string) => PRINT_COLORS[name] || '#64748b',
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;',
  );
}

/**
 * 把流程图 SVG 排进横向纸张并调起打印
 * @param source 设计器或运行图上的 svg
 * @param meta 标题、说明、图例；viewBox 用于去掉画布缩放后仍打全图
 */
export function printWorkflowChart(
  source: SVGSVGElement,
  meta: {
    title: string;
    subtitle?: string;
    legend?: string;
    viewBox?: string;
  },
) {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.querySelector('rect[width="100%"]')?.remove();
  // 只去掉设计器画布的缩放层；办理页节点自身的 translate 不能清掉
  clone.querySelector('g[transform*="scale"]')?.removeAttribute('transform');
  clone.querySelectorAll('.port, path[pointer-events="none"]').forEach((el) => {
    el.remove();
  });
  const paint = (el: Element) => {
    for (const attr of [...el.attributes]) {
      if (attr.value.includes('var('))
        el.setAttribute(attr.name, replacePrintColors(attr.value));
    }
    for (const child of [...el.children]) paint(child);
  };
  paint(clone);
  const viewBox =
    meta.viewBox || clone.getAttribute('viewBox') || '0 0 800 400';
  const [, , vbWidth = 800, vbHeight = 400] = viewBox
    .split(/[\s,]+/)
    .map(Number);
  const pageWidth = 1000;
  const pageHeight = Math.max(
    180,
    Math.round((vbHeight / Math.max(vbWidth, 1)) * pageWidth),
  );
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', viewBox);
  clone.setAttribute('width', String(pageWidth));
  clone.setAttribute('height', String(pageHeight));
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  const frame = document.createElement('iframe');
  // 必须有实际宽高，宽高为 0 时打印出来的图是空白
  frame.setAttribute(
    'style',
    'position:fixed;left:-1300px;top:0;width:1120px;height:794px;border:0',
  );
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error('无法打开打印页');
  }
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { margin: 0; color: #1f2937; font-family: "Microsoft YaHei", sans-serif; }
  h1 { margin: 0 0 4px; font-size: 18px; font-weight: 650; }
  p { margin: 0 0 8px; font-size: 12px; color: #64748b; }
  svg { width: 100%; height: auto; }
</style>
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  ${meta.subtitle ? `<p>${escapeHtml(meta.subtitle)}</p>` : ''}
  ${meta.legend ? `<p>${escapeHtml(meta.legend)}</p>` : ''}
  ${clone.outerHTML}
</body>
</html>`);
  doc.close();
  const cleanup = () => frame.remove();
  win.addEventListener('afterprint', cleanup);
  win.setTimeout(() => win.print(), 50);
  win.setTimeout(cleanup, 60_000);
}
