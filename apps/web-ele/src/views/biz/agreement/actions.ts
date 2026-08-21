/**
 * 协议列表「已实现动作」注册表
 * 场景只能勾选这里的 code；未注册的按钮不会执行真实逻辑
 */
import type { Router } from 'vue-router';

import type { AgreementListItem } from './types';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  approveAgreements,
  createAgreement,
  deleteAgreements,
  rejectAgreements,
  submitAgreementBatch,
} from '#/api/biz/agreement';
import { requestClient } from '#/api/request';

/** 工具栏按钮（由动作库解析得到，可带页面级差异化绑定） */
export interface AgreeToolbarButton {
  code: string;
  label: string;
  type?: 'danger' | 'default' | 'primary';
  plain?: boolean;
  /** main 主按钮区；more 收进下拉 */
  group?: 'main' | 'more';
  /** 页面配置里的差异化绑定（可选） */
  bind?: AgreeButtonBind;
  /**
   * 可见但无操作权限时为 true（文档 2.4：置灰不可点）
   * 由 resolveToolbarButtonsAccess 写入
   */
  disabled?: boolean;
}

/**
 * 按钮差异化绑定（同一 code 在不同场景可配不同行为）
 * 有 api 时走配置化调用；否则仍用动作库默认 handler
 */
export interface AgreeButtonBind {
  /** 接口路径，如 /biz/agreement/batch-submit */
  api?: string;
  /** 请求方法，默认 POST */
  method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
  /** 二次确认文案；空则不弹确认（除非走默认 handler 自带确认） */
  confirmText?: string;
  /** 成功提示 */
  successMsg?: string;
  /** 成功后跳转：路由 path，或 detail 表示打开首条详情 */
  redirect?: string;
  /**
   * 仅当勾选行 statusValue 均在此列表时允许操作；
   * 勾选后不满足则禁用/拦截
   */
  showWhenStatusIn?: string[];
}

