import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeTableGridColumns } from '#/adapter/vxe-table';
import type { SystemUserApi } from '#/api';

import { getDeptList } from '#/api';
import { $t } from '#/locales';

/** 用户新增/编辑表单 schema */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('system.user.name'),
      rules: 'required',
    },
    {
      component: 'ApiTreeSelect',
      componentProps: {
        api: getDeptList,
        childrenField: 'children',
        labelField: 'name',
        valueField: 'id',
        class: 'w-full',
      },
      fieldName: 'deptId',
      label: $t('system.user.dept'),
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
      label: $t('system.user.status'),
    },
    {
      component: 'Input',
      componentProps: { type: 'textarea', rows: 3 },
      fieldName: 'remark',
      label: $t('system.user.remark'),
    },
  ];
}

/** 用户列表搜索表单 schema */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('system.user.name'),
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
      label: $t('system.user.status'),
    },
  ];
}

/**
 * 用户表格列配置
 * @param onActionClick 操作列回调
 * @param onStatusChange 状态切换前回调
 */
export function useColumns(
  onActionClick: OnActionClickFn<SystemUserApi.SystemUser>,
  onStatusChange?: (
    newStatus: number,
    row: SystemUserApi.SystemUser,
  ) => PromiseLike<boolean | undefined>,
): VxeTableGridColumns {
  return [
    { field: 'name', title: $t('system.user.name'), minWidth: 120 },
    {
      field: 'id',
      // 短业务 ID，列宽无需过大
      title: $t('system.user.id'),
      width: 100,
    },
    {
      cellRender: {
        attrs: { beforeChange: onStatusChange },
        name: onStatusChange ? 'CellSwitch' : 'CellTag',
      },
      field: 'status',
      title: $t('system.user.status'),
      // 开关含「已启用/已禁用」文案，需更宽以免裁切
      width: 180,
    },
    { field: 'remark', minWidth: 180, title: $t('system.user.remark') },
    {
      field: 'createTime',
      title: $t('system.user.createTime'),
      width: 180,
    },
    {
      align: 'center',
      cellRender: {
        attrs: {
          nameField: 'name',
          onClick: onActionClick,
        },
        name: 'CellOperation',
      },
      field: 'operation',
      fixed: 'right',
      title: $t('system.user.operation'),
      width: 140,
    },
  ];
}
