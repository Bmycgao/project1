import type {
  WorkflowDocument,
  WorkflowIssue,
  WorkflowNode,
  WorkflowOptionField,
  WorkflowOptions,
} from './model';

import { DEFAULT_WORKFLOW_MODULES } from '../../../../../shared/workflow-detail';
import {
  BUSINESS_FIELDS,
  WORKFLOW_FIELD_CATALOG,
} from '../../../../../shared/workflow-runtime';
import {
  DATA_ACTION_WHEN_LABELS,
  effectiveWorkflowDetailViewId,
  workflowButtonAction,
  workflowNodeDetailMode,
  workflowNodeSupplementFormId,
} from './model';

export interface ConfigurationIssue extends WorkflowIssue {
  nodeId: string;
  kind: 'dataAction' | 'fieldAccess' | 'fieldBinding' | 'moduleAccess';
  /** Action index or the stored field/module key. */
  key: string;
  reason: string;
}

function supplementFields(node: WorkflowNode, options: WorkflowOptions) {
  return (
    options.views.find(
      (view) =>
        view.type === 'form' && view.id === workflowNodeSupplementFormId(node),
    )?.fields || []
  );
}

export function fieldsForNode(
  doc: WorkflowDocument,
  node: WorkflowNode,
  options: WorkflowOptions,
) {
  const detailId = effectiveWorkflowDetailViewId(doc, node);
  const fields = [
    ...(workflowNodeDetailMode(node) === 'formOnly'
      ? []
      : detailId
        ? options.views.find(
            (view) => view.type === 'page' && view.id === detailId,
          )?.fields || []
        : options.defaultDetailFields || []),
    ...supplementFields(node, options),
  ];
  return [...new Map(fields.map((field) => [field.key, field])).values()];
}

export function modulesForNode(
  doc: WorkflowDocument,
  node: WorkflowNode,
  options: WorkflowOptions,
) {
  if (workflowNodeDetailMode(node) === 'formOnly') return [];
  const id = effectiveWorkflowDetailViewId(doc, node);
  return id
    ? options.views.find((view) => view.type === 'page' && view.id === id)
        ?.modules || []
    : [...DEFAULT_WORKFLOW_MODULES];
}

export function bindingTargets(node: WorkflowNode, options: WorkflowOptions) {
  return supplementFields(node, options).filter(
    (field) =>
      field.actionable &&
      !['choiceList', 'table'].includes(field.type || '') &&
      !BUSINESS_FIELDS.some((business) => business.key === field.key),
  );
}

/** Retain all definitions until ambiguity is checked; deduplication can hide a type conflict. */
function bindingSourceDefinitions(
  doc: WorkflowDocument,
  options: WorkflowOptions,
): WorkflowOptionField[] {
  return [
    ...WORKFLOW_FIELD_CATALOG.filter((field) => field.persist !== 'flow'),
    ...doc.nodes
      .filter((node) => ['approve', 'task'].includes(node.type))
      .flatMap((node) =>
        supplementFields(node, options).filter(
          (field) =>
            field.actionable &&
            !['choiceList', 'table'].includes(field.type || '') &&
            !node.fieldBindings?.[field.key],
        ),
      ),
  ];
}

export function bindingSources(
  doc: WorkflowDocument,
  options: WorkflowOptions,
) {
  const fields = bindingSourceDefinitions(doc, options);
  return [
    ...new Map(fields.map((field) => [field.key, field])).values(),
  ].filter(
    (field) =>
      !fields.some(
        (other) => other.key === field.key && other.type !== field.type,
      ),
  );
}

export function compatibleBindingTypes(
  target: WorkflowOptionField,
  source: WorkflowOptionField,
) {
  return (
    !!target.type &&
    !!source.type &&
    (target.type === source.type ||
      (['text', 'textarea'].includes(target.type) &&
        ['text', 'textarea'].includes(source.type)))
  );
}

export function actionTargets(
  doc: WorkflowDocument,
  node: WorkflowNode,
  options: WorkflowOptions,
) {
  return fieldsForNode(doc, node, options).filter(
    (field) =>
      field.actionable &&
      !['choiceList', 'table'].includes(field.type || '') &&
      field.key !== 'agreementNo' &&
      !node.fieldBindings?.[field.key],
  );
}

export function actionSources(doc: WorkflowDocument, options: WorkflowOptions) {
  const fields = [
    ...WORKFLOW_FIELD_CATALOG.filter((field) => field.persist !== 'flow'),
    ...doc.nodes
      .filter((node) => ['approve', 'task'].includes(node.type))
      .flatMap((node) => actionTargets(doc, node, options)),
  ];
  return [...new Map(fields.map((field) => [field.key, field])).values()];
}

