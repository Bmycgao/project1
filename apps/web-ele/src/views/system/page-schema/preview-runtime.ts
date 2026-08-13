/**
 * 页面配置可视化预览：按「当前草稿配置 + 某角色权限码」模拟列表列/按钮/字段/模块效果
 * 不落库、不调业务接口，仅前端计算
 */
import type { PageSchemaApi } from '#/api';

import {
  filterButtonsByAccessCodes,
  resolveToolbarButtons,
  type AgreeButtonBind,
  type AgreeToolbarButton,
} from '../../biz/agreement/actions';
import {
  filterColumnsByFieldRules,
  formatAgreeFieldValue,
  resolveFieldAccess,
  type AgreeFieldRule,
} from '../../biz/agreement/field-access';
import {
  AGREE_DETAIL_MODULES,
  isAgreeModuleVisible,
  normalizeAgreeModuleMounts,
  normalizeModuleSpan,
  resolveAgreeModulesForPage,
  type AgreeModuleMount,
} from '../../biz/agreement/module-access';

/** 预览入参（表单草稿） */
export interface SchemaPreviewInput {
  schemaKind: 'entity' | 'scene' | 'template';
  /** 可见列（场景可传模板列） */
  columns: PageSchemaApi.Column[];
  /** 字段规则（场景可传模板规则） */
  fieldRules?: AgreeFieldRule[];
  /** 场景勾选动作码 */
  actionCodes?: string[];
  /** 动作差异化绑定 */
  actionBinds?: Record<string, AgreeButtonBind>;
  /** 模拟勾选行状态（测 showWhen） */
  sampleStatus?: string;
  /** 详情模块挂载 */
  modules?: AgreeModuleMount[];
}

/** 列预览行 */
export interface PreviewColumnRow {
  field: string;
  title: string;
  shown: boolean;
  reason: string;
}

/** 按钮预览行 */
export interface PreviewButtonRow {
  code: string;
  label: string;
  shown: boolean;
  /** 可见但不可点 */
  disabled?: boolean;
  reason: string;
}

/** 字段规则预览行 */
export interface PreviewFieldRow {
  field: string;
  remark?: string;
  visible: boolean;
  editable: boolean;
  /** 展示格式示例 */
  formatSample?: string;
  reason: string;
}

/** 详情模块预览行 */
export interface PreviewModuleRow {
  key: string;
  label: string;
  shown: boolean;
  /** 布局顺序 */
  order?: number;
  /** 栅格占比 */
  span?: number;
  reason: string;
}

/** 预览结果 */
export interface SchemaPreviewResult {
  columns: PreviewColumnRow[];
  buttons: PreviewButtonRow[];
  fields: PreviewFieldRow[];
  modules: PreviewModuleRow[];
  shownColumnCount: number;
  shownButtonCount: number;
  shownModuleCount: number;
}

/**
 * 根据配置草稿 + 权限码生成预览
 * @param input 草稿
 * @param accessCodes 角色权限码
 */
