import { requireDefined } from '../../../../../../../shared/require-defined';

/** 参数输入只生成现有 DSL，不增加另一套计算规则。 */
export type PrintLiteralType = 'boolean' | 'number' | 'text';
export function serializePrintLiteral(type: PrintLiteralType, value: string) {
  if (type === 'text') return JSON.stringify(value);
  if (type === 'boolean') return ['false', 'true'].includes(value) ? value : '';
  const code = value.trim();
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(code) &&
    Number.isFinite(Number(code))
    ? code
    : '';
}

export interface PrintConditionRow {
  field: string;
  operator: string;
  value: string;
}
export const PRINT_CONDITION_OPERATORS = [
  { value: '==', label: '等于' },
  { value: '!=', label: '不等于' },
  { value: '>', label: '大于' },
  { value: '>=', label: '大于等于' },
  { value: '<', label: '小于' },
  { value: '<=', label: '小于等于' },
  { value: 'empty', label: '为空' },
  { value: 'not-empty', label: '不为空' },
  { value: 'contains', label: '包含文字' },
  { value: 'not-contains', label: '不包含文字' },
  { value: 'true', label: '为真' },
  { value: 'false', label: '为假' },
];
export function printConditionNeedsValue(operator: string) {
  return !['empty', 'false', 'falsy', 'not-empty', 'true', 'truthy'].includes(
    operator,
  );
}
export function compilePrintCondition(
  rows: PrintConditionRow[],
  relation: 'and' | 'or',
) {
  const clauses = rows.map(({ field, operator, value }) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(field)) return '';
    if (operator === 'truthy') return field;
    if (operator === 'falsy') return `!${field}`;
    if (operator === 'empty') return `EMPTY(${field})`;
    if (operator === 'not-empty') return `!EMPTY(${field})`;
    if (operator === 'true' || operator === 'false')
      return `${field} == ${operator}`;
    if (!value.trim()) return '';
    if (operator === 'contains' || operator === 'not-contains')
      return `${operator === 'not-contains' ? '!' : ''}CONTAINS(${field}, ${value})`;
    if (!['!=', '<', '<=', '==', '>', '>='].includes(operator)) return '';
    // 右侧可能是三元或复合公式，括号避免比较运算改变其含义。
    const simple =
      /^(?:[A-Za-z_$][\w$]*|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/i.test(
        value.trim(),
      );
    return `${field} ${operator} ${simple ? value : `(${value})`}`;
  });
  if (clauses.length === 0 || clauses.some((clause) => !clause)) return '';
  return clauses.length === 1
    ? requireDefined(clauses[0])
    : clauses
        .map((clause) => `(${clause})`)
        .join(relation === 'and' ? ' && ' : ' || ');
}

/** 只回填可无损表达的条件；复杂公式保留在公式编辑中。 */
export function parsePrintCondition(source: string): null | {
  relation: 'and' | 'or';
  rows: PrintConditionRow[];
} {
  function topOperators(code: string) {
    const result: Array<{ index: number; token: string }> = [];
    let depth = 0;
    let quote = '';
    for (let i = 0; i < code.length; i++) {
      const char = requireDefined(code[i]);
      if (quote) {
        if (char === '\\') i++;
        else if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '(') depth++;
      else if (char === ')') {
        depth--;
        if (depth < 0) return null;
      } else if (!depth && ['&&', '||'].includes(code.slice(i, i + 2))) {
        result.push({ index: i, token: code.slice(i, i + 2) });
        i++;
      }
    }
    return depth || quote ? null : result;
  }
  function unwrap(code: string): string {
    let value = code.trim();
    while (
      value.startsWith('(') &&
      value.endsWith(')') &&
      topOperators(value.slice(1, -1)) !== null
    )
      value = value.slice(1, -1).trim();
    return value;
  }
  const code = unwrap(source);
  if (!code) return { relation: 'and', rows: [] };
  const operators = topOperators(code);
  if (!operators || new Set(operators.map((item) => item.token)).size > 1)
    return null;
  const clauses: string[] = [];
  let start = 0;
  for (const item of operators) {
    clauses.push(code.slice(start, item.index));
    start = item.index + 2;
  }
  clauses.push(code.slice(start));
  const rows: PrintConditionRow[] = [];
  for (const clause of clauses) {
    const value = unwrap(clause);
    if (!topOperators(value) || requireDefined(topOperators(value)).length > 0)
      return null;
    let match = /^(!?)EMPTY\(\s*([A-Za-z_$][\w$]*)\s*\)$/i.exec(value);
    if (match)
      rows.push({
        field: requireDefined(match[2]),
        operator: match[1] ? 'not-empty' : 'empty',
        value: '',
      });
    else if (
      (match = /^(!?)CONTAINS\(\s*([A-Za-z_$][\w$]*)\s*,\s*(.+)\)$/i.exec(
        value,
      ))
    )
      rows.push({
        field: requireDefined(match[2]),
        operator: match[1] ? 'not-contains' : 'contains',
        value: requireDefined(match[3]),
      });
    else if (
      (match = /^([A-Za-z_$][\w$]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(value))
    ) {
      // 括号里的混合逻辑只能交给公式编辑，避免改写优先级。
      const rawRhs = requireDefined(match[3]).trim();
      const atom =
        /^(?:[A-Za-z_$][\w$]*|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/i;
      if (
        !atom.test(rawRhs) &&
        !(
          rawRhs.startsWith('(') &&
          rawRhs.endsWith(')') &&
          topOperators(rawRhs.slice(1, -1)) !== null
        )
      )
        return null;
      const rhs = unwrap(rawRhs);
      if (
        !topOperators(rhs) ||
        requireDefined(topOperators(rhs)).length > 0 ||
        /[?]/.test(rhs)
      )
        return null;
      rows.push({
        field: requireDefined(match[1]),
        operator: requireDefined(match[2]),
        value: rhs,
      });
    } else return null;
  }
  return { relation: operators[0]?.token === '||' ? 'or' : 'and', rows };
}
