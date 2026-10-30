// Vitest 测试文件：描述场景（describe）、执行用例（it）、断言结果（expect）。
// 本文件只验证颜色替换，不代表已经验证浏览器打印、纸张尺寸或完整流程图效果。
// 与 print-chart.ts 的关系来自下面的 import，不是因为文件名相似就自动运行。
import { describe, expect, it } from 'vitest';

import { replacePrintColors } from './print-chart';

describe('workflow chart print colors', () => {
  it('replaces theme variables with print-safe colors', () => {
    expect(replacePrintColors('var(--el-bg-color)')).toBe('#ffffff');
    expect(replacePrintColors('var(--el-text-color-primary)')).toBe('#1f2937');
    expect(replacePrintColors('#dc5964')).toBe('#dc5964');
  });
});
