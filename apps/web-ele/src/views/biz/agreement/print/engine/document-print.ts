import type { AgreePrintData } from '../types';

import { renderDocument } from '../runtime/document-renderer';
import { ensureHiprint } from './ensure-hiprint';

/** hiprint 仅负责打印对话框和 PDF 封装，不再二次排版正文。 */
export async function createDocumentPrint(
  template: Record<string, any>,
  data: AgreePrintData,
) {
  const { $, PrintTemplate } = await ensureHiprint();
  const html = await renderDocument(template, data);
  const inst = new PrintTemplate({
    template: {
      panels: (template.panels || []).map((panel: any) => ({
        ...panel,
        paperType: undefined,
        printElements: [],
      })),
    },
  });
  inst.getHtml = () => $(html.cloneNode(true));
  inst.__agreePrintData = data;
  inst.__documentFlow = true;
  return inst;
}
