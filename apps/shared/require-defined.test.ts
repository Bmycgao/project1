import { describe, expect, it } from 'vitest';

import { requireDefined } from './require-defined';

describe('requireDefined', () => {
  it.each([null, undefined])('缺少必要数据时明确失败：%s', (value) => {
    expect(() => requireDefined(value)).toThrow('缺少必要的数据或页面元素');
  });
  it.each([0, false, ''])('保留有效的零值、布尔值和空文本：%s', (value) => {
    expect(requireDefined(value)).toBe(value);
  });
  it('保留数据对象的身份，不创建副本', () => {
    const value = { id: 'row-1' };
    expect(requireDefined(value)).toBe(value);
  });
});
