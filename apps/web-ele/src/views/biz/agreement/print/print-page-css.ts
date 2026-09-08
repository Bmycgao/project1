/**
 * 按模板纸面毫米写入 @page size，避免浏览器默认 A4 竖裁切横版/A3
 */

const STYLE_ID = 'agree-print-page-size';

/**
 * 注入或更新 @page { size: Wmm Hmm }
 * @param widthMm 纸宽
 * @param heightMm 纸高
 */
export function applyPrintPageSizeCss(widthMm: number, heightMm: number) {
  if (typeof document === 'undefined') return;
  const w = Math.max(50, Number(widthMm) || 210);
  const h = Math.max(50, Number(heightMm) || 297);
  let el = document.querySelector(`#${STYLE_ID}`) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.append(el);
  }
  el.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
}

/**
 * 按模板第一页写 @page
 * @param template 模板 JSON
 */
export function applyPrintPageSizeFromTemplate(
  template: null | Record<string, any> | undefined,
) {
  const panel = template?.panels?.[0];
  applyPrintPageSizeCss(
    Number(panel?.width) || 210,
    Number(panel?.height) || 297,
  );
}

/**
 * 预览容器按纸宽缩小，避免 A3 超出弹窗被裁成一条
 * @param host 预览根节点
 * @param widthMm 纸宽
 */
export function fitPrintPreviewHost(
  host: HTMLElement | null | undefined,
  widthMm: number,
) {
  if (!host) return;
  host.style.zoom = '1';
  const maxW = Math.max(160, host.clientWidth - 8);
  const paper = host.querySelector('.hiprint-printPaper') as HTMLElement | null;
  const paperPx =
    paper?.getBoundingClientRect().width ||
    (Math.max(50, Number(widthMm) || 210) * 96) / 25.4;
  const zoom = Math.min(1, maxW / Math.max(1, paperPx));
  host.style.zoom = String(Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
}

/**
 * 把 getHtml() 生成的每个预览页补足为模板的完整纸高，并分开相邻纸张。
 * hiprint 会按最后一个元素裁短 HTML 纸面，但系统打印仍使用完整 @page；若不
 * 归一化，画布/打印是两张 A4，快速预览却会看起来像一张连续长纸。
 *
 * 这里只改 getHtml() 返回的临时 DOM，不改模板 JSON，也不会进入打印窗口。
 */
export function normalizePrintPreviewPages(
  host: HTMLElement | null | undefined,
  heightMm: number,
) {
  if (!host) return;
  const pageHeight = (Math.max(50, Number(heightMm) || 297) * 96) / 25.4;
  const papers = [...host.querySelectorAll<HTMLElement>('.hiprint-printPaper')];
  let previousPanel: HTMLElement | null = null;
  for (const [index, paper] of papers.entries()) {
    paper.style.minHeight = `${pageHeight}px`;
    paper.style.backgroundColor = '#fff';
    const panel = paper.closest<HTMLElement>('.hiprint-printPanel');
    if (panel) panel.style.minHeight = `${pageHeight}px`;
    if (index > 0) {
      if (panel && panel !== previousPanel) panel.style.marginTop = '14px';
      else paper.style.marginTop = '14px';
    }
    previousPanel = panel;
  }
}
