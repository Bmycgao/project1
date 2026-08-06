import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeTableGridColumns } from '#/adapter/vxe-table';
import type { SystemDeptApi } from '#/api/system/dept';

import { getDeptList } from '#/api';
import { $t } from '#/locales';

/** 部门表单 schema */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'ApiTreeSelect',
      componentProps: {
        api: getDeptList,
        childrenField: 'children',
        labelField: 'name',
        valueField: 'id',
        class: 'w-full',
      },
      fieldName: 'pid',
      label: $t('system.dept.parentDept'),
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('system.dept.deptName'),
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
      label: $t('system.dept.status'),
    },
    {
      component: 'Input',
      componentProps: { type: 'textarea', rows: 2 },
      fieldName: 'remark',
      label: $t('system.dept.remark'),
    },
  ];
}

/**
 * 部门树表格列
 * @param onActionClick 操作回调
 */
export function useColumns(
  onActionClick: OnActionClickFn<SystemDeptApi.SystemDept>,
): VxeTableGridColumns {
  return [
    {
      align: 'left',
      field: 'name',
      title: $t('system.dept.deptName'),
      treeNode: true,
      minWidth: 200,
    },
    { field: 'id', title: 'ID', width: 100 },
    {
      cellRender: { name: 'CellTag' },
      field: 'status',
      title: $t('system.dept.status'),
      width: 100,
    },
    { field: 'remark', minWidth: 180, title: $t('system.dept.remark') },
    {
      field: 'createTime',
      title: $t('system.dept.createTime'),
      width: 180,
    },
    {
      align: 'center',
      cellRender: {
        attrs: { nameField: 'name', onClick: onActionClick },
        name: 'CellOperation',
        options: [
          { code: 'append', text: '新增下级' },
          'edit',
          'delete',
        ],
      },
      field: 'operation',
      fixed: 'right',
      title: $t('system.dept.operation'),
      width: 200,
    },
  ];
}
