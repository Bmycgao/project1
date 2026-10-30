/** 函数的用户说明与参数定义；所有表达式入口共用。 */
export interface PrintExprParameter {
  label: string;
  kind?: 'column' | 'condition' | 'format' | 'table';
  initial?: string;
}

export interface PrintExprFunction {
  name: string;
  title: string;
  group: string;
  description: string;
  parameters: PrintExprParameter[];
  example: string;
  result: string;
  /** 可继续添加参数，标签按此列表循环。 */
  repeat?: string[];
}

function fn(
  name: string,
  title: string,
  group: string,
  description: string,
  parameters: Array<PrintExprParameter | string>,
  example: string,
  repeat?: string[],
): PrintExprFunction {
  let result = '数字';
  if (['COALESCE', 'IF', 'IFS'].includes(name)) result = '取决于所选结果值';
  else if (['条件', '空值与包含'].includes(group)) result = '真 / 假';
  else if (group === '文本与格式' && name !== 'LEN') result = '文字';
  return {
    name,
    title,
    group,
    description,
    example,
    result,
    repeat,
    parameters: parameters.map((p, index) =>
      typeof p === 'string'
        ? {
            label: p,
            kind:
              ['AND', 'NOT', 'OR'].includes(name) ||
              (['IF', 'IFS'].includes(name) && index === 0)
                ? 'condition'
                : undefined,
          }
        : p,
    ),
  };
}

const digits = { label: '小数位（0～4）', initial: '2' };
const table = { label: '数据表', kind: 'table' } as const;
const column = { label: '统计字段', kind: 'column' } as const;

