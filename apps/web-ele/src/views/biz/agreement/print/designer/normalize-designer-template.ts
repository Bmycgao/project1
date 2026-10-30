import { toDocumentTemplate } from '../runtime/document-layout';
import {
  applyPaperToTemplate,
  readTemplatePaperSpec,
} from '../runtime/print-paper';
import { sanitizePrintTemplate } from '../template/print-element-meta';

/** 加载与恢复默认共用同一套设计器模板初始化。 */
export function normalizeDesignerTemplate(source: Record<string, any>) {
  let template = toDocumentTemplate(sanitizePrintTemplate(source));
  const spec = readTemplatePaperSpec(template);
  if (spec.orientation === 'landscape') {
    template = applyPaperToTemplate(template, {
      sizeId: spec.sizeId,
      orientation: 'portrait',
      customWidthMm: spec.customWidthMm || spec.heightMm,
      customHeightMm: spec.customHeightMm || spec.widthMm,
    }).template;
  }
  return template;
}
