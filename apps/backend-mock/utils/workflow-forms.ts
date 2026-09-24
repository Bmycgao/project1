import type { WorkflowDocument, WorkflowIssue } from '../../shared/workflow';
import type { RuntimeField, RuntimeForm } from '../../shared/workflow-runtime';

import {
  BUSINESS_FIELDS,
  extraFieldsFromAccess,
} from '../../shared/workflow-runtime';
import { findFcSchema } from './mock-fc-schema';
import { findPageSchema } from './mock-page-schema';

/** Convert supported field metadata to an immutable, server-validatable view. No script execution. */
export function freezeWorkflowForms(doc: WorkflowDocument): {
  forms: Record<string, RuntimeForm>;
  issues: WorkflowIssue[];
} {
  const forms: Record<string, RuntimeForm> = {};
  const issues: WorkflowIssue[] = [];
  // 只冻结填报/审批；抄送不挂表单、不产生待办
  for (const node of doc.nodes.filter((n) =>
    ['approve', 'task'].includes(n.type),
  )) {
    const fields: RuntimeField[] = [
      ...JSON.parse(JSON.stringify(BUSINESS_FIELDS)),
      ...extraFieldsFromAccess(node.fieldAccess, [
        ...(node.dataActions || []).flatMap((action) => [
          action.field,
          action.from || '',
        ]),
        node.assignee.type === 'field' ? node.assignee.field : '',
      ]),
    ];
    const fail = (message: string) =>
      issues.push({ nodeId: node.id, message: `${node.name}：${message}` });
    function parse(rules: Record<string, any>[], prefix = ''): RuntimeField[] {
      const result: RuntimeField[] = [];
      for (const rule of rules) {
        if (!rule || typeof rule !== 'object') {
          fail('表单规则格式异常');
          continue;
        }
        if (
          rule.control?.length ||
          rule.on ||
          rule.effect ||
          rule.props?.remote ||
          rule.props?.fetch
        )
          fail(
            '此表单包含动态联动或脚本，请先使用静态字段视图；当前运行层不执行脚本',
          );
        if (!rule.field) {
          if (Array.isArray(rule.children))
            result.push(...parse(rule.children, prefix));
          continue;
        }
        const key = `${prefix}${rule.field}`;
        if (
          !/^[A-Za-z_][\w.]*$/.test(key) ||
          key
            .split('.')
            .some((p) => ['__proto__', 'constructor', 'prototype'].includes(p))
        ) {
          fail(`字段标识不合法：${key}`);
          continue;
        }
        const props = rule.props || {};
        const map: Record<string, RuntimeField['type']> = {
          input: 'text',
          textarea: 'textarea',
          inputNumber: 'number',
          number: 'number',
          datePicker: 'date',
          select: 'select',
          radio: 'select',
          switch: 'boolean',
          tableForm: 'table',
        };
        const type = map[String(rule.type)];
        if (!type) {
          fail(
            `字段「${rule.title || key}」的控件 ${rule.type} 尚未接入办理页`,
          );
          continue;
        }
        const validators = Array.isArray(rule.validate) ? rule.validate : [];
        if (rule.validate && !Array.isArray(rule.validate))
          fail(`字段「${rule.title || key}」的校验必须为数组`);
        if (
          validators.some((v: any) =>
            Object.keys(v).some(
              (k) =>
                ![
                  'max',
                  'message',
                  'min',
                  'required',
                  'trigger',
                  'type',
                ].includes(k),
            ),
          )
        )
          fail(`字段「${rule.title || key}」包含尚未接入的自定义校验`);
        const expectedType =
          type === 'table'
            ? 'array'
            : type === 'number'
              ? 'number'
              : type === 'boolean'
                ? 'boolean'
                : 'string';
        if (validators.some((v: any) => v.type && v.type !== expectedType))
          fail(`字段「${rule.title || key}」的校验类型与控件不匹配或尚不支持`);
        if (
          validators.some(
            (v: any) =>
              (v.min !== undefined || v.max !== undefined) &&
              !['number', 'table', 'text', 'textarea'].includes(type),
          )
        )
          fail(`字段「${rule.title || key}」的长度/范围校验尚不支持`);
        if (
          props.multiple ||
          (type === 'date' &&
            props.type &&
            !['date', 'datetime'].includes(props.type))
        )
          fail(`字段「${rule.title || key}」的多选/日期范围暂不支持`);
        const field: RuntimeField = {
          key,
          label: String(rule.title || rule.label || rule.field),
          type: props.type === 'textarea' ? 'textarea' : type,
          required: !!rule.$required || validators.some((v: any) => v.required),
          readonly: !!props.readonly || !!props.disabled,
          hidden: rule.hidden === true || rule.display === false,
          defaultValue: rule.value,
          min: typeof props.min === 'number' ? props.min : undefined,
          max: typeof props.max === 'number' ? props.max : undefined,
          maxLength:
            typeof props.maxlength === 'number' ? props.maxlength : undefined,
          dateMode:
            type === 'date' && props.type === 'datetime'
              ? 'datetime'
              : undefined,
        };
        for (const validator of validators)
          for (const bound of ['min', 'max'] as const) {
            if (validator[bound] === undefined) continue;
            if (
              typeof validator[bound] !== 'number' ||
              !Number.isFinite(validator[bound])
            ) {
              fail(`字段「${field.label}」的范围校验必须为数字`);
              continue;
            }
            const prop =
              type === 'number'
                ? bound
                : type === 'table'
                  ? bound === 'min'
                    ? 'minItems'
                    : 'maxItems'
                  : bound === 'min'
                    ? 'minLength'
                    : 'maxLength';
            const current = field[prop];
            field[prop] =
              current === undefined
                ? validator[bound]
                : bound === 'min'
                  ? Math.max(current, validator[bound])
                  : Math.min(current, validator[bound]);
          }
        if (type === 'select') {
          if (Array.isArray(rule.options)) {
            field.options = rule.options.map((o: any) => ({
              label: String(o.label ?? o.value),
              value: o.value,
            }));
          } else {
            fail(`字段「${field.label}」需要静态选项数组`);
          }
          if (
            field.options?.some(
              (o) => !['boolean', 'number', 'string'].includes(typeof o.value),
            )
          )
            fail(`字段「${field.label}」的选项值必须为文本、数字或布尔值`);
        }
        if (type === 'select' && !field.options?.length)
          fail(`字段「${field.label}」缺少静态选项`);
        if (type === 'table') {
          field.children = (props.columns || []).flatMap((column: any) =>
            parse(column.rule || []).map((child) => ({
              ...child,
              required: child.required || !!column.required,
            })),
          );
          if (!field.children?.length)
            fail(`表格「${field.label}」没有明细字段`);
        }
        result.push(field);
      }
      return result;
    }
    if (node.form.id) {
      if (node.form.type === 'form') {
        const schema = findFcSchema(node.form.id);
        if (!schema || schema.status !== 1) fail('绑定的表单不存在或已停用');
        else fields.push(...parse(schema.rule));
      } else {
        const page = findPageSchema(node.form.id);
        if (!page || page.status !== 1) fail('绑定的页面视图不存在或已停用');
        else {
          const moduleKeys = page.modules
            ? page.modules
                .filter((m) => m.enabled)
                .toSorted((a, b) => (a.order || 0) - (b.order || 0))
                .map((m) => m.key)
            : [
                ...new Set([
                  ...Object.keys(page.fcBindings || {}),
                  ...Object.keys(page.fcRules || {}),
                ]),
              ];
          if (moduleKeys.length === 0)
            fail(
              '此页面没有详情表单，请绑定带详情模块的页面或 FormCreate 模板',
            );
          for (const key of moduleKeys) {
            if (page.moduleInner?.[key]?.sections.length)
              fail(
                `详情模块「${key}」包含独立模块内部配置，当前请改绑静态 FormCreate 模板，避免丢失模块字段规则`,
              );
            const ref = page.fcBindings?.[key];
            const schema = ref ? findFcSchema(ref) : undefined;
            const rules =
              schema?.status === 1 ? schema.rule : page.fcRules?.[key];
            if (!rules?.length) {
              fail(`详情模块「${key}」缺少可用 FormCreate 模板，请先绑定模板`);
              continue;
            }
            const moduleFields = parse(rules, key === 'basic' ? '' : `${key}.`);
            const authCode = page.modules?.find((m) => m.key === key)?.authCode;
            if (authCode)
              for (const field of moduleFields)
                field.visibleCodeGroups = [[authCode]];
            fields.push(...moduleFields);
          }
          const template = page.columnTemplateId
            ? findPageSchema(page.columnTemplateId)
            : undefined;
          function applyAccess(field: RuntimeField) {
            const accessRules = [
              ...(page!.fieldRules || []),
              ...(template?.fieldRules || []),
            ].filter(
              (r) =>
                r.field === field.key ||
                r.field === field.key.split('.').at(-1),
            );
            for (const access of accessRules) {
              field.hidden ||= !!access.hidden;
              if (access.visibleCodes?.length)
                (field.visibleCodeGroups ||= []).push(access.visibleCodes);
              if (access.editableCodes?.length)
                (field.editableCodeGroups ||= []).push(access.editableCodes);
            }
            field.children?.forEach(applyAccess);
          }
          fields.forEach(applyAccess);
        }
      }
    }
    // Core business keys remain canonical even when a template defines the same fields.
    const unique = new Map<string, RuntimeField>();
    for (const field of fields) {
      const previous = unique.get(field.key);
      if (previous) {
        if (previous.type !== field.type)
          fail(`重复字段「${field.key}」的控件类型不一致`);
        unique.set(field.key, {
          ...previous,
          ...field,
          type: previous.type,
          readonly: previous.readonly || field.readonly,
          hidden: previous.hidden || field.hidden,
          required: previous.required || field.required,
          min:
            previous.min === undefined
              ? field.min
              : Math.max(previous.min, field.min ?? previous.min),
          max:
            previous.max === undefined
              ? field.max
              : Math.min(previous.max, field.max ?? previous.max),
          visibleCodeGroups: [
            ...(previous.visibleCodeGroups || []),
            ...(field.visibleCodeGroups || []),
          ],
          editableCodeGroups: [
            ...(previous.editableCodeGroups || []),
            ...(field.editableCodeGroups || []),
          ],
        });
      } else unique.set(field.key, field);
    }
    for (const key of Object.keys(node.fieldAccess || {}))
      if (!unique.has(key)) fail(`字段权限引用了视图中不存在的字段：${key}`);
    forms[node.id] = {
      title: node.form.id ? '节点表单' : '协议资料',
      fields: [...unique.values()],
    };
  }
  return { forms, issues };
}