export function buildSchemaPreview(
  input: SchemaPreviewInput,
  accessCodes: string[] | undefined,
): SchemaPreviewResult {
  const rules = input.fieldRules || [];
  const visibleCols = (input.columns || []).filter((c) => c.visible !== false);
  const afterField = filterColumnsByFieldRules(
    visibleCols.map((c) => ({ ...c, visible: true })),
    rules,
    accessCodes,
  );
  const shownFields = new Set(afterField.map((c) => c.field));

  const columns: PreviewColumnRow[] = visibleCols.map((c) => {
    const shown = shownFields.has(c.field);
    const access = resolveFieldAccess(c.field, rules, accessCodes);
    let reason = '可见';
    if (!shown) {
      reason = access.visible
        ? '列配置隐藏'
        : '缺少字段可见权限码';
    }
    return {
      field: c.field,
      title: c.title,
      shown,
      reason,
    };
  });

  const buttons: PreviewButtonRow[] = [];
  if (input.schemaKind === 'scene' && input.actionCodes?.length) {
    const withBind = input.actionCodes.map((code) => ({
      code,
      bind: input.actionBinds?.[code],
    }));
    const resolved = resolveToolbarButtons(
      withBind as AgreeToolbarButton[],
    );
    const byAccess = filterButtonsByAccessCodes(resolved, accessCodes);
    const accessMap = new Map(byAccess.map((b) => [b.code, b]));

    const sampleSelected = input.sampleStatus
      ? [{ statusValue: input.sampleStatus } as any]
      : [];

    for (const b of resolved) {
      const accessed = accessMap.get(b.code);
      if (!accessed) {
        buttons.push({
          code: b.code,
          label: b.label,
          shown: false,
          disabled: false,
          reason: '角色无可见权限（缺 Agree:xxx / Agree:View:xxx）',
        });
        continue;
      }
      if (accessed.disabled) {
        buttons.push({
          code: b.code,
          label: b.label,
          shown: true,
          disabled: true,
          reason: '仅可见无操作权限（有 Agree:View:xxx，无 Agree:xxx）',
        });
        continue;
      }
      const showWhen = b.bind?.showWhenStatusIn;
      if (
        showWhen?.length &&
        sampleSelected.length &&
        !sampleSelected.every((row) =>
          showWhen.includes(String(row.statusValue || '')),
        )
      ) {
        buttons.push({
          code: b.code,
          label: b.label,
          shown: false,
          reason: `状态需为：${showWhen.join(' / ')}`,
        });
        continue;
      }
      if (showWhen?.length && !sampleSelected.length) {
        buttons.push({
          code: b.code,
          label: b.label,
          shown: true,
          reason: `有操作权限（未选模拟状态；运行时需状态：${showWhen.join(' / ')}）`,
        });
        continue;
      }
      buttons.push({
        code: b.code,
        label: b.label,
        shown: true,
        disabled: false,
        reason: '有操作权限且状态允许',
      });
    }
  }

  const fields: PreviewFieldRow[] = rules.map((r) => {
    const access = resolveFieldAccess(r.field, rules, accessCodes);
    let reason = '可见且可编辑';
    if (!access.visible) {
      reason = r.hidden ? '强制隐藏' : '缺少可见权限码';
    } else if (!access.editable) {
      reason = '可见但只读（缺可编辑权限码）';
    }
    let formatSample = '—';
    if (r.displayFormat?.type === 'money') {
      formatSample = formatAgreeFieldValue(1234567.8, r.displayFormat);
    } else if (r.displayFormat?.type === 'date') {
      formatSample = formatAgreeFieldValue('2026-03-15', r.displayFormat);
    }
    return {
      field: r.field,
      remark: r.remark,
      visible: access.visible,
      editable: access.editable,
      formatSample,
      reason,
    };
  });

  const modules: PreviewModuleRow[] = [];
  if (input.schemaKind === 'scene') {
    const normalized = normalizeAgreeModuleMounts(input.modules);
    const shownList = resolveAgreeModulesForPage(
      input.modules,
      accessCodes,
    );
    const shownMap = new Map(shownList.map((m) => [m.key, m]));
    for (const mount of [...normalized].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    )) {
      const meta = AGREE_DETAIL_MODULES.find((m) => m.key === mount.key);
      if (!meta) continue;
      const layout = shownMap.get(mount.key);
      if (!mount.enabled) {
        modules.push({
          key: mount.key,
          label: meta.label,
          shown: false,
          order: mount.order,
          span: normalizeModuleSpan(mount.span),
          reason: '场景未挂载该模块',
        });
        continue;
      }
      if (!isAgreeModuleVisible(mount.key, accessCodes)) {
        modules.push({
          key: mount.key,
          label: meta.label,
          shown: false,
          order: mount.order,
          span: normalizeModuleSpan(mount.span),
          reason: `缺少 ${meta.authCode}`,
        });
        continue;
      }
      modules.push({
        key: mount.key,
        label: meta.label,
        shown: true,
        order: layout?.order ?? mount.order,
        span: layout?.span ?? normalizeModuleSpan(mount.span),
        reason: `已挂载 · 顺序 ${layout?.order ?? mount.order} · 占比 ${layout?.span ?? normalizeModuleSpan(mount.span)}/24`,
      });
    }
  }

  return {
    columns,
    buttons,
    fields,
    modules,
    shownColumnCount: columns.filter((c) => c.shown).length,
    shownButtonCount: buttons.filter((b) => b.shown).length,
    shownModuleCount: modules.filter((m) => m.shown).length,
  };
}
