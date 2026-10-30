/** 替代无运行时检查的非空断言；缺少必要数据时明确失败，保留 0、false 和空字符串。 */
export function requireDefined<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined)
    throw new Error('缺少必要的数据或页面元素');
  return value;
}
