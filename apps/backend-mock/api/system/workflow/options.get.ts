import type {
  WorkflowOptionField,
  WorkflowOptions,
} from '../../../../shared/workflow';

import { eventHandler } from 'h3';
import { MOCK_DEPT_TREE } from '~/utils/mock-dept';
import {
  DEFAULT_FC_BINDINGS,
  fcSchemaStore,
  fcSchemaUsage,
} from '~/utils/mock-fc-schema';
import { pageSchemaStore } from '~/utils/mock-page-schema';
import { roleStore, userStore } from '~/utils/rbac-store';
import { workflowRequest } from '~/utils/workflow-api';
import { listWorkflows } from '~/utils/workflow-store';

import {
  DEFAULT_WORKFLOW_MODULES,
  WORKFLOW_DETAIL_FIELD_ALIASES,
} from '../../../../shared/workflow-detail';
import { WORKFLOW_FIELD_CATALOG } from '../../../../shared/workflow-runtime';

type ExtractedField = Omit<WorkflowOptionField, 'group'>;

/** 只提取静态模板中真正存在的字段；表格同时提供整表和列级权限。 */
function fieldsOfRules(
  rules: Record<string, any>[],
  insideTable = false,
): ExtractedField[] {
  const result: ExtractedField[] = [];
  for (const rule of rules || []) {
    if (!rule || typeof rule !== 'object') continue;
    const typeMap: Record<string, WorkflowOptionField['type']> = {
      datePicker: 'date',
      input: rule.props?.type === 'textarea' ? 'textarea' : 'text',
      inputNumber: 'number',
      number: 'number',
      radio: 'select',
      select: 'select',
      switch: 'boolean',
      tableForm: 'table',
      textarea: 'textarea',
    };
    const type = typeMap[String(rule.type)];
    if (rule.field) {
      const validators = Array.isArray(rule.validate) ? rule.validate : [];
      const validatorMin = validators
        .map((item: any) => item?.min)
        .filter((value: unknown) => typeof value === 'number');
      const validatorMax = validators
        .map((item: any) => item?.max)
        .filter((value: unknown) => typeof value === 'number');
      result.push({
        actionable: !insideTable && !!type && type !== 'table',
        dateMode:
          type === 'date' && rule.props?.type === 'datetime'
            ? 'datetime'
            : undefined,
        key: String(rule.field),
        label: String(rule.title || rule.label || rule.field),
        max:
          typeof rule.props?.max === 'number'
            ? rule.props.max
            : validatorMax.length > 0
              ? Math.min(...validatorMax)
              : undefined,
        min:
          typeof rule.props?.min === 'number'
            ? rule.props.min
            : validatorMin.length > 0
              ? Math.max(...validatorMin)
              : undefined,
        options:
          type === 'select' && Array.isArray(rule.options)
            ? rule.options.map((item: any) => ({
                label: String(item.label ?? item.value),
                value: item.value,
              }))
            : undefined,
        type,
      });
    }
    if (Array.isArray(rule.children))
      result.push(...fieldsOfRules(rule.children, insideTable));
    for (const column of Array.isArray(rule.props?.columns)
      ? rule.props.columns
      : []) {
      const children = fieldsOfRules(
        Array.isArray(column.rule) ? column.rule : [],
        true,
      );
      result.push(
        ...children.map((child) => ({
          ...child,
          label: String(column.label || child.label),
        })),
      );
    }
  }
  return result;
}

function uniqueFields(fields: WorkflowOptionField[]) {
  return [...new Map(fields.map((field) => [field.key, field])).values()];
}

/** 页面配置只是同一协议数据的布局，字段目录也从实际绑定模板生成。 */
function detailFields(page?: (typeof pageSchemaStore)[number]) {
  const modules = page
    ? (page.modules || []).filter((module) => module.enabled)
    : DEFAULT_WORKFLOW_MODULES;
  const fields: WorkflowOptionField[] = [];
  for (const module of modules) {
    const templateId =
      page?.fcBindings?.[module.key] || DEFAULT_FC_BINDINGS[module.key];
    const template = templateId
      ? fcSchemaStore.find((schema) => schema.id === templateId)
      : undefined;
    const rules = template?.rule || page?.fcRules?.[module.key] || [];
    const group =
      module.label ||
      DEFAULT_WORKFLOW_MODULES.find((item) => item.key === module.key)?.label ||
      module.key;
    for (const field of fieldsOfRules(rules)) {
      const path = `${module.key}.${field.key}`;
      const key = WORKFLOW_DETAIL_FIELD_ALIASES[path] || path;
      fields.push({
        ...field,
        actionable:
          field.type !== 'table' &&
          !!WORKFLOW_DETAIL_FIELD_ALIASES[path] &&
          WORKFLOW_FIELD_CATALOG.some((item) => item.key === key),
        group: `协议详情 · ${group}`,
        key,
      });
    }
  }
  return uniqueFields(fields);
}

export default eventHandler((event) =>
  workflowRequest(event, () => {
    const departments: WorkflowOptions['departments'] = [];
    interface Department {
      id: string;
      name: string;
      status: number;
      children?: Department[];
    }
    function flatten(nodes: Department[], parent = '') {
      for (const node of nodes) {
        const name = parent ? `${parent} / ${node.name}` : node.name;
        if (node.status === 1) departments.push({ id: String(node.id), name });
        if (node.children) flatten(node.children, name);
      }
    }
    flatten(MOCK_DEPT_TREE);
    const result: WorkflowOptions = {
      roles: roleStore
        .filter((r) => r.status === 1)
        .map((r) => ({ id: r.id, name: r.name })),
      users: userStore
        .filter((u) => u.status === 1)
        .map((u) => ({ id: String(u.id), name: `${u.name} (${u.username})` })),
      departments,
      defaultDetailFields: detailFields(),
      views: [
        ...pageSchemaStore
          .filter(
            (v) =>
              v.status === 1 &&
              (v.modules || []).some((module) => module.enabled),
          )
          .map((v) => ({
            id: v.id,
            name: v.title || v.name,
            type: 'page' as const,
            fields: detailFields(v),
            modules: (v.modules || [])
              .filter((m) => m.enabled)
              .map((m) => ({
                key: m.key,
                label:
                  m.label ||
                  (
                    {
                      basic: '基础信息',
                      houses: '房屋信息',
                      compensation: '补偿安置',
                      rewards: '奖励补贴',
                      population: '协议人口信息',
                    } as Record<string, string>
                  )[m.key] ||
                  m.key,
              })),
          })),
        ...fcSchemaStore
          .filter(
            (v) => v.status === 1 && fcSchemaUsage(v) !== 'agreementModule',
          )
          .map((v) => {
            const name = v.usage ? v.name : `${v.name}（历史未分类）`;
            return {
              id: v.id,
              name,
              type: 'form' as const,
              fields: uniqueFields(
                fieldsOfRules(v.rule).map((field) => ({
                  ...field,
                  group: `节点补充 · ${name}`,
                })),
              ),
            };
          }),
      ],
      workflows: listWorkflows()
        .filter((d) => d.status === 'published')
        .map((d) => ({
          id: d.id,
          code: d.code,
          name: `${d.name}（${d.code}）`,
        })),
    };
    return result;
  }),
);
