/**
 * 打印数据源树：设计器点选字段用（绑的是 field 名，不是某条协议）
 */
import type { AgreePrintFieldItem } from './fields';

import {
  AGREE_PRINT_DERIVED_FIELDS,
  AGREE_PRINT_TABLE_FIELDS,
  AGREE_PRINT_TEXT_FIELDS,
  TABLE_COLUMN_PRESETS,
} from './fields';

export type PrintFieldPickMode = 'column' | 'table' | 'text';

export interface PrintFieldTreeNode {
  id: string;
  label: string;
  /** 节点类型 */
  kind: 'column' | 'derived' | 'group' | 'table' | 'text';
  field?: string;
  text?: string;
  tableField?: string;
  textType?: AgreePrintFieldItem['textType'];
  testData?: string;
  selectable: boolean;
  children?: PrintFieldTreeNode[];
}

/**
 * 生成数据源树
 * @param mode 点选用途：文本只出主表；表格只出整表；列只出列
 * @param tableField 列模式下只展开该表的列；空则列出全部表列
 */
export function buildPrintFieldTree(
  mode: PrintFieldPickMode = 'text',
  tableField?: string,
): PrintFieldTreeNode[] {
  const main: PrintFieldTreeNode = {
    id: 'group-main',
    label: '主表（协议一条上的字段）',
    kind: 'group',
    selectable: false,
    children: AGREE_PRINT_TEXT_FIELDS.map((f) => ({
      id: `text-${f.field}`,
      label: `${f.text}  ${f.field}`,
      kind: 'text' as const,
      field: f.field,
      text: f.text,
      textType: f.textType,
      testData: f.testData,
      selectable: true,
    })),
  };

  const tables: PrintFieldTreeNode = {
    id: 'group-tables',
    label: '表格（数组，对应详情里的明细）',
    kind: 'group',
    selectable: false,
    children: AGREE_PRINT_TABLE_FIELDS.filter(
      (t) => !tableField || t.field === tableField,
    ).map((t) => ({
      id: `table-${t.field}`,
      label: `${t.text}  ${t.field}`,
      kind: 'table' as const,
      field: t.field,
      text: t.text,
      selectable: mode === 'table',
      children:
        mode === 'table'
          ? undefined
          : (TABLE_COLUMN_PRESETS[t.field] || []).map((col) => ({
              id: `col-${t.field}-${col.field}`,
              label: `${col.title}  ${col.field}`,
              kind: 'column' as const,
              field: col.field,
              text: col.title,
              tableField: t.field,
              selectable: true,
            })),
    })),
  };

  const derived: PrintFieldTreeNode = {
    id: 'group-derived',
    label: '派生量（显隐条件用，点选只复制字段名）',
    kind: 'group',
    selectable: false,
    children: AGREE_PRINT_DERIVED_FIELDS.map((f) => ({
      id: `derived-${f.field}`,
      label: `${f.text}  ${f.field}`,
      kind: 'derived' as const,
      field: f.field,
      text: f.text,
      testData: f.testData,
      selectable: true,
    })),
  };

  if (mode === 'column' || mode === 'table') return [tables];
  return [main, derived];
}

/**
 * 当前模式下该节点能否选中（派生量由弹窗单独处理，不走绑定）
 * @param node 树节点
 * @param mode 点选用途
 */
export function isPrintFieldPickAllowed(
  node: PrintFieldTreeNode,
  mode: PrintFieldPickMode,
) {
  if (!node.selectable || node.kind === 'group' || node.kind === 'derived') {
    return false;
  }
  if (mode === 'text') return node.kind === 'text';
  if (mode === 'table') return node.kind === 'table';
  return node.kind === 'column';
}

/**
 * 把 field 翻成「中文 (key)」，字典没有则原样返回
 * @param field 绑定的 key
 */
export function describePrintField(field: string) {
  const key = field.trim();
  if (!key) return '';
  const textHit = AGREE_PRINT_TEXT_FIELDS.find((f) => f.field === key);
  if (textHit) return `${textHit.text} (${textHit.field})`;
  const tableHit = AGREE_PRINT_TABLE_FIELDS.find((f) => f.field === key);
  if (tableHit) return `${tableHit.text} (${tableHit.field})`;
  const derivedHit = AGREE_PRINT_DERIVED_FIELDS.find((f) => f.field === key);
  if (derivedHit) return `${derivedHit.text} (${derivedHit.field})`;
  for (const cols of Object.values(TABLE_COLUMN_PRESETS)) {
    const col = cols.find((c) => c.field === key);
    if (col) return `${col.title} (${col.field})`;
  }
  return key;
}
