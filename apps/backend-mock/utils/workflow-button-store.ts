import type { WorkflowButtonConfig } from '../../shared/workflow';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  STANDARD_BUTTONS,
  WORKFLOW_BUTTON_ACTIONS,
  workflowButtonConfig,
} from '../../shared/workflow';
import { evaluateCondition } from '../../shared/workflow-expression';
import { DATA_DIR } from './mock-persist';

export interface WorkflowButtonResource extends WorkflowButtonConfig {
  code: string;
  builtIn?: boolean;
  status: 0 | 1;
}

const FILE = 'workflow-buttons.json';
const BUILT_INS: WorkflowButtonResource[] = [
  ...STANDARD_BUTTONS.map((button) => ({
    code: button.code,
    action: button.code as WorkflowButtonResource['action'],
    label: button.label,
    builtIn: true,
    status: 1 as const,
  })),
  {
    code: 'transfer',
    action: 'transfer',
    label: '转办',
    builtIn: true,
    status: 1,
  },
];

function read(): WorkflowButtonResource[] {
  if (!existsSync(join(DATA_DIR, FILE))) return structuredClone(BUILT_INS);
  const value: unknown = JSON.parse(readFileSync(join(DATA_DIR, FILE), 'utf8'));
  if (!Array.isArray(value)) throw new Error('按钮资源存储格式错误');
  const saved = value as WorkflowButtonResource[];
  return [
    ...BUILT_INS.filter(
      (seed) => !saved.some((item) => item.code === seed.code),
    ),
    ...saved,
  ];
}
function write(items: WorkflowButtonResource[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  const temporary = join(DATA_DIR, `${FILE}.tmp`);
  writeFileSync(temporary, JSON.stringify(items, null, 2), 'utf8');
  renameSync(temporary, join(DATA_DIR, FILE));
}
function normalize(
  input: Partial<WorkflowButtonResource>,
  previous?: WorkflowButtonResource,
): WorkflowButtonResource {
  const code = String(input.code || '').trim();
  const label = String(input.label || '').trim();
  if (!/^[A-Za-z][\w-]{0,79}$/.test(code))
    throw new Error('按钮编码须以字母开头，最长 80 位');
  if (!label || label.length > 80) throw new Error('按钮名称须为 1 到 80 字');
  if (!input.action || !WORKFLOW_BUTTON_ACTIONS.includes(input.action))
    throw new Error('动作类型暂不支持');
  if (previous?.builtIn && previous.action !== input.action)
    throw new Error('内置按钮不能更改动作类型');
  if (previous?.builtIn && input.status === 0)
    throw new Error('内置按钮不能停用');
  if (input.placement && !['bottom', 'top'].includes(input.placement))
    throw new Error('按钮位置不合法');
  if (
    input.style &&
    !['danger', 'default', 'primary', 'warning'].includes(input.style)
  )
    throw new Error('按钮样式不合法');
  for (const expression of [input.visibleWhen, input.enabledWhen]) {
    if (!expression?.trim()) continue;
    evaluateCondition(expression, {}, true);
  }
  for (const value of [
    input.visibleWhen,
    input.enabledWhen,
    input.disabledReason,
    input.confirmText,
  ])
    if (value && value.length > 1000) throw new Error('按钮配置文本过长');
  return {
    code,
    action: input.action,
    label,
    placement: input.placement || 'bottom',
    style: input.style || workflowButtonConfig({}, input.action).style,
    visibleWhen: input.visibleWhen?.trim() || '',
    enabledWhen: input.enabledWhen?.trim() || '',
    disabledReason: input.disabledReason?.trim() || '',
    confirmText: input.confirmText?.trim() || '',
    requireOpinion: input.action === 'reject' || !!input.requireOpinion,
    builtIn: previous?.builtIn || false,
    status: input.status === 0 ? 0 : 1,
  };
}
export function listWorkflowButtonResources() {
  return read();
}
export function saveWorkflowButtonResource(
  input: Partial<WorkflowButtonResource>,
  existingCode?: string,
) {
  const items = read();
  const previous = existingCode
    ? items.find((item) => item.code === existingCode)
    : undefined;
  if (existingCode && !previous) throw new Error('按钮资源不存在');
  if (previous && input.code !== previous.code)
    throw new Error('按钮编码不可修改');
  const next = normalize(input, previous);
  if (
    items.some(
      (item) =>
        item.code.toLowerCase() === next.code.toLowerCase() &&
        item.code !== existingCode,
    )
  )
    throw new Error('按钮编码已存在');
  write([...items.filter((item) => item.code !== existingCode), next]);
  return next;
}
export function deleteWorkflowButtonResource(code: string) {
  const items = read();
  const target = items.find((item) => item.code === code);
  if (!target) throw new Error('按钮资源不存在');
  if (target.builtIn) throw new Error('内置按钮不可删除，可停用');
  write(items.filter((item) => item.code !== code));
}
