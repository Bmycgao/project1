import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeTableGridColumns } from '#/adapter/vxe-table';
import type { SystemRoleApi } from '#/api';

import { $t } from '#/locales';

/** 角色表单 schema（含菜单授权槽位） */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('system.role.roleName'),
      rules: 'required',
    },
    {
      component: 'RadioGroup',
      componentProps: {
        isButton: true,
        options: [
          { label: $t('common.enabled'), value: 1 },
          { label: $t('common.disabled'), value: 0 },
        ],
      },
      defaultValue: 1,
      fieldName: 'status',
      label: $t('system.role.status'),
    },
    {
      component: 'Input',
      componentProps: { type: 'textarea', rows: 2 },
      fieldName: 'remark',
      label: $t('system.role.remark'),
    },
    {
      component: 'Input',
      fieldName: 'permissions',
      formItemClass: 'items-start',
      label: $t('system.role.setPermissions'),
      modelPropName: 'modelValue',
    },
  ];
}

/** 角色列表搜索 schema */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('system.role.roleName'),
    },
    {
      component: 'Select',
      componentProps: {
        clearable: true,
        options: [
          { label: $t('common.enabled'), value: 1 },
          { label: $t('common.disabled'), value: 0 },
        ],
      },
      fieldName: 'status',
      label: $t('system.role.status'),
    },
  ];
}

/**
 * 角色表格列
 * @param onActionClick 操作回调
 * @param onStatusChange 状态切换回调
 * @param actionAccess 按 System:Role:* 控制操作列
 */
export function useColumns(
  onActionClick: OnActionClickFn<SystemRoleApi.SystemRole>,
  onStatusChange?: (
    newStatus: number,
    row: SystemRoleApi.SystemRole,
  ) => PromiseLike<boolean | undefined>,
  actionAccess?: { canDelete?: boolean; canEdit?: boolean },
): VxeTableGridColumns {
  const canEdit = actionAccess?.canEdit !== false;
  // 菜单未单独挂 Delete 码时，删除与编辑共用 Edit
  const canDelete = actionAccess?.canDelete !== false;
  return [
    { field: 'name', title: $t('system.role.roleName'), minWidth: 140 },
    {
      field: 'id',
      title: $t('system.role.id'),
      width: 100,
    },
    {
      cellRender: {
        attrs: { beforeChange: onStatusChange },
        name: onStatusChange ? 'CellSwitch' : 'CellTag',
      },
      field: 'status',
      title: $t('system.role.status'),
      // 开关含启用/禁用文案，避免裁切
      width: 180,
    },
    { field: 'remark', minWidth: 180, title: $t('system.role.remark') },
    {
      field: 'createTime',
      title: $t('system.role.createTime'),
      width: 180,
    },
    {
      align: 'center',
      cellRender: {
        attrs: { nameField: 'name', onClick: onActionClick },
        name: 'CellOperation',
        options: [
          { code: 'edit', show: canEdit },
          { code: 'delete', show: canDelete },
        ],
      },
      field: 'operation',
      fixed: 'right',
      title: $t('system.role.operation'),
      width: 140,
    },
  ];
}
