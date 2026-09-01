/**
 * moduleInner / FC 转换字段在详情控件上的禁用/只读状态
 */
import type { ModuleInnerFieldItem } from '../module-inner-config';

/** 控件锁定结果 */
export interface ModuleFieldControlState {
  disabled: boolean;
  readonly: boolean;
}

/**
 * 合并页面编辑态、角色字段权限、FC 模板只读/禁用
 * @param field 字段配置
 * @param pageEditable 详情是否编辑态
 * @param fieldEditable 角色字段是否可编辑
 */
export function resolveModuleFieldControlState(
  field: ModuleInnerFieldItem,
  pageEditable: boolean,
  fieldEditable: boolean,
): ModuleFieldControlState {
  if (!pageEditable || !fieldEditable) {
    return { disabled: true, readonly: false };
  }
  if (field.fcDisabled) {
    return { disabled: true, readonly: false };
  }
  if (field.fcReadonly) {
    return { disabled: false, readonly: true };
  }
  return { disabled: false, readonly: false };
}
