import { describe, expect, it } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { buildDesignerSamplePrintData } from './sample-print-data';

describe('统一预览样例', () => {
  it('默认就有足够的明细展示分页，保持记录标识与金额一致', () => {
    const data = buildDesignerSamplePrintData();
    expect(data.houses.length).toBeGreaterThanOrEqual(2);
    expect(data.compensationItems.length).toBeGreaterThan(30);
    expect(data.compensationItems.some((row) => row.name === '其他说明')).toBe(
      false,
    );
    expect(data.houses.every((row) => !!row.id)).toBe(true);
    expect(data.compensationItems.every((row) => !!row.id)).toBe(true);
    expect(data.barcodeContent).toBe('PRINT-DEMO');
    expect(data.compensationTotal).toBe(
      data.compensationItems.reduce(
        (total, row) => total + Number(row.amount || 0),
        0,
      ),
    );
    expect(data.amount).toBe(data.compensationTotal + data.rewardTotal);
  });

  it('恢复或重新打开始终生成同一套独立样例', () => {
    const initial = buildDesignerSamplePrintData();
    const draft = buildDesignerSamplePrintData();
    requireDefined(draft.houses[0]).address = '已修改';
    draft.compensationItems.length = 0;
    expect(buildDesignerSamplePrintData()).toEqual(initial);
  });
});
