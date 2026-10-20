import type {
  PageSchemaReference,
  PageSchemaUsage,
} from '../../shared/page-schema';
import type { WorkflowRecord } from '../../shared/workflow';
import type { PageSchema } from './mock-page-schema';

import {
  workflowNodeDetailMode,
  workflowNodeDetailViewId,
} from '../../shared/workflow';

interface SchemaMenu {
  id: number | string;
  name?: string;
  type?: string;
  meta?: { schemaId?: string; title?: string };
  children?: SchemaMenu[];
}

/** Published records use their actual frozen views, never today's page references. */
export function collectPageSchemaUsage(
  schemaId: string,
  pages: Pick<
    PageSchema,
    'columnTemplateId' | 'detailSchemaId' | 'id' | 'schemaKind' | 'title'
  >[],
  menus: SchemaMenu[],
  workflows: WorkflowRecord[],
): PageSchemaUsage {
  const references: PageSchemaReference[] = [];
  function visit(nodes: SchemaMenu[]) {
    for (const menu of nodes) {
      if (
        menu.type === 'menu' &&
        String(menu.meta?.schemaId || '') === schemaId
      )
        references.push({
          type: 'menu',
          id: String(menu.id),
          title: menu.meta?.title || menu.name || String(menu.id),
          description: '业务菜单 · 页面重新加载时读取配置',
          mode: 'live',
        });
      visit(menu.children || []);
    }
  }
  visit(menus);
  for (const page of pages) {
    if (page.schemaKind === 'scene' && page.detailSchemaId === schemaId)
      references.push({
        type: 'listDetail',
        id: page.id,
        title: page.title,
        description: '业务列表 · 打开记录详情时读取最新布局与模板',
        mode: 'live',
      });
    if (page.schemaKind === 'scene' && page.columnTemplateId === schemaId)
      references.push({
        type: 'columnTemplate',
        id: page.id,
        title: page.title,
        description: '业务列表引用的公共列方案与字段规则',
        mode: 'live',
      });
  }
  for (const flow of workflows) {
    const title = `${flow.name} · v${flow.version || 1}`;
    if (flow.status === 'draft') {
      if (flow.defaultDetailViewId === schemaId)
        references.push({
          type: 'workflowDefault',
          id: flow.id,
          title,
          description: '流程草稿 · 默认办理详情；发布时冻结',
          mode: 'live',
        });
      for (const node of flow.nodes) {
        if (!['approve', 'task'].includes(node.type)) continue;
        // Preserve legacy node.form=page bindings without changing their documents.
        const pageId =
          workflowNodeDetailMode(node) === 'override'
            ? workflowNodeDetailViewId(node)
            : '';
        if (pageId === schemaId)
          references.push({
            type: 'workflowNode',
            id: flow.id,
            title,
            nodeId: node.id,
            description: `流程草稿 · ${node.name}的覆盖详情；发布时冻结`,
            mode: 'live',
          });
      }
    } else {
      for (const [nodeId, form] of Object.entries(flow.frozenForms || {})) {
        if (
          form.detailView?.schemaId !== schemaId &&
          form.detailView?.sourceSchemaId !== schemaId
        )
          continue;
        const node = flow.nodes.find((item) => item.id === nodeId);
        references.push({
          type: 'workflowNode',
          id: flow.id,
          title,
          nodeId,
          description: `${flow.status === 'disabled' ? '已停用版本' : '已发布版本'} · ${node?.name || nodeId}的冻结配置；修改页面不影响此快照`,
          mode: 'snapshot',
        });
      }
    }
  }
  return {
    references,
    liveCount: references.filter((item) => item.mode === 'live').length,
    snapshotCount: references.filter((item) => item.mode === 'snapshot').length,
  };
}
