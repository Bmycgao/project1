import { describe, expect, it } from 'vitest';
import { replacePrintColors } from './print-chart';

describe('workflow chart print colors', () => {
  it('replaces theme variables with print-safe colors', () => {
    expect(replacePrintColors('var(--el-bg-color)')).toBe('#ffffff');
    expect(replacePrintColors('var(--el-text-color-primary)')).toBe('#1f2937');
    expect(replacePrintColors('#dc5964')).toBe('#dc5964');
  });
});
