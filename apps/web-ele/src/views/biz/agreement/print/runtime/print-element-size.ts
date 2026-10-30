import type { PrintElementRef } from '../template/print-element-meta';

import { patchElementOptions } from '../template/print-element-meta';
import { setDocumentElementWidth } from './document-layout';

/** 修改物理宽度时同步文档流占位，保留同行排版和撤销所需的完整模板。 */
export function patchPrintElementSize(
  template: Record<string, any>,
  selected: PrintElementRef,
  patch: Record<string, unknown>,
) {
  let next = patchElementOptions(template, selected, patch);
  if (Number(patch.width) > 0 && selected.options.agreeDocument) {
    const panel = next.panels[selected.panelIndex];
    const bodyWidth = (Number(panel.width || 210) * 72) / 25.4 - 40;
    next = setDocumentElementWidth(
      next,
      `${selected.panelIndex}:${selected.elementIndex}`,
      (Number(patch.width) / bodyWidth) * 100,
    );
    const options =
      next.panels[selected.panelIndex].printElements[selected.elementIndex]
        .options;
    options.width = (bodyWidth * options.agreeDocument.width) / 100;
  }
  return next;
}