/** 动作执行上下文 */
export interface AgreeActionContext {
  scene: string;
  selected: AgreementListItem[];
  tableData: AgreementListItem[];
  /** 刷新列表 */
  reload: () => Promise<void> | void;
  /** 打开详情 */
  openDetail: (row: AgreementListItem) => void;
  router: Router;
  /** 当前用户权限码（按钮级鉴权） */
  accessCodes?: string[];
  /** 当前点击按钮的差异化绑定 */
  buttonBind?: AgreeButtonBind;
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
   * 执行逻辑（阶段 A：核心 CRUD/流程走真实 mock API）
   * @param ctx 上下文
   */
  handler: (ctx: AgreeActionContext) => Promise<void> | void;
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

/** 勾选行的协议编号 */
function selectedNos(ctx: AgreeActionContext) {
  return ctx.selected.map((r) => r.agreementNo);
}

/**
 * 导出 CSV（浏览器本地下载，不依赖后端）
 * @param rows 导出行
 * @param filename 文件名
 */
function downloadCsv(rows: AgreementListItem[], filename: string) {
  const headers = [
    'agreementNo',
    'compensatee',
    'houseAddress',
    'statusValue',
    'signType',
    'isSigned',
    'batchGroup',
  ];
  const titleMap: Record<string, string> = {
    agreementNo: '协议编号',
    compensatee: '被补偿人',
    houseAddress: '房屋地址',
    statusValue: '状态值',
    signType: '签约类型',
    isSigned: '是否签约',
    batchGroup: '批次分组',
  };
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [
    headers.map((h) => titleMap[h] || h).join(','),
    ...rows.map((row) =>
      headers.map((h) => escape((row as Record<string, any>)[h])).join(','),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 预览类动作：打开详情（只读意图由 detailMode 控制） */
async function openPreview(label: string, ctx: AgreeActionContext) {
  if (!assertSelection(ctx, 1, 1)) return;
  const row = ctx.selected[0];
  if (!row) return;
  ctx.openDetail(row);
  ElMessage.success(`已打开详情 · ${label}`);
}

/**
 * 打开当前勾选第一条详情
 * @param ctx 动作上下文
 */
function openFirstSelected(ctx: AgreeActionContext) {
  const row = ctx.selected[0];
  if (!row) return;
  ctx.openDetail(row);
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
    description: '新建草稿协议并打开详情',
    handler: async (ctx) => {
      const row = await createAgreement();
      ElMessage.success(`已创建草稿 ${row.agreementNo}`);
      ctx.openDetail(row);
      await ctx.reload();
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
          `确认删除 ${ctx.selected.length} 条协议？删除后不可恢复。`,
          '删除确认',
          { type: 'warning' },
        );
      } catch {
        return;
      }
      const { removed } = await deleteAgreements(selectedNos(ctx));
      ElMessage.success(`已删除 ${removed} 条`);
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
      openFirstSelected(ctx);
    },
  },
  export: {
    code: 'export',
    label: '导出',
    group: 'main',
    minSelected: 0,
    category: 'crud',
    description: '导出勾选行；未勾选则导出当前列表',
    handler: async (ctx) => {
      const rows = ctx.selected.length > 0 ? ctx.selected : ctx.tableData;
      if (rows.length === 0) {
        ElMessage.warning('当前没有可导出的数据');
        return;
      }
      downloadCsv(rows, `协议列表-${ctx.scene}-${Date.now()}.csv`);
      ElMessage.success(`已导出 ${rows.length} 条`);
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
    description: '提交复核流程（状态改为待复核）',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      try {
        await ElMessageBox.confirm(
          `确认将 ${ctx.selected.length} 条协议提交复核？`,
          '提交复核',
          { type: 'warning' },
        );
      } catch {
        return;
      }
      const res = await submitAgreementBatch(selectedNos(ctx));
      ElMessage.success(`已提交复核 ${res?.total ?? ctx.selected.length} 条`);
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
    description: '打开详情办理附条件签约',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1, 1)) return;
      openFirstSelected(ctx);
      ElMessage.info('已打开详情，请在签约信息中办理附条件签约');
    },
  },
  approve: {
    code: 'approve',
    label: '审核通过',
    type: 'primary',
    group: 'main',
    minSelected: 1,
    category: 'audit',
    description: '审核通过（单条可进详情；多条直接批量通过）',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      if (ctx.selected.length === 1) {
        try {
          await ElMessageBox.confirm(
            '在详情中核对后通过？选「直接通过」将立即改状态。',
            '审核通过',
            {
              distinguishCancelAndClose: true,
              confirmButtonText: '打开详情',
              cancelButtonText: '直接通过',
              type: 'info',
            },
          );
          openFirstSelected(ctx);
          return;
        } catch (error) {
          // cancel = 直接通过；close = 取消
          if (error !== 'cancel') return;
        }
      }
      const res = await approveAgreements(selectedNos(ctx));
      ElMessage.success(`已审核通过 ${res?.total ?? ctx.selected.length} 条`);
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
    description: '驳回勾选协议（状态回到告知单）',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      let remark: string;
      try {
        const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputPattern: /\S+/,
          inputErrorMessage: '驳回原因不能为空',
        });
        remark = String(value || '');
      } catch {
        return;
      }
      const res = await rejectAgreements(selectedNos(ctx), remark);
      ElMessage.success(`已驳回 ${res?.total ?? ctx.selected.length} 条`);
      await ctx.reload();
    },
  },
  rejectRecord: {
    code: 'rejectRecord',
    label: '驳回记录',
    group: 'more',
    minSelected: 0,
    category: 'audit',
    description: '查看驳回记录（阶段 A：进详情查看备注）',
    handler: async (ctx) => {
      if (ctx.selected.length === 1) {
        openFirstSelected(ctx);
        ElMessage.info('已打开详情，可在补偿信息备注中查看驳回说明');
        return;
      }
      ElMessage.info('请勾选一条协议后查看驳回记录');
    },
  },
  rejectPrev: {
    code: 'rejectPrev',
    label: '驳回前期',
    group: 'more',
    minSelected: 1,
    category: 'audit',
    description: '驳回至前期环节（与驳回相同 mock）',
    handler: async (ctx) => {
      if (!assertSelection(ctx, 1)) return;
      try {
        await ElMessageBox.confirm(
          `确认将 ${ctx.selected.length} 条驳回至前期（告知单）？`,
          '驳回前期',
          { type: 'warning' },
        );
      } catch {
        return;
      }
      const res = await rejectAgreements(selectedNos(ctx), '驳回前期');
      ElMessage.success(`已驳回前期 ${res?.total ?? ctx.selected.length} 条`);
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
    description: '预览附件一（打开详情）',
    handler: (ctx) => openPreview('附件一预览', ctx),
  },
  preview2: {
    code: 'preview2',
    label: '附件二预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '预览附件二（打开详情）',
    handler: (ctx) => openPreview('附件二预览', ctx),
  },
  ticket1: {
    code: 'ticket1',
    label: '房票附件一',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '房票附件一（打开详情）',
    handler: (ctx) => openPreview('房票附件一', ctx),
  },
  ticket2: {
    code: 'ticket2',
    label: '房票附件二',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '房票附件二（打开详情）',
    handler: (ctx) => openPreview('房票附件二', ctx),
  },
  preSave: {
    code: 'preSave',
    label: '协议预保存',
    group: 'main',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '打开详情进行预保存',
    handler: (ctx) => openPreview('协议预保存', ctx),
  },
  companyAgree: {
    code: 'companyAgree',
    label: '公司协议',
    group: 'main',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '公司协议预览（打开详情）',
    handler: (ctx) => openPreview('公司协议', ctx),
  },
  unlicensedAgree: {
    code: 'unlicensedAgree',
    label: '无证协议',
    group: 'main',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '无证协议预览（打开详情）',
    handler: (ctx) => openPreview('无证协议', ctx),
  },
  previewSupply: {
    code: 'previewSupply',
    label: '补充协议预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '补充协议预览（打开详情）',
    handler: (ctx) => openPreview('补充协议预览', ctx),
  },
  previewChange: {
    code: 'previewChange',
    label: '变更协议预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '变更协议预览（打开详情）',
    handler: (ctx) => openPreview('变更协议预览', ctx),
  },
  previewAgree: {
    code: 'previewAgree',
    label: '协议预览',
    group: 'more',
    minSelected: 1,
    maxSelected: 1,
    category: 'preview',
    description: '协议预览（打开详情）',
    handler: (ctx) => openPreview('协议预览', ctx),
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
 * 动作码 → 工具栏按钮（只保留已注册动作；可合并页面 bind）
 * @param codes 场景勾选的 code 或带 bind 的按钮对象
 */
export function resolveToolbarButtons(
  codes: AgreeToolbarButton[] | string[],
): AgreeToolbarButton[] {
  const list = codes || [];
  const result: AgreeToolbarButton[] = [];
  for (const item of list) {
    const code = typeof item === 'string' ? item : item.code;
    const def = AGREE_ACTION_REGISTRY[code];
    if (!def) continue;
    const fromSchema = typeof item === 'string' ? undefined : item;
    result.push({
      code: def.code,
      label: fromSchema?.label || def.label,
      type: (fromSchema?.type as AgreeToolbarButton['type']) || def.type,
      plain: fromSchema?.plain ?? def.plain,
      group: (fromSchema?.group as AgreeToolbarButton['group']) || def.group,
      bind: fromSchema?.bind,
    });
  }
  return result;
}

/**
 * 勾选行是否满足按钮 showWhenStatusIn
 * @param bind 绑定配置
 * @param selected 勾选行
 */
export function matchButtonShowWhen(
  bind: AgreeButtonBind | undefined,
  selected: AgreementListItem[],
): boolean {
  const allow = bind?.showWhenStatusIn;
  if (!allow?.length) return true;
  if (selected.length === 0) return true;
  return selected.every((r) => allow.includes(r.statusValue));
}

/**
 * 按 showWhen 过滤/禁用：有勾选且状态不符则从工具栏隐藏
 * @param buttons 按钮
 * @param selected 勾选行
 */
export function filterButtonsByShowWhen(
  buttons: AgreeToolbarButton[],
  selected: AgreementListItem[],
): AgreeToolbarButton[] {
  return (buttons || []).filter((b) => matchButtonShowWhen(b.bind, selected));
}

/**
 * 执行页面配置的差异化绑定（配置了 api 时返回 true 表示已处理完）
 * @param label 按钮文案
 * @param ctx 上下文
 * @param bind 绑定
 */
async function runConfiguredBind(
  label: string,
  ctx: AgreeActionContext,
  bind: AgreeButtonBind,
): Promise<boolean> {
  if (!bind.api) {
    return false;
  }

  if (bind.confirmText) {
    try {
      await ElMessageBox.confirm(bind.confirmText, label, { type: 'warning' });
    } catch {
      return true;
    }
  }

  const method = (bind.method || 'POST').toLowerCase() as
    | 'delete'
    | 'get'
    | 'post'
    | 'put';
  const payload = {
    agreementNos: selectedNos(ctx),
    scene: ctx.scene,
  };

  if (method === 'get') {
    await requestClient.get(bind.api, { params: payload });
  } else if (method === 'delete') {
    await requestClient.delete(bind.api, { data: payload });
  } else if (method === 'put') {
    await requestClient.put(bind.api, payload);
  } else {
    await requestClient.post(bind.api, payload);
  }

  ElMessage.success(bind.successMsg || `「${label}」执行成功`);
  await ctx.reload();

  if (bind.redirect === 'detail' && ctx.selected[0]) {
    openFirstSelected(ctx);
  } else if (bind.redirect) {
    await ctx.router.push(bind.redirect);
  }
  return true;
}

/**
 * 动作码 → 操作权限码（可点击；与 mock 菜单 button.authCode 对齐）
 * @param actionCode 动作注册表 code
 */
export function getAgreeActionAuthCode(actionCode: string) {
  return `Agree:${actionCode}`;
}

/**
 * 动作码 → 仅可见权限码（显示但置灰）
 * @param actionCode 动作注册表 code
 */
export function getAgreeActionViewAuthCode(actionCode: string) {
  return `Agree:View:${actionCode}`;
}

/**
 * 是否拥有协议动作「操作」权限（可点击执行）
 * @param actionCode 动作码
 * @param accessCodes 登录后下发的权限码
 */
export function canOperateAgreeAction(
  actionCode: string,
  accessCodes: string[] | undefined,
) {
  const codes = accessCodes || [];
  if (codes.includes('Agree:*')) return true;
  return codes.includes(getAgreeActionAuthCode(actionCode));
}

/**
 * 是否拥有协议动作「可见」权限（含仅可见 / 可操作）
 * @param actionCode 动作码
 * @param accessCodes 用户权限码
 */
export function canViewAgreeAction(
  actionCode: string,
  accessCodes: string[] | undefined,
) {
  const codes = accessCodes || [];
  if (codes.includes('Agree:*')) return true;
  return (
    codes.includes(getAgreeActionAuthCode(actionCode)) ||
    codes.includes(getAgreeActionViewAuthCode(actionCode))
  );
}

/**
 * @deprecated 请用 canOperateAgreeAction；保留别名兼容旧调用
 */
export function hasAgreeActionAccess(
  actionCode: string,
  accessCodes: string[] | undefined,
) {
  return canOperateAgreeAction(actionCode, accessCodes);
}

/**
 * 场景按钮 ∩ 可见权限；无操作权限时标记 disabled（可见但禁用）
 * @param buttons 场景已解析按钮
 * @param accessCodes 用户权限码
 */
export function filterButtonsByAccessCodes(
  buttons: AgreeToolbarButton[],
  accessCodes: string[] | undefined,
): AgreeToolbarButton[] {
  return (buttons || [])
    .filter((b) => canViewAgreeAction(b.code, accessCodes))
    .map((b) => ({
      ...b,
      // 仅有 Agree:View:xxx、没有 Agree:xxx → 置灰
      disabled: !canOperateAgreeAction(b.code, accessCodes),
    }));
}

/**
 * 是否已注册
 * @param code 动作码
 */
export function isAgreeActionRegistered(code: string) {
  return !!AGREE_ACTION_REGISTRY[code];
}

/**
 * 执行动作；优先走页面差异化绑定（api），否则默认 handler
 * @param code 动作码
 * @param ctx 上下文
 */
export async function runAgreeAction(code: string, ctx: AgreeActionContext) {
  const def = AGREE_ACTION_REGISTRY[code];
  if (!def) {
    ElMessage.error(
      `动作「${code}」未在动作库注册，无法执行（请联系开发添加）`,
    );
    return;
  }
  // 仅可见无操作：拦截执行
  if (!canOperateAgreeAction(code, ctx.accessCodes)) {
    if (canViewAgreeAction(code, ctx.accessCodes)) {
      ElMessage.warning(`「${def.label}」仅可见，无操作权限`);
    } else {
      ElMessage.error(`无权限执行「${def.label}」`);
    }
    return;
  }

  const bind = ctx.buttonBind;
  if (bind && !matchButtonShowWhen(bind, ctx.selected)) {
    ElMessage.warning(
      `当前选中数据状态不允许「${def.label}」（需：${(bind.showWhenStatusIn || []).join(' / ')}）`,
    );
    return;
  }

  if (bind) {
    const handled = await runConfiguredBind(def.label, ctx, bind);
    if (handled) return;
  }

  await def.handler(ctx);
}
