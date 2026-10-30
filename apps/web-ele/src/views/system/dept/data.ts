/**
 * 这是普通 TypeScript 模块，不是独立页面，也不是 list.vue 自动附带的文件。
 * list.vue 显式 import useColumns；modules/form.vue 使用 useFormSchema。
 * 将重复的字段/列配置放在这里，让页面专注查询、弹窗和保存操作。
 */
import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeTableGridColumns } from '#/adapter/vxe-table';
import type { SystemDeptApi } from '#/api/system/dept';

import { getDeptList } from '#/api';
import { $t } from '#/locales';

/** 部门表单 schema：用配置描述字段、组件、标签和校验规则，再由 Vben 表单渲染。 */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'ApiTreeSelect', // 组件名称由表单适配器映射为真正的组件。
      componentProps: {
        api: getDeptList,
        childrenField: 'children',
        labelField: 'name',
        valueField: 'id',
        class: 'w-full',
      },
      fieldName: 'pid', // 对应表单数据中的 pid（上级部门 id）。
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
 * @param actionAccess 按 System:Dept:* 控制
 */
export function useColumns(
  onActionClick: OnActionClickFn<SystemDeptApi.SystemDept>,
  actionAccess?: {
    canCreate?: boolean;
    canDelete?: boolean;
    canEdit?: boolean;
  },
): VxeTableGridColumns {
  const canCreate = actionAccess?.canCreate !== false;
  const canEdit = actionAccess?.canEdit !== false;
  const canDelete = actionAccess?.canDelete !== false;
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
        name: 'CellOperation', // 在 #/adapter/vxe-table.ts 注册的操作列渲染器。
        options: [
          { code: 'append', text: '新增下级', show: canCreate },
          { code: 'edit', show: canEdit },
          { code: 'delete', show: canDelete },
        ],
      },
      field: 'operation',
      fixed: 'right',
      title: $t('system.dept.operation'),
      width: 200,
    },
  ];
}
