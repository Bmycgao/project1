import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeTableGridColumns } from '#/adapter/vxe-table';
import type { PageSchemaApi } from '#/api';

import { $t } from '#/locales';

/** 配置用途：展示给操作员看的中文名 */
const SCHEMA_KIND_LABEL: Record<string, string> = {
  entity: '普通列表',
  template: '共用表头',
  scene: '业务场景',
};

/** 业务场景码 → 通俗名称（未知码原样显示） */
const SCENE_LABEL: Record<string, string> = {
  entry: '协议录入',
  lawyer_audit: '律师审核',
  leader_audit: '组长审核',
  preview: '协议预览',
  view: '信息查看',
};

/** 列模板 ID → 通俗名称 */
const TEMPLATE_LABEL: Record<string, string> = {
  PS_AGREE_COLS: '协议列表表头',
};

/**
 * 场景码转中文说明
 * @param scene 场景码
 */
export function formatSceneLabel(scene?: string) {
  if (!scene) return '—';
  return SCENE_LABEL[scene] || scene;
}

/**
 * 配置用途转中文
 * @param kind 类型
 */
export function formatSchemaKindLabel(kind?: string) {
  return SCHEMA_KIND_LABEL[String(kind || 'entity')] || kind || '普通列表';
}

/** 页面配置 - 基础信息表单（文案面向操作员） */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: '内部编码',
      rules: 'required',
      componentProps: { placeholder: '建议英文，如 agree_lawyer_audit' },
      help: '系统内部用，一般不用改；菜单关联时靠「配置编号」识别',
    },
    {
      component: 'Input',
      fieldName: 'title',
      label: '页面名称',
      rules: 'required',
      componentProps: { placeholder: '如：小组律师审核（会出现在列表标题）' },
    },
    {
      component: 'Select',
      fieldName: 'schemaKind',
      label: '配置用途',
      defaultValue: 'entity',
      rules: 'required',
      componentProps: {
        options: [
          {
            label: '普通列表（自己配表格列）',
            value: 'entity',
          },
          {
            label: '共用表头（只定义列，给多个场景复用）',
            value: 'template',
          },
          {
            label: '业务场景（选按钮 + 看哪些数据，表头引用共用模板）',
            value: 'scene',
          },
        ],
      },
      help: '建电子协议子菜单时选「业务场景」：只能勾选已开通的按钮',
    },
    {
      component: 'Input',
      fieldName: 'scene',
      label: '业务场景标识',
      dependencies: {
        show: (values) => values.schemaKind === 'scene',
        triggerFields: ['schemaKind'],
      },
      componentProps: {
        placeholder: '如 entry、lawyer_audit（决定拉哪批数据）',
      },
      help: '同一批协议数据里，用这个标识区分「录入 / 审核 / 预览」等看到的数据范围',
    },
    {
      component: 'Input',
      fieldName: 'columnTemplateId',
      label: '使用哪套表头',
      dependencies: {
        show: (values) => values.schemaKind === 'scene',
        triggerFields: ['schemaKind'],
      },
      componentProps: {
        placeholder: '一般填 PS_AGREE_COLS（协议列表表头）',
      },
      help: '填写「共用表头」那条配置的编号，场景不再单独配列',
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
      label: '是否启用',
    },
    {
      component: 'Input',
      fieldName: 'remark',
      label: '说明',
      componentProps: {
        type: 'textarea',
        rows: 2,
        placeholder: '用一句话说明这个页面给谁用、能干什么',
      },
    },
  ];
}

/** 页面配置列表搜索 */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'keyword',
      label: '搜索',
      componentProps: {
        placeholder: '可搜：页面名称 / 内部编码 / 配置编号',
      },
    },
  ];
}

/**
 * 页面配置表格列（表头与单元格尽量口语化）
 * @param onActionClick 操作回调
 */
export function useColumns(
  onActionClick: OnActionClickFn<PageSchemaApi.PageSchema>,
): VxeTableGridColumns {
  return [
    { field: 'id', title: '配置编号', width: 150 },
    { field: 'title', title: '页面名称', minWidth: 150 },
    {
      field: 'name',
      title: '内部编码',
      minWidth: 140,
      formatter: ({ cellValue }) => cellValue || '—',
    },
    {
      field: 'schemaKind',
      title: '配置用途',
      width: 110,
      formatter: ({ cellValue }) => formatSchemaKindLabel(cellValue),
    },
    {
      field: 'scene',
      title: '业务场景',
      minWidth: 130,
      formatter: ({ cellValue, row }) => {
        if (row.schemaKind !== 'scene') return '—（非场景）';
        if (!cellValue) return '未填写';
        const label = formatSceneLabel(String(cellValue));
        // 有中文名时带上英文码，方便和接口对照
        return SCENE_LABEL[String(cellValue)]
          ? `${label}（${cellValue}）`
          : String(cellValue);
      },
    },
    {
      field: 'buttonCount',
      title: '可用按钮数',
      width: 110,
      formatter: ({ row }) => {
        if (row.schemaKind !== 'scene') return '—';
        const n = (row.buttons || []).length;
        return n ? `${n} 个` : '未勾选';
      },
    },
    {
      field: 'status',
      title: '是否启用',
      width: 100,
      cellRender: { name: 'CellTag' },
    },
    {
      // 勿用 field: 'columns'，会覆盖行数据里的 columns 数组
      field: 'visibleColumnCount',
      title: '表格列',
      minWidth: 140,
      formatter: ({ row }) => {
        if (row.schemaKind === 'scene' && row.columnTemplateId) {
          const tpl =
            TEMPLATE_LABEL[row.columnTemplateId] || row.columnTemplateId;
          return `沿用「${tpl}」`;
        }
        if (row.schemaKind === 'template') {
          const n = (row.columns || []).filter(
            (c: PageSchemaApi.Column) => c.visible,
          ).length;
          return `定义了 ${n} 列（供场景复用）`;
        }
        const n = (row.columns || []).filter(
          (c: PageSchemaApi.Column) => c.visible,
        ).length;
        return `本页 ${n} 列`;
      },
    },
    { field: 'remark', title: '说明', minWidth: 200 },
    {
      align: 'center',
      cellRender: {
        attrs: { nameField: 'title', onClick: onActionClick },
        name: 'CellOperation',
        options: [
          { code: 'edit', text: '去配置' },
          'delete',
        ],
      },
      field: 'operation',
      fixed: 'right',
      title: '操作',
      width: 160,
    },
  ];
}

/** 默认新配置的列模板 */
export function getDefaultColumns(): PageSchemaApi.Column[] {
  return [
    { field: 'name', title: '名称', visible: true, width: 160 },
    {
      field: 'status',
      title: '状态',
      visible: true,
      width: 100,
      cellType: 'status',
    },
    { field: 'remark', title: '备注', visible: true, minWidth: 140 },
    { field: 'createTime', title: '创建时间', visible: true, width: 180 },
  ];
}

/** 默认查询字段 */
export function getDefaultQueryFields(): PageSchemaApi.QueryField[] {
  return [{ field: 'name', title: '名称', component: 'Input' }];
}
