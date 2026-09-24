/** Small, non-evaluating parser: comparisons, &&, ||, ! and parentheses only. */
type Token = { kind: 'field' | 'op' | 'value'; value: unknown };
export function evaluateCondition(
  source: string,
  data: Record<string, unknown>,
  validateOnly = false,
  allowedFields?: ReadonlySet<string>,
): boolean {
  if (source.length > 1000) throw new Error('条件表达式过长');
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const space = /^\s+/.exec(rest);
    if (space) {
      index += space[0].length;
      continue;
    }
    const operator = /^(>=|<=|==|!=|&&|\|\||[><!()])/.exec(rest);
    if (operator) {
      tokens.push({ kind: 'op', value: operator[0] });
      index += operator[0].length;
      continue;
    }
    const number = /^-?\d+(?:\.\d+)?/.exec(rest);
    if (number) {
      tokens.push({ kind: 'value', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const quoted = /^(?:"(?:[^"\\]|\\["\\])*"|'(?:[^'\\]|\\['\\])*')/.exec(
      rest,
    );
    if (quoted) {
      tokens.push({
        kind: 'value',
        value: quoted[0].slice(1, -1).replaceAll(/\\(['"\\])/g, '$1'),
      });
      index += quoted[0].length;
      continue;
    }
    const field = /^[A-Za-z_][\w.]*/.exec(rest);
    if (field) {
      if (
        field[0]
          .split('.')
          .some((p) => ['__proto__', 'constructor', 'prototype'].includes(p))
      )
        throw new Error('条件字段不合法');
      tokens.push(
        ['false', 'true'].includes(field[0])
          ? { kind: 'value', value: field[0] === 'true' }
          : { kind: 'field', value: field[0] },
      );
      index += field[0].length;
      continue;
    }
    throw new Error(`条件表达式含不支持的内容：${rest.slice(0, 20)}`);
  }
  let position = 0;
  const take = (op: string) =>
    tokens[position]?.kind === 'op' && tokens[position]?.value === op
      ? (++position, true)
      : false;
  function value(): unknown {
    const token = tokens[position++];
    if (!token || token.kind === 'op')
      throw new Error('条件表达式缺少字段或值');
    if (token.kind === 'value') return token.value;
    const key = String(token.value);
    if (allowedFields && !allowedFields.has(key))
      throw new Error(`条件引用了未配置的字段「${key}」`);
    if (validateOnly) return 0;
    let result: unknown = Object.hasOwn(data, key) ? data[key] : data;
    if (result === data)
      for (const part of key.split('.'))
        result =
          result && typeof result === 'object' && Object.hasOwn(result, part)
            ? (result as Record<string, unknown>)[part]
            : undefined;
    if (result === undefined || result === null)
      throw new Error(`条件字段「${key}」没有值，无法确定流转路径`);
    return result;
  }
  function comparison(): boolean {
    if (take('!')) return !comparison();
    if (take('(')) {
      const result = or();
      if (!take(')')) throw new Error('条件括号不匹配');
      return result;
    }
    const left = value();
    const token = tokens[position];
    if (
      token?.kind !== 'op' ||
      !['!=', '<', '<=', '==', '>', '>='].includes(String(token.value))
    ) {
      if (!validateOnly && typeof left !== 'boolean')
        throw new Error('条件必须是比较表达式或布尔值');
      return Boolean(left);
    }
    position++;
    const right = value();
    if (validateOnly) return false;
    if (token.value === '==') return left === right;
    if (token.value === '!=') return left !== right;
    if (
      typeof left !== 'number' ||
      typeof right !== 'number' ||
      !Number.isFinite(left) ||
      !Number.isFinite(right)
    )
      throw new Error('大小比较两侧必须为数值');
    switch (token.value) {
      case '<': {
        return left < right;
      }
      case '>': {
        return left > right;
      }
      case '>=': {
        return left >= right;
      }
      default: {
        return left <= right;
      }
    }
  }
  function and(): boolean {
    let result = comparison();
    while (take('&&')) {
      const next = comparison();
      result = result && next;
    }
    return result;
  }
  function or(): boolean {
    let result = and();
    while (take('||')) {
      const next = and();
      result = result || next;
    }
    return result;
  }
  const result = or();
  if (position !== tokens.length) throw new Error('条件表达式格式不正确');
  return result;
}
