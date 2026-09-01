import { getPrintTemplateByCode } from '#/api/system/print-template';

import { agreePrintTemplate } from './agreement-template';

/** localStorage 键：协议打印模板 JSON（已废弃，仅作离线兜底） */
export const AGREE_PRINT_TEMPLATE_KEY = 'agree_print_template_v1';

/**
 * 按 templateCode 从服务端加载模板；失败时回退默认版式
 * @param code 模板编码，如 PrintFujian1
 */
export async function loadPrintTemplateByCode(
  code: string,
): Promise<Record<string, any>> {
  const c = String(code || '').trim();
  if (!c) return cloneTemplate(agreePrintTemplate);
  try {
    const node = await getPrintTemplateByCode(c);
    if (node?.templateJson?.panels?.length) {
      return cloneTemplate(node.templateJson);
    }
  } catch {
    // 接口不可用时走本地默认
  }
  return cloneTemplate(agreePrintTemplate);
}

/**
 * @deprecated 请使用 loadPrintTemplateByCode('PrintAgreement')
 * 读取已保存的打印模板；无则返回默认模板深拷贝
 */
export function loadAgreePrintTemplate(): Record<string, any> {
  try {
    const raw = localStorage.getItem(AGREE_PRINT_TEMPLATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.panels?.length) return parsed;
    }
  } catch {
    // ignore
  }
  return cloneTemplate(agreePrintTemplate);
}

/**
 * @deprecated 请在系统管理打印模板页保存
 * @param template hiprint getJson 结果
 */
export function saveAgreePrintTemplate(template: Record<string, any>) {
  localStorage.setItem(AGREE_PRINT_TEMPLATE_KEY, JSON.stringify(template));
}

/** 清除本地自定义模板 */
export function clearAgreePrintTemplate() {
  localStorage.removeItem(AGREE_PRINT_TEMPLATE_KEY);
}

/** 是否已有用户自定义模板（localStorage 兜底） */
export function hasCustomAgreePrintTemplate() {
  return !!localStorage.getItem(AGREE_PRINT_TEMPLATE_KEY);
}

/**
 * 深拷贝模板 JSON
 * @param tpl 模板
 */
export function cloneTemplate(tpl: Record<string, any>) {
  return JSON.parse(JSON.stringify(tpl)) as Record<string, any>;
}
