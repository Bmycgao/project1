/**
 * 协议列表「已实现动作」注册表
 * 场景只能勾选这里的 code；未注册的按钮不会执行真实逻辑
 */
import type { Router } from 'vue-router';

import { ElMessage, ElMessageBox } from 'element-plus';

import type { AgreementListItem } from './types';

/** 工具栏按钮（由动作库解析得到） */
export interface AgreeToolbarButton {
  code: string;
  label: string;
  type?: 'danger' | 'default' | 'primary';
  plain?: boolean;
  /** main 主按钮区；more 收进下拉 */
  group?: 'main' | 'more';
}

/** 动作执行上下文 */
export interface AgreeActionContext {
  scene: string;
  selected: AgreementListItem[];
  tableData: AgreementListItem[];
  /** 刷新列表 */
  reload: () => void | Promise<void>;
  /** 打开详情 */
  openDetail: (row: AgreementListItem) => void;
  router: Router;
}

/** 注册表中的动作定义 */
export interface AgreeActionDef {
  code: string;
  label: string;
  type?: 'danger' | 'default' | 'primary';
  plain?: boolean;
  group?: 'main' | 'more';
  /** 至少勾选几条；0 表示不需要勾选 */
  minSelected?: number;
  /** 最多勾选几条；不传表示不限 */
  maxSelected?: number;
  /** 动作说明（配置页提示） */
  description?: string;
  /** 分类，便于配置页分组展示 */
  category: 'audit' | 'crud' | 'flow' | 'preview';
  /**
   * 执行逻辑（演示版：Message + 部分跳转详情；接真后端时改这里）
   * @param ctx 上下文
   */
  handler: (ctx: AgreeActionContext) => void | Promise<void>;
}

/**
 * 要求勾选数量
 * @param ctx 上下文
 * @param min 最少
 * @param max 最多
 */
function assertSelection(
  ctx: AgreeActionContext,
  min = 1,
  max?: number,
): boolean {
  const n = ctx.selected.length;
  if (n < min) {
    ElMessage.warning(min === 1 ? '请先勾选记录' : `请至少勾选 ${min} 条`);
    return false;
  }
  if (max !== undefined && n > max) {
    ElMessage.warning(max === 1 ? '请只勾选一条记录' : `最多勾选 ${max} 条`);
    return false;
  }
  return true;
}

/** 演示：通用成功提示 */
function demoOk(label: string, ctx: AgreeActionContext, extra = '') {
  const nos = ctx.selected.map((r) => r.agreementNo).join('、') || '（未选行）';
  ElMessage.success(
    `【${label}】已执行（演示）· 场景 ${ctx.scene} · ${nos}${extra ? ` · ${extra}` : ''}`,
  );
}

/**
 * 已实现动作库（开发在此注册；非开发配置场景时只能勾选）
 */
