import type { OnActionClickFn, VxeTableGridOptions } from '#/adapter/vxe-table';
import type { PrintTemplateApi } from '#/api';

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
        options: [{ label: '协议', value: 'agreement' }],
      },
      fieldName: 'bizType',
      label: '业务类型',
    },
  ];
}

/**
 * 表格列
 * @param onActionClick 行操作
 */
export function useColumns(
  onActionClick: OnActionClickFn<PrintTemplateApi.PrintTemplate>,
): VxeTableGridOptions['columns'] {
  return [
    { field: 'templateCode', title: '模板编码', width: 140 },
    { field: 'name', title: '名称', minWidth: 160 },
    { field: 'bizType', title: '业务类型', width: 100 },
    {
      field: 'status',
      title: '状态',
      width: 80,
      formatter: ({ cellValue }) => (cellValue === 1 ? '启用' : '停用'),
    },
    { field: 'version', title: '版本', width: 70 },
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
          { code: 'edit', text: '设计' },
          {
            code: 'delete',
            text: '删除',
            disabled: (row: PrintTemplateApi.PrintTemplate) =>
              isBuiltin(row.id),
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
    'PT_AGREEMENT',
    'PT_FUJIAN1',
    'PT_FUJIAN2',
    'PT_TICKET1',
    'PT_TICKET2',
  ].includes(id);
}
