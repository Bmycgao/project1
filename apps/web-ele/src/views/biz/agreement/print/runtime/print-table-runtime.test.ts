import { describe, expect, it } from 'vitest';

import { applyTablePrintRuntime } from './print-table-runtime';

describe('table header pagination option', () => {
  it.each([
    ['page', 'page'],
    ['none', 'none'],
    [undefined, 'page'],
  ] as const)(
    'preserves %s as %s for detail tables',
    (configured, expected) => {
      const options: Record<string, any> = {
        field: 'compensationItems',
        columns: [[{ title: '项目', field: 'name', width: 100 }]],
      };
      if (configured) options.tableHeaderRepeat = configured;
      applyTablePrintRuntime({ options });
      expect(options.tableHeaderRepeat).toBe(expected);
      expect(options.tableFooterRepeat).toBe('last');
    },
  );
});
