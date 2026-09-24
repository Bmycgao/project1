import { describe, expect, it } from 'vitest';

import { renderDocumentTable } from './document-renderer';

describe('renderDocumentTable header attrs', () => {
  it('marks leaf range and field for designer header selection', () => {
    const table = renderDocumentTable(
      {
        field: 'rewardItems',
        columns: [
          [
            { title: '奖励项目', field: 'name', width: 80 },
            { title: '金额', field: 'amount', width: 80 },
          ],
        ],
      },
      { rewardItems: [{ name: 'a', amount: 1 }] } as any,
    );
    const headers = [...table.querySelectorAll('thead td')];
    expect(headers).toHaveLength(2);
    expect(headers[0]?.dataset.docHeader).toBe('1');
    expect(headers[0]?.dataset.docLeafStart).toBe('0');
    expect(headers[0]?.dataset.docLeafEnd).toBe('0');
    expect(headers[0]?.dataset.docHeaderField).toBe('name');
    expect(headers[1]?.dataset.docLeafStart).toBe('1');
    expect(headers[1]?.dataset.docHeaderField).toBe('amount');
    expect(headers[0]?.querySelector('button')).toBeNull();
  });
});