export const AGREE_ACTION_REGISTRY: Record<string, AgreeActionDef> = {
  add: {
    code: 'add',
    label: '新增',
    type: 'primary',
    group: 'main',
    minSelected: 0,
    category: 'crud',
    description: '打开新增协议（演示提示）',
    handler: async (ctx) => {
      ElMessage.info(`场景 ${ctx.scene}：新增协议（演示，可接新建表单）`);
    },
  },
  delete: {
    code: 'delete',
    label: '删除',
    type: 'danger',
    plain: true,
    group: 'main',
    minSelected: 1,
    category: 'crud',
    description: '删除勾选协议',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      try {
        await ElMessageBox.confirm(
          `确认删除 ${ctx.selected.length} 条协议？（演示）`,
          '删除确认',
          { type: 'warning' },
        );
      } catch {
        return;
      }
      demoOk('删除', ctx);
      await ctx.reload();
    },
  },
  edit: {
    code: 'edit',
    label: '修改',
    group: 'main',
    minSelected: 1,
    maxSelected: 1,
    category: 'crud',
    description: '打开详情编辑',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      ctx.openDetail(ctx.selected[0]!);
    },
  },
  submitReview: {
    code: 'submitReview',
    label: '提交复核',
    type: 'primary',
    plain: true,
    group: 'main',
    minSelected: 1,
    category: 'flow',
    description: '提交复核流程',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      demoOk('提交复核', ctx);
      await ctx.reload();
    },
  },
  conditionalSign: {
    code: 'conditionalSign',
    label: '附条件签约',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'flow',
    description: '附条件签约',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('附条件签约', ctx);
    },
  },
  approve: {
    code: 'approve',
    label: '审核通过',
    type: 'primary',
    group: 'main',
    minSelected: 1,
    category: 'audit',
    description: '审核通过（可进详情）',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      if (ctx.selected.length === 1) {
        ctx.openDetail(ctx.selected[0]!);
        ElMessage.success('已打开详情（审核模式演示）');
        return;
      }
      demoOk('审核通过', ctx);
      await ctx.reload();
    },
  },
  reject: {
    code: 'reject',
    label: '驳回',
    type: 'danger',
    plain: true,
    group: 'main',
    minSelected: 1,
    category: 'audit',
    description: '驳回勾选协议',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      try {
        await ElMessageBox.prompt('请输入驳回原因（演示）', '驳回', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
        });
      } catch {
        return;
      }
      demoOk('驳回', ctx);
      await ctx.reload();
    },
  },
  rejectRecord: {
    code: 'rejectRecord',
    label: '驳回记录',
    group: 'more',
    minSelected: 0,
    category: 'audit',
    description: '查看驳回记录',
    handler: async (ctx) => {
      demoOk('驳回记录', ctx, '打开记录弹窗（演示）');
    },
  },
  rejectPrev: {
    code: 'rejectPrev',
    label: '驳回前期',
    group: 'more',
    minSelected: 1,
    category: 'audit',
    description: '驳回至前期环节',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      demoOk('驳回前期', ctx);
      await ctx.reload();
    },
  },
  preview1: {
    code: 'preview1',
    label: '附件一预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '预览附件一',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('附件一预览', ctx);
    },
  },
  preview2: {
    code: 'preview2',
    label: '附件二预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '预览附件二',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('附件二预览', ctx);
    },
  },
  ticket1: {
    code: 'ticket1',
    label: '房票附件一',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '房票附件一',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('房票附件一', ctx);
    },
  },
  ticket2: {
    code: 'ticket2',
    label: '房票附件二',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '房票附件二',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('房票附件二', ctx);
    },
  },
  preSave: {
    code: 'preSave',
    label: '协议预保存',
    group: 'main',
    minSelected: 1,
    category: 'preview',
    description: '协议预保存',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      demoOk('协议预保存', ctx);
    },
  },
  companyAgree: {
    code: 'companyAgree',
    label: '公司协议',
    group: 'main',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '公司协议预览',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('公司协议', ctx);
    },
  },
  unlicensedAgree: {
    code: 'unlicensedAgree',
    label: '无证协议',
    group: 'main',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '无证协议预览',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('无证协议', ctx);
    },
  },
  previewSupply: {
    code: 'previewSupply',
    label: '补充协议预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '补充协议预览',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('补充协议预览', ctx);
    },
  },
  previewChange: {
    code: 'previewChange',
    label: '变更协议预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '变更协议预览',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('变更协议预览', ctx);
    },
  },
  previewAgree: {
    code: 'previewAgree',
    label: '协议预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '协议预览',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      demoOk('协议预览', ctx);
    },
  },
};

/** 配置页勾选用的动作列表 */
export function listAgreeActions(): AgreeActionDef[] {
  return Object.values(AGREE_ACTION_REGISTRY);
}

/**
 * 按分类分组（配置页展示）
 */
export function groupAgreeActions() {
  const groups: Record<string, AgreeActionDef[]> = {
    crud: [],
    flow: [],
    audit: [],
    preview: [],
  };
  for (const a of listAgreeActions()) {
    groups[a.category]?.push(a);
  }
  return [
    { key: 'crud', title: '增删改', items: groups.crud || [] },
    { key: 'flow', title: '流程', items: groups.flow || [] },
    { key: 'audit', title: '审核', items: groups.audit || [] },
    { key: 'preview', title: '预览/附件', items: groups.preview || [] },
  ];
}

/**
 * 动作码 → 工具栏按钮（只保留已注册动作）
 * @param codes 场景勾选的 code 列表
 */
export function resolveToolbarButtons(
  codes: string[] | AgreeToolbarButton[],
): AgreeToolbarButton[] {
  const list = (codes || []).map((c) =>
    typeof c === 'string' ? c : c.code,
  );
  const result: AgreeToolbarButton[] = [];
  for (const code of list) {
    const def = AGREE_ACTION_REGISTRY[code];
    if (!def) continue;
    result.push({
      code: def.code,
      label: def.label,
      type: def.type,
      plain: def.plain,
      group: def.group,
    });
  }
  return result;
}

/**
 * 是否已注册
 * @param code 动作码
 */
export function isAgreeActionRegistered(code: string) {
  return !!AGREE_ACTION_REGISTRY[code];
}

/**
 * 执行动作；未注册则提示
 * @param code 动作码
 * @param ctx 上下文
 */
export async function runAgreeAction(code: string, ctx: AgreeActionContext) {
  const def = AGREE_ACTION_REGISTRY[code];
  if (!def) {
    ElMessage.error(`动作「${code}」未在动作库注册，无法执行（请联系开发添加）`);
    return;
  }
  await def.handler(ctx);
}
