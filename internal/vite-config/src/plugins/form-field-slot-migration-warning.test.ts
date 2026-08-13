import { describe, expect, it } from 'vitest';

import {
  FORM_FIELD_SLOT_MIGRATION_WARNING,
  viteFormFieldSlotMigrationWarningPlugin,
} from './form-field-slot-migration-warning';

describe('form field slot migration warning plugin', () => {
  it('is a no-op serve plugin after migration completed', () => {
    const plugin = viteFormFieldSlotMigrationWarningPlugin();

    expect(plugin.apply).toBe('serve');
    expect(plugin.name).toBe('vite:form-field-slot-migration-warning');
    expect(plugin.configResolved).toBeUndefined();
    expect(plugin.transformIndexHtml).toBeUndefined();
    expect(FORM_FIELD_SLOT_MIGRATION_WARNING).toContain('`v-bind="slotProps"`');
    expect(FORM_FIELD_SLOT_MIGRATION_WARNING).toContain(
      '`v-bind="slotProps.componentProps"`',
    );
  });
});
