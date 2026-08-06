import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeTableGridColumns } from '#/adapter/vxe-table';
import type { SystemMenuApi } from '#/api/system/menu';

import { getMenuList } from '#/api/system/menu';
import { $t } from '#/locales';

/** 菜单类型选项（含 Tag 颜色） */
export function getMenuTypeOptions() {
  return [
    { label: $t('system.menu.typeCatalog'), type: 'primary', value: 'catalog' },
    { label: $t('system.menu.typeMenu'), type: 'info', value: 'menu' },
    { label: $t('system.menu.typeButton'), type: 'danger', value: 'button' },
    {
      label: $t('system.menu.typeEmbedded'),
      type: 'success',
      value: 'embedded',
    },
    { label: $t('system.menu.typeLink'), type: 'warning', value: 'link' },
  ];
}

/** 菜单新增/编辑表单 schema */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'RadioGroup',
      componentProps: {
        isButton: true,
        options: getMenuTypeOptions().map(({ label, value }) => ({
          label,
          value,
        })),
      },
      defaultValue: 'menu',
      fieldName: 'type',
      label: $t('system.menu.type'),
      rules: 'required',
    },
    {
      component: 'ApiTreeSelect',
      componentProps: {
        api: getMenuList,
        childrenField: 'children',
        class: 'w-full',
        labelField: 'meta.title',
        valueField: 'id',
      },
      fieldName: 'pid',
      label: $t('system.menu.parent'),
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('system.menu.menuName'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'meta.title',
      label: $t('system.menu.menuTitle'),
      rules: 'required',
    },
    {
      component: 'Input',
      componentProps: {
        placeholder: '如 /demo 或 demo（子级可相对路径）',
      },
      dependencies: {
        // 按钮权限节点不需要路由地址；其余类型必填，否则刷新会崩
        rules(values) {
          return values.type === 'button' ? null : 'required';
        },
        show(values) {
          return values.type !== 'button';
        },
        triggerFields: ['type'],
      },
      fieldName: 'path',
      label: $t('system.menu.path'),
    },
    {
      component: 'Input',
      dependencies: {
        show(values) {
          return values.type === 'menu';
        },
        triggerFields: ['type'],
      },
      fieldName: 'component',
      label: $t('system.menu.component'),
    },
    {
      component: 'Input',
      fieldName: 'authCode',
      label: $t('system.menu.authCode'),
    },
    {
      component: 'IconPicker',
      fieldName: 'meta.icon',
      label: $t('system.menu.icon'),
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
      label: $t('system.menu.status'),
    },
  ];
}

/**
 * 菜单树表格列
 * @param onActionClick 操作回调
 */
export function useColumns(
  onActionClick: OnActionClickFn<SystemMenuApi.SystemMenu>,
): VxeTableGridColumns<SystemMenuApi.SystemMenu> {
  return [
    {
      align: 'left',
      field: 'meta.title',
      fixed: 'left',
      slots: { default: 'title' },
      title: $t('system.menu.menuTitle'),
      treeNode: true,
      width: 240,
    },
    {
      align: 'center',
      cellRender: { name: 'CellTag', options: getMenuTypeOptions() },
      field: 'type',
      title: $t('system.menu.type'),
      width: 100,
    },
    {
      field: 'authCode',
      title: $t('system.menu.authCode'),
      minWidth: 160,
    },
    { align: 'left', field: 'path', title: $t('system.menu.path'), minWidth: 160 },
    {
      align: 'left',
      field: 'component',
      minWidth: 180,
      title: $t('system.menu.component'),
    },
    {
      cellRender: { name: 'CellTag' },
      field: 'status',
      title: $t('system.menu.status'),
      width: 90,
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
      title: $t('system.menu.operation'),
      width: 200,
    },
  ];
}
