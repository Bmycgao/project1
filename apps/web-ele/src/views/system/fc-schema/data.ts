import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FcSchemaApi } from '#/api';

import { $t } from '#/locales';

/** 列表筛选表单 */
export function useGridFormSchema() {
  return [
    {
      component: 'Input',
      fieldName: 'keyword',
      label: '关键词',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: [
          { label: $t('system.fcSchema.kindForm'), value: 'form' },
          { label: $t('system.fcSchema.kindTable'), value: 'table' },
        ],
      },
      fieldName: 'kind',
      label: '类型',
    },
  ];
}

/**
 * 表格列
 * @param onActionClick 行操作
 */
export function useColumns(
  onActionClick: OnActionClickFn<FcSchemaApi.FcSchema>,
): VxeTableGridOptions['columns'] {
  return [
    { field: 'id', title: 'ID', width: 120 },
    { field: 'name', title: '名称', minWidth: 180 },
    {
      field: 'kind',
      title: '类型',
      width: 90,
      formatter: ({ cellValue }) =>
        cellValue === 'table'
          ? $t('system.fcSchema.kindTable')
          : $t('system.fcSchema.kindForm'),
    },
    { field: 'remark', title: '备注', minWidth: 160 },
    {
      field: 'updatedAt',
      title: '更新时间',
      minWidth: 160,
      formatter: ({ cellValue }) =>
        cellValue ? String(cellValue).replace('T', ' ').slice(0, 19) : '',
    },
    {
      align: 'center',
      cellRender: {
        attrs: { onClick: onActionClick },
        name: 'CellOperation',
        options: [
          { code: 'edit', text: '编辑' },
          {
            code: 'delete',
            text: '删除',
            disabled: (row: FcSchemaApi.FcSchema) => isBuiltin(row.id),
          },
        ],
      },
      field: 'operation',
      fixed: 'right',
      title: '操作',
      width: 140,
    },
  ];
}

/** 内置模板不可删 */
export function isBuiltin(id: string) {
  return [
    'FC_BASIC',
    'FC_COMPENSATION',
    'FC_HOUSES',
    'FC_POPULATION',
    'FC_REWARDS',
  ].includes(id);
}
