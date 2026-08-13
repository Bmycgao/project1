import type { Plugin } from 'vite';

/**
 * 历史迁移提示插件（已停用）
 * 业务侧已统一使用 slotProps.componentProps，不再向控制台注入 BREAKING CHANGE
 */
const FORM_FIELD_SLOT_MIGRATION_WARNING =
  '[Vben Form] BREAKING CHANGE: Named field slot control bindings moved to `slotProps.componentProps`. Replace `v-bind="slotProps"` with `v-bind="slotProps.componentProps"`. See https://doc.vben.pro/components/common-ui/vben-form.html';

/** 空插件：保留导出以兼容测试/旧引用，不再 warn / 注入 script */
function viteFormFieldSlotMigrationWarningPlugin(): Plugin {
  return {
    apply: 'serve',
    name: 'vite:form-field-slot-migration-warning',
  };
}

export {
  FORM_FIELD_SLOT_MIGRATION_WARNING,
  viteFormFieldSlotMigrationWarningPlugin,
};
