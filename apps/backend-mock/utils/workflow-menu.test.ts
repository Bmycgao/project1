import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { afterAll, expect, it, vi } from 'vitest';

import { createDocument } from '../../shared/workflow';
import { createMenuNode, moveMenuNode, removeMenuNode } from './menu-store';
import {
  disableWorkflowMenu,
  ensurePublishedWorkflowMenu,
  prepareWorkflowMenu,
  workflowMenuForFamily,
} from './workflow-menu';
import {
  newWorkflowVersion,
  publishWorkflow,
  saveWorkflow,
} from './workflow-store';

const state = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  return { directory: mkdtempSync(join(tmpdir(), 'vben-workflow-menu-')) };
});
vi.mock('./mock-data', () => ({ MOCK_MENU_LIST: [] }));
vi.mock('./rbac-store', () => ({ grantNewMenuToDefaultRoles: vi.fn() }));
vi.mock('./mock-persist', () => ({
  DATA_DIR: state.directory,
  readPersistJson: (file: string) => {
    const path = join(state.directory, file);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  },
  writePersistJson: (file: string, value: unknown) =>
    writeFileSync(join(state.directory, file), JSON.stringify(value), 'utf8'),
}));

afterAll(() => {
  if (
    !resolve(state.directory).startsWith(
      `${resolve(tmpdir())}${sep}vben-workflow-menu-`,
    )
  )
    throw new Error('Unexpected test directory');
  rmSync(state.directory, { recursive: true });
});

it('keeps one authorized workflow menu across versions and soft-disables it', () => {
  const draft = saveWorkflow(
    {
      ...createDocument(),
      code: 'FL_MENU_TEST',
      name: '菜单测试',
      base: 'JD_TEST',
    },
    'tester',
  );
  const first = publishWorkflow(draft.id, draft.revision, {}, 'tester');
  const familyId = first.familyId || first.id;
  const menu = ensurePublishedWorkflowMenu(first);
  expect(menu.path).toBe(`/workflow-flow/${familyId}`);
  expect(menu.meta.workflowFamilyId).toBe(familyId);
  const catalog = createMenuNode({
    type: 'catalog',
    path: '/agreement',
    name: 'Agreement',
    meta: { title: '协议管理' },
  });
  moveMenuNode(menu.id, catalog.id, 'inner');
  expect(menu.pid).toBe(catalog.id);
  expect(menu.path).toBe(`/workflow-flow/${familyId}`);
  expect(() => moveMenuNode(catalog.id, menu.id, 'inner')).toThrow(/./);
  expect(() =>
    prepareWorkflowMenu({ type: 'menu', meta: { workflowFamilyId: familyId } }),
  ).toThrow('已有菜单');

  const draft2 = newWorkflowVersion(first.id, 'tester');
  const second = publishWorkflow(draft2.id, draft2.revision, {}, 'tester');
  expect(ensurePublishedWorkflowMenu(second).id).toBe(menu.id);
  expect(workflowMenuForFamily(familyId)?.path).toBe(menu.path);

  expect(removeMenuNode(menu.id)).toBe(true);
  expect(workflowMenuForFamily(familyId)?.status).toBe(0);
  disableWorkflowMenu(familyId);
  expect(ensurePublishedWorkflowMenu(second).status).toBe(1);
});
