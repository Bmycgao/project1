import { cloneJson } from '../../clone';
import { agreePrintTemplate } from './agreement-template';

export type PrintTemplatePreset = 'blank' | 'example';

export const PRINT_TEMPLATE_PRESETS: {
  description: string;
  label: string;
  value: PrintTemplatePreset;
}[] = [
  {
    value: 'example',
    label: '完整示例模板',
    description:
      '两个内容区段，包含条形码、跨页明细、多层表头、合计、固定表单与条件正文。不预设明细筛选。',
  },
  {
    value: 'blank',
    label: '从空白开始',
    description: '从一张空白 A4 页面开始，自行添加内容与绑定字段。',
  },
];

/** 旧 business/demo 标记统一映射选择项，不修改已经保存的版式。 */
export function readPrintTemplatePreset(
  template: Record<string, any>,
): PrintTemplatePreset {
  return template.agreeTemplatePreset === 'blank' ? 'blank' : 'example';
}

export function createPrintTemplatePreset(
  preset: PrintTemplatePreset,
): Record<string, any> {
  const template = cloneJson(agreePrintTemplate);
  template.agreeTemplatePreset = preset;
  if (preset === 'blank') {
    template.panels = [template.panels[0]];
    template.panels[0].printElements = [];
  }
  return template;
}
