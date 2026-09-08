import { describe, expect, it } from 'vitest';

import { buildDesignerSamplePrintData } from './sample-print-data';

describe('designer sample print data', () => {
  it('does not inject the obsolete body-merge demonstration row', () => {
    const data = buildDesignerSamplePrintData();

    expect(data.compensationItems.some((row) => row.name === '其他说明')).toBe(
      false,
    );
    expect(data.houses.length).toBeGreaterThanOrEqual(2);
  });
});
