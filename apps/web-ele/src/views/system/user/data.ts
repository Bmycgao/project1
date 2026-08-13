import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeTableGridColumns } from '#/adapter/vxe-table';
import type { SystemUserApi } from '#/api';

import { getDeptList, getRoleList } from '#/api';
import { $t } from '#/locales';

/** 拉取启用中的角色，供用户绑定 */
async function fetchRoleOptions() {
  const res = await getRoleList({ page: 1, pageSize: 200, status: 1 });
  return res?.items || [];
}

/** 用户新增/编辑表单 schema */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'username',
      label: '登录账号',
      rules: 'required',
      help: '用于登录；改角色后需重新登录生效',
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: '姓名',
      rules: 'required',
    },
    {
      component: 'Input',
      componentProps: {
        type: 'password',
        placeholder: '新建默认 123456；编辑留空则不改',
      },
      fieldName: 'password',
      label: '密码',
    },
    {
      component: 'ApiSelect',
      componentProps: {
        api: fetchRoleOptions,
        class: 'w-full',
        labelField: 'name',
        valueField: 'id',
        multiple: true,
        placeholder: '请选择角色',
      },
      fieldName: 'roleIds',
      label: '角色',
      rules: 'required',
      help: '权限 = 所绑角色的菜单/按钮并集',
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
      label: '姓名/账号',
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
 * @param onStatusChange 状态切换前回调；无编辑权限时勿传
 * @param actionAccess 操作列显隐（按 System:User:*）
 */
export function useColumns(
  onActionClick: OnActionClickFn<SystemUserApi.SystemUser>,
  onStatusChange?: (
    newStatus: number,
    row: SystemUserApi.SystemUser,
  ) => PromiseLike<boolean | undefined>,
  actionAccess?: { canDelete?: boolean; canEdit?: boolean },
): VxeTableGridColumns {
  const canEdit = actionAccess?.canEdit !== false;
  const canDelete = actionAccess?.canDelete !== false;
  return [
    {
      field: 'username',
      title: '登录账号',
      minWidth: 110,
    },
    { field: 'name', title: '姓名', minWidth: 100 },
    {
      field: 'roleNames',
      title: '角色',
      minWidth: 140,
      formatter: ({ cellValue }) =>
        Array.isArray(cellValue) ? cellValue.join('、') : cellValue || '-',
    },
    {
      field: 'id',
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
      width: 180,
    },
    { field: 'remark', minWidth: 160, title: $t('system.user.remark') },
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
        options: [
          { code: 'edit', show: canEdit },
          { code: 'delete', show: canDelete },
        ],
      },
      field: 'operation',
      fixed: 'right',
      title: $t('system.user.operation'),
      width: 140,
    },
  ];
}
