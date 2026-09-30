import type { WorkflowDocument, WorkflowIssue } from '../../shared/workflow';
import type {
  RuntimeField,
  RuntimeForm,
  WorkflowDetailView,
} from '../../shared/workflow-runtime';

import { buildDefaultFcRuleMap } from '../../shared/agreement-default-rules';
import {
  effectiveWorkflowDetailViewId,
  workflowNodeDetailMode,
  workflowNodeSupplementFormId,
} from '../../shared/workflow';
import {
  DEFAULT_WORKFLOW_MODULES,
  WORKFLOW_DETAIL_FIELD_ALIASES,
} from '../../shared/workflow-detail';
import { BUSINESS_FIELDS } from '../../shared/workflow-runtime';
import { fcSchemaUsage, findFcSchema } from './mock-fc-schema';
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
    let detailView: undefined | WorkflowDetailView;
    const fields: RuntimeField[] = JSON.parse(JSON.stringify(BUSINESS_FIELDS));
    const actionFields = new Set<string>();
    const permissionFields = new Set<string>();
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
    const detailMode = workflowNodeDetailMode(node);
    const pageId = effectiveWorkflowDetailViewId(doc, node);
    const supplementFormId = workflowNodeSupplementFormId(node);
    if (detailMode === 'formOnly')
      for (const field of fields.filter((candidate) =>
        BUSINESS_FIELDS.some((business) => business.key === candidate.key),
      )) {
        field.hidden = true;
        field.readonly = true;
      }
    if (detailMode === 'override' && !pageId)
      fail('请选择节点覆盖的办理详情视图');
    if (detailMode === 'formOnly' && !supplementFormId)
      fail('仅独立表单模式必须选择节点表单');
    if (detailMode !== 'formOnly') {
      const page = pageId ? findPageSchema(pageId) : undefined;
      if (pageId && (!page || page.status !== 1))
        fail('办理详情视图不存在或已停用');
      const defaultRules = buildDefaultFcRuleMap();
      const mounts = page
        ? (page.modules || []).filter((m) => m.enabled)
        : DEFAULT_WORKFLOW_MODULES.map((m, index) => ({
            ...m,
            enabled: true,
            order: index * 10,
          }));
      detailView = {
        schemaId: page?.id,
        title: page?.title || '协议资料',
        modules: [],
      };
      if (mounts.length === 0) fail('此页面没有详情模块，请先配置页面详情视图');
      const columnTemplate = page?.columnTemplateId
        ? findPageSchema(page.columnTemplateId)
        : undefined;
      for (const mount of mounts) {
        const key = mount.key;
        if (
          !DEFAULT_WORKFLOW_MODULES.some((m) => m.key === key) &&
          !/^custom_(form|table)_[A-Za-z0-9_]+$/.test(key)
        ) {
          fail(`模块「${key}」尚未注册业务数据绑定`);
          continue;
        }
        const builtin = DEFAULT_WORKFLOW_MODULES.find((m) => m.key === key);
        const config = mount as NonNullable<
          ReturnType<typeof findPageSchema>
        >['modules'] extends (infer T)[] | undefined
          ? T
          : never;
        const kind = builtin?.widgetKind || config.widgetKind || 'form';
        const templateId = page?.fcBindings?.[key];
        const template = templateId ? findFcSchema(templateId) : undefined;
        if (template && fcSchemaUsage(template) === 'workflowSupplement')
          fail(`详情模块「${key}」不能使用流程节点补充模板`);
        const rules = page
          ? template?.status === 1
            ? template.rule
            : page.fcRules?.[key]
          : defaultRules[key];
        if (!rules?.length) {
          fail(`详情模块「${key}」缺少可用模板`);
          continue;
        }
        if (template && template.kind && template.kind !== kind)
          fail(`模块「${key}」与模板类型不匹配`);
        if (
          key === 'basic' &&
          page?.moduleInner?.basic?.sections.some((section) =>
            section.fields?.some((field) => field.custom && field.enabled),
          )
        )
          fail(
            '基础信息含旧版自定义子表，请先将子表迁移为独立表格模块后绑定流程',
          );
        const moduleFields = parse(rules);
        if (
          kind === 'table' &&
          (moduleFields.length !== 1 || moduleFields[0]?.type !== 'table')
        )
          fail(`表格模块「${key}」需要且仅支持一个明细表`);
        if (kind === 'form' && moduleFields.some((f) => f.type === 'table'))
          fail(`表单模块「${key}」中的明细表请拆成独立表格模块`);
        function applyAccess(field: RuntimeField) {
          if (
            key === 'basic' &&
            ['agreementNo', 'statusValue'].includes(field.key)
          )
            field.readonly = true;
          const accessRules = [
            ...(page?.fieldRules || []),
            ...(columnTemplate?.fieldRules || []),
          ].filter(
            (r) => r.field === field.key || r.field === `${key}.${field.key}`,
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
        moduleFields.forEach(applyAccess);
        for (const field of moduleFields) {
          const path = `${key}.${field.key}`;
          const alias = WORKFLOW_DETAIL_FIELD_ALIASES[path];
          permissionFields.add(alias || path);
          if (alias && alias !== 'agreementNo' && field.type !== 'table')
            actionFields.add(alias);
          for (const child of field.children || []) {
            const childPath = `${key}.${child.key}`;
            const childAlias = WORKFLOW_DETAIL_FIELD_ALIASES[childPath];
            permissionFields.add(childAlias || childPath);
            if (childAlias && childAlias !== 'agreementNo')
              actionFields.add(childAlias);
          }
        }
        detailView.modules.push({
          key,
          label: config.label || builtin?.label || key,
          widgetKind: kind,
          region:
            config.region === 'content' || config.region === 'tabs'
              ? config.region
              : key === 'basic'
                ? 'content'
                : 'tabs',
          span: [8, 12, 16, 24].includes(config.span || 24)
            ? config.span || 24
            : 24,
          order: config.order || 0,
          authCode: config.authCode,
          rules: JSON.parse(JSON.stringify(rules)),
          fields: moduleFields,
        });
        fields.push(
          ...moduleFields.map((field) => ({
            ...field,
            key: key === 'basic' ? field.key : `${key}.${field.key}`,
            moduleKey: key,
          })),
        );
      }
      detailView.modules.sort((a, b) => a.order - b.order);
      for (const [key, mode] of Object.entries(node.moduleAccess || {})) {
        if (!detailView.modules.some((m) => m.key === key))
          fail(`模块权限引用了视图中不存在或未启用的模块：${key}`);
        if (!['edit', 'hidden', 'inherit', 'readonly'].includes(mode))
          fail('模块权限配置不合法');
      }
    } else if (Object.keys(node.moduleAccess || {}).length > 0) {
      fail('仅独立表单模式不使用模块权限，请先清除模块配置');
    }
    if (supplementFormId) {
      const schema = findFcSchema(supplementFormId);
      if (!schema || schema.status !== 1) fail('节点补充表单不存在或已停用');
      else if (fcSchemaUsage(schema) === 'agreementModule')
        fail('节点补充表单不能使用协议详情模块模板');
      else {
        const supplementFields = parse(schema.rule);
        fields.push(...supplementFields);
        for (const field of supplementFields) {
          permissionFields.add(field.key);
          if (field.type !== 'table') actionFields.add(field.key);
          for (const child of field.children || [])
            permissionFields.add(child.key);
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
      if (!permissionFields.has(key))
        fail(`字段权限引用了当前详情页或节点补充表单中不存在的字段：${key}`);
    forms[node.id] = {
      actionFields: [...actionFields],
      title:
        detailMode === 'formOnly'
          ? '节点办理表单'
          : supplementFormId
            ? '协议资料与节点补充表单'
            : '协议资料',
      fields: [...unique.values()],
      presentation: detailMode === 'formOnly' ? 'formOnly' : 'detail',
      ...(detailView ? { detailView } : {}),
    };
  }
  return { forms, issues };
}
