import { describe, expect, it } from 'vitest';

import {
  detailTemplateIssue,
  templateFieldSketches,
} from './detail-designer-model';

describe('详情字段示意和模板检查', () => {
  it('读取嵌套字段和明细表元数据，保留顺序及必填，排除模板隐藏字段', () => {
    const fields = templateFieldSketches([
      {
        type: 'row',
        children: [
          {
            type: 'input',
            field: 'name',
            title: '姓名',
            col: { span: 8 },
            validate: [{ required: true }],
          },
        ],
      },
      { type: 'input', field: 'hidden', hidden: true },
      {
        type: 'tableForm',
        field: 'houses',
        title: '房屋',
        props: {
          columns: [
            { label: '地址' },
            { rule: [{ field: 'area', title: '面积' }] },
          ],
        },
      },
    ]);
    expect(fields.map((field) => field.title)).toEqual(['姓名', '房屋']);
    expect(fields[0]).toMatchObject({ span: 8, required: true });
    expect(fields[1]?.columns).toEqual(['地址', '面积']);
  });
  it('内置表格未写widgetKind时正确推断，空规则、补充用途与失效模板均不能通过', () => {
    const module = { key: 'houses', label: '房屋', enabled: true };
    const template = {
      id: 't',
      status: 1 as const,
      name: '模板',
      kind: 'table' as const,
      rule: [{ type: 'tableForm', field: 'rows' }],
    };
    expect(
      detailTemplateIssue(module, { houses: 't' }, [template]),
    ).toBeUndefined();
    for (const target of [
      { ...template, rule: [] },
      { ...template, usage: 'workflowSupplement' as const },
      { ...template, status: 0 as const },
    ])
      expect(detailTemplateIssue(module, { houses: 't' }, [target])).toContain(
        '房屋',
      );
  });
});