/** Read-only diagnostics. Changing a view must never silently relax or erase permissions. */
export function nodeConfigurationIssues(
  doc: WorkflowDocument,
  node: WorkflowNode,
  options: WorkflowOptions,
): ConfigurationIssue[] {
  if (!['approve', 'task'].includes(node.type)) return [];
  const issues: ConfigurationIssue[] = [];
  function add(kind: ConfigurationIssue['kind'], key: string, reason: string) {
    issues.push({
      nodeId: node.id,
      kind,
      key,
      reason,
      message: `${node.name}：${reason}`,
    });
  }
  const targets = bindingTargets(node, options);
  const definitions = bindingSourceDefinitions(doc, options);
  for (const [target, source] of Object.entries(node.fieldBindings || {})) {
    const targetField = targets.find((field) => field.key === target);
    const sources = definitions.filter((field) => field.key === source);
    const sourceField = sources[0];
    let reason = '';
    if (!targetField) reason = '目标字段已不在当前节点补充表单中，或不支持取值';
    else if (!sourceField || target === source)
      reason = '来源字段已失效或不能引用自身';
    else if (sources.some((field) => field.type !== sourceField.type))
      reason = '来源字段在不同表单中的类型不一致';
    else if (!compatibleBindingTypes(targetField, sourceField))
      reason = '来源与展示字段的类型不一致';
    if (reason)
      add(
        'fieldBinding',
        target,
        `字段取值「${targetField?.label || target}（${target}）←${source || '未选择'}」：${reason}`,
      );
  }
  const fields = fieldsForNode(doc, node, options);
  const modules = modulesForNode(doc, node, options);
  for (const key of Object.keys(node.moduleAccess || {})) {
    if (!modules.some((module) => module.key === key))
      add('moduleAccess', key, `模块权限「${key}」：当前页面已不包含此模块`);
  }
  for (const key of Object.keys(node.fieldAccess || {})) {
    if (!fields.some((field) => field.key === key))
      add(
        'fieldAccess',
        key,
        `字段权限「${key}」：当前页面和补充表单已不包含此字段`,
      );
  }
  const writable = actionTargets(doc, node, options);
  const readable = actionSources(doc, options);
  (node.dataActions || []).forEach((action, index) => {
    const reasons: string[] = [];
    if (!writable.some((field) => field.key === action.field))
      reasons.push(
        `目标字段「${action.field || '未选择'}」不存在、未接入存储或已设为取值展示字段`,
      );
    if (action.kind === 'copy') {
      if (!readable.some((field) => field.key === action.from))
        reasons.push(`来源字段「${action.from || '未选择'}」已失效`);
      else if (action.from === action.field) reasons.push('来源不能与目标相同');
    }
    if (
      action.when !== 'arrive' &&
      !node.buttons.some(
        (code) => workflowButtonAction(doc, code) === action.when,
      )
    )
      reasons.push(`未配置“${DATA_ACTION_WHEN_LABELS[action.when]}”对应的按钮`);
    if (
      (action.when === 'submit' && node.type !== 'task') ||
      (action.when === 'pass' && node.type !== 'approve')
    )
      reasons.push('执行时机与节点类型不匹配');
    if (action.policy === 'firstArrival' && action.when !== 'arrive')
      reasons.push('仅首次到达策略只能用于到达节点');
    if (reasons.length > 0)
      add(
        'dataAction',
        String(index),
        `数据动作第 ${index + 1} 项：${reasons.join('；')}`,
      );
  });
  return issues;
}

/** Explicit cleanup of only the listed invalid entries; callers re-evaluate before invoking. */
export function removeConfigurationIssues(
  node: WorkflowNode,
  issues: ConfigurationIssue[],
) {
  const actionIndexes = new Set<number>();
  for (const issue of issues) {
    if (issue.nodeId !== node.id) continue;
    switch (issue.kind) {
      case 'dataAction': {
        actionIndexes.add(Number(issue.key));
        break;
      }
      case 'fieldAccess': {
        delete node.fieldAccess?.[issue.key];
        break;
      }
      case 'fieldBinding': {
        delete node.fieldBindings?.[issue.key];
        break;
      }
      case 'moduleAccess': {
        delete node.moduleAccess?.[issue.key];
        break;
      }
    }
  }
  if (actionIndexes.size > 0)
    node.dataActions = node.dataActions?.filter(
      (_, index) => !actionIndexes.has(index),
    );
}
