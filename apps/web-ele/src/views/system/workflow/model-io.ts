import type { WorkflowDocument } from '../../../../../shared/workflow';

import {
  exportWorkflowJson,
  parseWorkflowJson,
} from '../../../../../shared/workflow';

/** 在浏览器下载流程设计 JSON */
export function downloadWorkflowJson(doc: WorkflowDocument) {
  const text = exportWorkflowJson(doc);
  const code =
    (doc.code || 'workflow').replaceAll(/[^\w-]+/g, '_') || 'workflow';
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${code}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * 从本地文件读取并解析流程 JSON
 * @param file 用户选择的 .json 文件
 */
export async function readWorkflowJsonFile(file: File) {
  if (file.size > 1_000_000) throw new Error('流程 JSON 过大');
  return parseWorkflowJson(await file.text());
}
