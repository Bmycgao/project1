import { getPrintTemplateByCode } from '#/api/system/print-template';

import { cloneJson as cloneTemplate } from '../../clone';
import { agreePrintTemplate } from './agreement-template';

/** 独立协议设计器的本地模板键；系统模板编辑页使用服务端保存。 */
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
 * 独立协议设计器读取本地模板；无保存记录时使用默认版式。
 * 按模板编码打印时使用 loadPrintTemplateByCode。
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
 * 独立协议设计器保存本地模板；系统模板编辑页通过 API 保存。
 * @param template 设计画布的完整模板 JSON
 */
export function saveAgreePrintTemplate(template: Record<string, any>) {
  localStorage.setItem(AGREE_PRINT_TEMPLATE_KEY, JSON.stringify(template));
}
