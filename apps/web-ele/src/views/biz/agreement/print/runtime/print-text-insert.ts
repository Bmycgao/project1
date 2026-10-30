import { requireDefined } from '../../../../../../../shared/require-defined';

/** 查找光标所在的正文表达式，支持重新打开并替换完整 {{…}}。 */
export function locatePrintTextExpression(
  content: string,
  start: number,
  end = start,
) {
  for (const match of content.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const from = match.index;
    const to = from + match[0].length;
    if (start >= from && start < to && end <= to)
      return {
        start: from,
        end: to,
        expression: requireDefined(match[1]).trim(),
      };
  }
  return { start, end, expression: '' };
}

/** 显式选区不依赖弹窗打开后的焦点；字段与表达式统一自动包裹。 */
export function insertPrintTextExpression(
  content: string,
  expression: string,
  start: number,
  end = start,
) {
  const from = Math.max(0, Math.min(start, content.length));
  const to = Math.max(from, Math.min(end, content.length));
  const token = `{{${expression.trim()}}}`;
  return {
    content: content.slice(0, from) + token + content.slice(to),
    cursor: from + token.length,
  };
}
