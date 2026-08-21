/**

 * 注册 FormCreate 设计器 + 渲染器（Element Plus）

 *

 * Vben 按需引入：业务 SFC 里没用到的 EP 组件不会全局注册。

 * FormCreate 按字符串解析 el-input / el-row 等，必须在此显式 app.component 注册，

 * 否则会出现 Failed to resolve component: elRow / el-input。

 */

import type { App, Component } from 'vue';

import FcDesigner from '@form-create/designer';
import {
  ElAutocomplete,
  ElButton,
  ElCascader,
  ElCheckbox,
  ElCheckboxButton,
  ElCheckboxGroup,
  ElCol,
  ElColorPicker,
  ElDatePicker,
  ElDialog,
  ElDivider,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElOptionGroup,
  ElPopconfirm,
  ElPopover,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElRate,
  ElRow,
  ElSelect,
  ElSlider,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTimePicker,
  ElTimeSelect,
  ElTooltip,
  ElTransfer,
  ElTree,
  ElTreeSelect,
  ElUpload,
} from 'element-plus';

/** 设计器布局样式 */
import 'element-plus/es/components/aside/style/css';
import 'element-plus/es/components/badge/style/css';
/** 渲染器基础样式 */
import 'element-plus/es/components/container/style/css';
/** 布局（设计器三栏） */
import 'element-plus/es/components/header/style/css';
import 'element-plus/es/components/main/style/css';
import 'element-plus/es/components/autocomplete/style/css';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/cascader/style/css';
/** 表单栅格 + 常用控件样式 */
import 'element-plus/es/components/checkbox/style/css';
import 'element-plus/es/components/checkbox-button/style/css';
import 'element-plus/es/components/checkbox-group/style/css';
import 'element-plus/es/components/col/style/css';
import 'element-plus/es/components/color-picker/style/css';
import 'element-plus/es/components/date-picker/style/css';
import 'element-plus/es/components/dialog/style/css';
import 'element-plus/es/components/divider/style/css';
import 'element-plus/es/components/form/style/css';
import 'element-plus/es/components/form-item/style/css';
import 'element-plus/es/components/input/style/css';
import 'element-plus/es/components/input-number/style/css';
import 'element-plus/es/components/option/style/css';
import 'element-plus/es/components/option-group/style/css';
import 'element-plus/es/components/popconfirm/style/css';
import 'element-plus/es/components/popover/style/css';
import 'element-plus/es/components/radio/style/css';
import 'element-plus/es/components/radio-button/style/css';
import 'element-plus/es/components/radio-group/style/css';
import 'element-plus/es/components/rate/style/css';
import 'element-plus/es/components/row/style/css';
import 'element-plus/es/components/select/style/css';
import 'element-plus/es/components/slider/style/css';
import 'element-plus/es/components/switch/style/css';
import 'element-plus/es/components/table/style/css';
import 'element-plus/es/components/table-column/style/css';
import 'element-plus/es/components/time-picker/style/css';
import 'element-plus/es/components/time-select/style/css';
import 'element-plus/es/components/tooltip/style/css';
import 'element-plus/es/components/transfer/style/css';
import 'element-plus/es/components/tree/style/css';
import 'element-plus/es/components/tree-select/style/css';
import 'element-plus/es/components/upload/style/css';

import '@form-create/designer/src/style/icon.css';
import '@form-create/designer/src/style/index.css';
import '@form-create/element-ui/src/style/index.css';

/** FormCreate 会按 name 解析的 Element Plus 组件 */

const FORM_CREATE_EP_COMPONENTS: Component[] = [
  ElAutocomplete,

  ElButton,

  ElCascader,

  ElCheckbox,

  ElCheckboxButton,

  ElCheckboxGroup,

  ElCol,

  ElColorPicker,

  ElDatePicker,

  ElDialog,

  ElDivider,

  ElForm,

  ElFormItem,

  ElInput,

  ElInputNumber,

  ElOption,

  ElOptionGroup,

  ElPopconfirm,

  ElPopover,

  ElRadio,

  ElRadioButton,

  ElRadioGroup,

  ElRate,

  ElRow,

  ElSelect,

  ElSlider,

  ElSwitch,

  ElTable,

  ElTableColumn,

  ElTimePicker,

  ElTimeSelect,

  ElTooltip,

  ElTransfer,

  ElTree,

  ElTreeSelect,

  ElUpload,
];

/**

 * 全局注册 FormCreate 依赖的 EP 组件（含 Pascal / kebab 名）

 * @param app Vue 应用

 */

function registerEpComponents(app: App) {
  for (const comp of FORM_CREATE_EP_COMPONENTS) {
    const name = (comp as { name?: string }).name;

    if (!name) continue;

    app.component(name, comp);
  }
}

let installed = false;

/**

 * 挂载 FcDesigner、form-create 渲染器，并注册所需 EP 组件

 * @param app Vue 应用

 */

export function setupFormCreate(app: App) {
  if (installed) return;

  registerEpComponents(app);

  app.use(FcDesigner);

  app.use(FcDesigner.formCreate);

  installed = true;
}