export const PRINT_EXPR_FUNCTIONS: PrintExprFunction[] = [
  fn(
    'IF',
    '条件取值',
    '条件',
    '条件为真时返回第二个参数，否则返回第三个参数。可在参数中嵌套其它函数。',
    ['条件', '成立时的值', '不成立时的值'],
    'IF(100 > 0, "有补偿", "无补偿")',
  ),
  fn(
    'IFS',
    '多条件取值',
    '条件',
    '按顺序使用第一组成立条件的结果；最后的默认值可选。添加条件时会插入一对条件与结果。',
    ['条件 1', '结果 1', { label: '默认值', initial: '""' }],
    'IFS(100 > 200, "高", 100 > 0, "低", "无")',
    ['条件', '结果'],
  ),
  fn(
    'AND',
    '同时满足',
    '条件',
    '所有条件都为真时返回真。',
    ['条件 1', '条件 2'],
    'AND(100 > 0, !EMPTY("张三"))',
    ['条件'],
  ),
  fn(
    'OR',
    '满足任一',
    '条件',
    '任一条件为真时返回真。',
    ['条件 1', '条件 2'],
    'OR(100 > 0, 200 > 0)',
    ['条件'],
  ),
  fn(
    'NOT',
    '条件取反',
    '条件',
    '将真变为假，将假变为真。',
    ['条件'],
    'NOT(100 > 0)',
  ),
  fn(
    'IN',
    '属于候选值',
    '条件',
    '判断值是否等于任一候选值，按文字比较。',
    ['判断值', '候选值 1', '候选值 2'],
    'IN("住宅", "住宅", "商业")',
    ['候选值'],
  ),
  fn(
    'NOT_IN',
    '不属于候选值',
    '条件',
    '判断值是否不在这些候选值中。',
    ['判断值', '候选值 1', '候选值 2'],
    'NOT_IN("住宅", "商业", "工业")',
    ['候选值'],
  ),
  fn(
    'EMPTY',
    '是否为空',
    '空值与包含',
    '值为 null、未定义或空文字时返回真；0 不算空。',
    ['值'],
    'EMPTY("")',
  ),
  fn(
    'CONTAINS',
    '文字包含',
    '空值与包含',
    '判断文字是否包含指定片段。',
    ['文字', '片段'],
    'CONTAINS("房屋补偿", "补偿")',
  ),
  fn(
    'COALESCE',
    '空值兜底',
    '空值与包含',
    '返回第一个非空值；0 会保留。',
    ['值', { label: '兜底值', initial: '"无"' }],
    'COALESCE("", "无")',
    ['备用值'],
  ),
  fn(
    'ROUND',
    '四舍五入',
    '数字',
    '将数字四舍五入到指定小数位。',
    ['值', { label: '小数位', initial: '2' }],
    'ROUND(12.345, 2)',
  ),
  fn('ABS', '绝对值', '数字', '返回数字的绝对值。', ['值'], 'ABS(-12)'),
  fn(
    'CEIL',
    '向上取整',
    '数字',
    '返回不小于此值的最小整数。',
    ['值'],
    'CEIL(1.2)',
  ),
  fn(
    'FLOOR',
    '向下取整',
    '数字',
    '返回不大于此值的最大整数。',
    ['值'],
    'FLOOR(1.8)',
  ),
  fn(
    'MIN',
    '最小值',
    '数字',
    '返回多个数字中的最小值。',
    ['值 1', '值 2'],
    'MIN(10, 20)',
    ['值'],
  ),
  fn(
    'MAX',
    '最大值',
    '数字',
    '返回多个数字中的最大值。',
    ['值 1', '值 2'],
    'MAX(10, 20)',
    ['值'],
  ),
  fn(
    'POW',
    '乘方',
    '数字',
    '计算底数的指定次方。',
    ['底数', '指数'],
    'POW(2, 3)',
  ),
  fn('SQRT', '平方根', '数字', '计算非负数字的平方根。', ['值'], 'SQRT(9)'),
  fn('MOD', '取余', '数字', '计算除法余数。', ['值', '除数'], 'MOD(10, 3)'),
  fn(
    'CLAMP',
    '限制范围',
    '数字',
    '把数字限制在最小值和最大值之间。',
    ['值', '最小值', '最大值'],
    'CLAMP(20, 0, 10)',
  ),
  fn(
    'NUMBER',
    '转换为数字',
    '数字',
    '转为数字，转换失败时使用兜底值。',
    ['值', { label: '兜底值', initial: '0' }],
    'NUMBER("12", 0)',
  ),
  fn(
    'CONCAT',
    '拼接文字',
    '文本与格式',
    '按顺序拼接字段与文字。',
    ['内容 1', '内容 2'],
    'CONCAT("协议", "编号")',
    ['内容'],
  ),
  fn(
    'LEN',
    '文字长度',
    '文本与格式',
    '返回文字的长度。',
    ['文字'],
    'LEN("协议")',
  ),
  fn(
    'UPPER',
    '转为大写',
    '文本与格式',
    '将英文字母转换为大写。',
    ['文字'],
    'UPPER("abc")',
  ),
  fn(
    'LOWER',
    '转为小写',
    '文本与格式',
    '将英文字母转换为小写。',
    ['文字'],
    'LOWER("ABC")',
  ),
  fn(
    'FORMAT_MONEY',
    '金额格式',
    '文本与格式',
    '显示千位分隔符和指定小数位，返回文字。',
    ['金额', digits],
    'FORMAT_MONEY(12345.6, 2)',
  ),
  fn(
    'FORMAT_DATE',
    '日期格式',
    '文本与格式',
    '按选择的日期格式显示，返回文字。',
    ['日期', { label: '格式', kind: 'format', initial: '"date"' }],
    'FORMAT_DATE("2026-03-15", "dateCn")',
  ),
  fn(
    'COUNT',
    '表格行数',
    '表统计',
    '返回数据源中的行数，使用原始数据，不随打印筛行变化。',
    [table],
    'COUNT(rewardItems)',
  ),
  fn(
    'SUM',
    '字段合计',
    '表统计',
    '汇总数据表中指定字段，使用原始数据，不随打印筛行变化。',
    [table, column],
    'SUM(rewardItems, "amount")',
  ),
  fn(
    'AVG',
    '字段平均值',
    '表统计',
    '计算数据表中指定字段的平均值。',
    [table, column],
    'AVG(rewardItems, "amount")',
  ),
  fn(
    'MAX_COL',
    '字段最大值',
    '表统计',
    '获取数据表中指定字段的最大值。',
    [table, column],
    'MAX_COL(rewardItems, "amount")',
  ),
  fn(
    'MIN_COL',
    '字段最小值',
    '表统计',
    '获取数据表中指定字段的最小值。',
    [table, column],
    'MIN_COL(rewardItems, "amount")',
  ),
];

export function printExprFunctionTemplate(item: PrintExprFunction) {
  return `${item.name}(${item.parameters.map((p) => p.initial || '').join(', ')})`;
}

/** IFS 的默认值可以留空，其他参数必须完整，避免生成缺参公式。 */
export function buildPrintFunctionExpression(
  item: PrintExprFunction,
  values: string[],
) {
  const args = values.map((value) => value.trim());
  if (item.name === 'IFS' && args.length % 2 === 1 && !args.at(-1)) args.pop();
  if (args.some((value) => !value)) return '';
  return `${item.name}(${args.join(', ')})`;
}
