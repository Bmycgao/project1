/**
 * 注册 EpicDesigner（Element Plus UI）
 * 须在应用启动时调用一次，供 EDesigner / EBuilder 使用
 */
import { setupElementPlus } from '@epic-designer/element-plus';

import 'epic-designer/dist/style.css';

let installed = false;

/** 初始化 Epic 设计器/渲染器与 Element Plus 组件映射 */
export function setupEpicDesigner() {
  if (installed) return;
  setupElementPlus();
  installed = true;
}
