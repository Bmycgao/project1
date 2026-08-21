import type { EpicComponentSchema, EpicPageSchema } from './types';

/**
 * 协议「基础信息」默认 Epic 表单 Schema（对标详情页 KV 表单）
 * 字段 field 与 detail.basic 的 key 对齐
 */
import { epicId } from './types';

const STATUS_OPTIONS = [
  { label: '告知单', value: '告知单' },
  { label: '待复核', value: '待复核' },
  { label: '待生效', value: '待生效' },
  { label: '已签约', value: '已签约' },
  { label: '组长已复核', value: '组长已复核' },
];

/**
 * 构造输入类控件节点
 * @param opts 字段配置
 */
function inputField(opts: {
  field: string;
  label: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
  span?: number;
  type?: 'date' | 'input' | 'radio' | 'textarea';
}): EpicComponentSchema {
  const type = opts.type || 'input';
  const node: EpicComponentSchema = {
    type,
    id: epicId(opts.field),
    field: opts.field,
    label: opts.label,
    input: true,
    props: {
      placeholder: opts.placeholder || `请输入${opts.label}`,
      ...(type === 'date'
        ? {
            type: 'date',
            format: 'YYYY-MM-DD',
            valueFormat: 'YYYY-MM-DD',
            placeholder: opts.placeholder || '请选择日期',
          }
        : {}),
      ...(type === 'radio' ? { options: opts.options || [] } : {}),
      ...(type === 'textarea' ? { rows: 3 } : {}),
    },
  };
  if (opts.required) {
    node.rules = [
      {
        required: true,
        message: `请填写${opts.label}`,
        trigger: ['blur', 'change'],
      },
    ];
  }
  return {
    type: 'col',
    id: epicId(`col_${opts.field}`),
    props: { span: opts.span ?? 8 },
    children: [node],
  };
}

/**
 * 一行三列栅格
 * @param cols 列节点
 */
function rowOf(...cols: EpicComponentSchema[]): EpicComponentSchema {
  return {
    type: 'row',
    id: epicId('row'),
    props: { gutter: 16 },
    children: cols,
  };
}

/**
 * 构建默认基础信息 Epic Schema
 */
export function buildDefaultBasicEpicPageSchema(): EpicPageSchema {
  const formChildren: EpicComponentSchema[] = [
    rowOf(
      inputField({
        field: 'agreementNo',
        label: '协议编号',
        required: true,
      }),
      inputField({
        field: 'agreementName',
        label: '协议名称',
        required: true,
      }),
      inputField({ field: 'department', label: '所属部门' }),
    ),
    rowOf(
      inputField({ field: 'acquirer', label: '征收人' }),
      inputField({ field: 'compensatee', label: '被征收人' }),
      inputField({ field: 'amount', label: '协议金额' }),
    ),
    rowOf(
      inputField({
        field: 'signDate',
        label: '签约日期',
        type: 'date',
      }),
      inputField({
        field: 'statusValue',
        label: '状态',
        type: 'radio',
        span: 16,
        options: STATUS_OPTIONS,
      }),
    ),
    rowOf(
      inputField({
        field: 'remark',
        label: '备注',
        type: 'textarea',
        span: 24,
        placeholder: '请输入备注',
      }),
    ),
  ];

  return {
    schemas: [
      {
        type: 'page',
        id: 'root',
        label: '页面',
        children: [
          {
            type: 'form',
            id: epicId('form'),
            label: '基础信息',
            props: {
              name: 'default',
              labelWidth: '120px',
              'label-position': 'right',
            },
            children: formChildren,
          },
        ],
        props: {
          style: { padding: '0' },
        },
      },
    ],
    script: '',
  };
}
