import { createAgreementExampleTemplate } from '../../shared/print-template-example';

/** 与前端共用示例；只用于新建或未持久化的 mock 种子。 */
export const BASE_AGREEMENT_PRINT_TEMPLATE = createAgreementExampleTemplate();

export function clonePrintTemplateWithTitle(title: string) {
  const template = structuredClone(BASE_AGREEMENT_PRINT_TEMPLATE);
  const heading = template.panels?.[0]?.printElements?.[0]?.options;
  if (heading) heading.title = title;
  return template;
}
