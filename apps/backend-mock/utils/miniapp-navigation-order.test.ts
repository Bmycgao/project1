import { describe, expect, it } from 'vitest';

import {
  addNavigationItem,
  canMoveNavigationItem,
  defaultNavigation,
  moveNavigationItem,
  validateNavigation,
  visibleNavigationItems,
} from '../../shared/miniapp-navigation';
import { requireDefined } from '../../shared/require-defined';

// @vitest-environment node

describe('账户入口固定在最右', () => {
  it('新增插在账户前，业务入口可排序；账户不能移动，其他入口不能越过账户', () => {
    const original = defaultNavigation();
    const before = structuredClone(original);
    const added = addNavigationItem(original, 'new-test');
    expect(added.items.map((item) => item.target)).toEqual([
      'home',
      'services',
      'test',
      'account',
    ]);
    expect(original).toEqual(before);
    const moved = moveNavigationItem(added, 'new-test', -1);
    expect(moved.items.map((item) => item.target)).toEqual([
      'home',
      'test',
      'services',
      'account',
    ]);
    for (const offset of [-1, 1])
      expect(canMoveNavigationItem(moved, 'mine', offset)).toBe(false);
    expect(canMoveNavigationItem(moved, 'services', 1)).toBe(false);
    expect(moveNavigationItem(moved, 'mine', -1)).toEqual(moved);
    expect(moveNavigationItem(moved, 'services', 1)).toEqual(moved);
    expect(canMoveNavigationItem(moved, 'home', -1)).toBe(false);
    expect(canMoveNavigationItem(moved, 'missing', 1)).toBe(false);
    expect(canMoveNavigationItem(moved, 'home', 2)).toBe(false);
  });
  it('旧配置、重命名和新编号仍按账户目标固定，三个角色预览一致且不改变原稿', () => {
    const draft = addNavigationItem(defaultNavigation(), 'new-test');
    draft.items.reverse();
    requireDefined(draft.items[0]).id = 'personal-new-id';
    requireDefined(draft.items[0]).text = '个人中心';
    requireDefined(
      draft.items.find((item) => item.target === 'services'),
    ).visibleRoles = ['miniapp_admin'];
    const before = structuredClone(draft);
    const normalized = validateNavigation(draft);
    expect(normalized.items.map((item) => item.target)).toEqual([
      'test',
      'services',
      'home',
      'account',
    ]);
    expect(normalized.items.at(-1)).toMatchObject({
      id: 'personal-new-id',
      text: '个人中心',
    });
    for (const role of ['resident', 'operator', 'miniapp_admin'] as const) {
      const items = visibleNavigationItems(draft, role);
      expect(requireDefined(items.at(-1)).target).toBe('account');
      expect(items.map((item) => item.target)).toEqual(
        role === 'miniapp_admin'
          ? ['test', 'services', 'home', 'account']
          : ['test', 'home', 'account'],
      );
    }
    expect(draft).toEqual(before);
    expect(normalized.revision).toBe(draft.revision);
    expect(normalized.updatedAt).toBe(draft.updatedAt);
  });
});
