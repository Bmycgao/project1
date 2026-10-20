import { eventHandler, getRouterParam, readBody } from 'h3';
import { findRbacUserByUsername } from '~/utils/rbac-store';
import { workflowRequest } from '~/utils/workflow-api';
import {
  ensurePublishedWorkflowMenu,
  workflowMenuCatalogs,
} from '~/utils/workflow-menu';
import { publishChecked } from '~/utils/workflow-publication';
export default eventHandler((event) =>
  workflowRequest(event, async (username) => {
    const body = await readBody(event);
    if (
      body?.generateMenu !== undefined &&
      typeof body.generateMenu !== 'boolean'
    )
      throw new Error('生成菜单参数不正确');
    const parentId = body?.menuParentId ? String(body.menuParentId) : undefined;
    if (
      body?.generateMenu &&
      parentId &&
      !workflowMenuCatalogs().some((catalog) => catalog.id === parentId)
    )
      throw new Error('所选菜单分组不存在或已停用');
    const menuTitle = String(body?.menuTitle || '').trim();
    if (menuTitle.length > 100) throw new Error('菜单名称不能超过 100 字');
    const published = publishChecked(
      getRouterParam(event, 'id') || '',
      body?.revision,
      username,
    );
    if (body?.generateMenu) {
      try {
        ensurePublishedWorkflowMenu(
          published,
          menuTitle,
          parentId,
          findRbacUserByUsername(username)?.roleIds,
        );
      } catch (error) {
        return {
          ...published,
          menuWarning: `流程已发布，但菜单生成失败：${(error as Error).message}`,
        };
      }
    }
    return published;
  }),
);
