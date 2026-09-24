<script lang="ts" setup>
import type { PrintElementRef } from '../template/print-element-meta';

import { computed, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElColorPicker,
  ElForm,
  ElFormItem,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
} from 'element-plus';

/** 编辑选中元素的样式。只提交选项补丁，由父组件写回模板和画布。 */
const props = defineProps<{
  draft?: boolean;
  selected: null | PrintElementRef;
}>();
const emit = defineEmits<{ patch: [Record<string, unknown>] }>();
const selected = computed(() => props.selected);

const FONT_FAMILY_OPTIONS = [
  { label: '宋体', value: 'SimSun' },
  { label: '微软雅黑', value: 'Microsoft YaHei' },
  { label: '黑体', value: 'SimHei' },
  { label: '楷体', value: 'KaiTi' },
  { label: '仿宋', value: 'FangSong' },
] as const;

const FONT_WEIGHT_OPTIONS = [
  { label: '常规', value: 'normal' },
  { label: '中等', value: '500' },
  { label: '半粗', value: '600' },
  { label: '粗体', value: '700' },
  { label: '特粗', value: '900' },
] as const;

const BORDER_VISIBILITY_OPTIONS = [
  { label: '默认', value: '' },
  { label: '有边框', value: 'border' },
  { label: '无边框', value: 'noBorder' },
] as const;

/** hiprint 原生样式字段；新检视器只负责编辑，不改变预览/打印协议。 */
const styleFontFamily = ref('');
const styleFontSize = ref<number>();
const styleFontWeight = ref('');
const styleTextAlign = ref('');
const styleLineHeight = ref<number>();
const styleLetterSpacing = ref<number>();
const styleTextDecoration = ref('');
const styleTextVerticalAlign = ref('');
const styleColor = ref('');
const styleBackgroundColor = ref('');
const styleBorderWidth = ref<number>();
const styleBorderStyle = ref('');
const styleTableBorder = ref('');
const styleTableHeaderBackground = ref('');
const styleTableHeaderFontSize = ref<number>();
const styleTableHeaderFontWeight = ref('');
const styleTableHeaderRowHeight = ref<number>();
const styleTableHeaderCellBorder = ref('');
const styleTableHeaderBorder = ref('');
const styleTableBodyRowHeight = ref<number>();
const styleTableBodyCellBorder = ref('');
const styleTableFooterCellBorder = ref('');
const styleTableFooterBorder = ref('');
const isFormGrid = computed(() => !!selected.value?.options.agreeFormGrid);
const isTable = computed(() => selected.value?.type === 'table');
const isTextLike = computed(
  () => selected.value?.type === 'text' || selected.value?.type === 'longText',
);
const isCode = computed(() =>
  ['barcode', 'qrcode'].includes(
    String(selected.value?.options?.textType || ''),
  ),
);
const isLineOrShape = computed(() =>
  ['hline', 'rect', 'vline'].includes(String(selected.value?.type || '')),
);
const supportsTypography = computed(
  () => isTable.value || (isTextLike.value && !isCode.value),
);

function readStyleNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** 写回 hiprint 原生样式选项；画布读取同一 options，快速预览无需转换。 */
function persistElementStyle() {
  const el = selected.value;
  if (!el) return;
  const patch: Record<string, unknown> = {};
  if (supportsTypography.value) {
    Object.assign(patch, {
      backgroundColor: styleBackgroundColor.value,
      color: styleColor.value,
      fontFamily: styleFontFamily.value,
      fontSize: styleFontSize.value,
      fontWeight: styleFontWeight.value,
      lineHeight: styleLineHeight.value,
    });
  }
  if (isTextLike.value && !isCode.value) {
    Object.assign(patch, {
      letterSpacing: styleLetterSpacing.value,
      textAlign: styleTextAlign.value,
      textContentVerticalAlign: styleTextVerticalAlign.value,
      textDecoration: styleTextDecoration.value,
    });
  }
  if (isLineOrShape.value) {
    Object.assign(patch, {
      borderStyle: styleBorderStyle.value,
      borderWidth: styleBorderWidth.value,
      color: styleColor.value,
    });
  }
  if (isTable.value) {
    Object.assign(patch, {
      tableBodyCellBorder: styleTableBodyCellBorder.value,
      tableBodyRowHeight: styleTableBodyRowHeight.value,
      tableBorder: styleTableBorder.value,
      tableFooterCellBorder: styleTableFooterCellBorder.value,
      tableFooterBorder: styleTableFooterBorder.value,
      tableHeaderBackground: styleTableHeaderBackground.value,
      tableHeaderBorder: styleTableHeaderBorder.value,
      tableHeaderCellBorder: styleTableHeaderCellBorder.value,
      tableHeaderFontSize: styleTableHeaderFontSize.value,
      tableHeaderFontWeight: styleTableHeaderFontWeight.value,
      tableHeaderRowHeight: styleTableHeaderRowHeight.value,
    });
  }
  emit('patch', patch);
}

/** 清除本页可编辑的样式字段，恢复 hiprint 默认外观。 */
function resetElementStyle() {
  const el = selected.value;
  if (!el) return;
  const keys = [
    'backgroundColor',
    'borderStyle',
    'borderWidth',
    'color',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'tableBodyCellBorder',
    'tableBodyRowHeight',
    'tableBorder',
    'tableFooterCellBorder',
    'tableFooterBorder',
    'tableHeaderBackground',
    'tableHeaderBorder',
    'tableHeaderCellBorder',
    'tableHeaderFontSize',
    'tableHeaderFontWeight',
    'tableHeaderRowHeight',
    'textAlign',
    'textContentVerticalAlign',
    'textDecoration',
  ];
  emit('patch', Object.fromEntries(keys.map((key) => [key, null])));
  ElMessage.success('已恢复该元素的默认样式');
}

watch(
  selected,
  (el) => {
    if (!el) return;
    styleFontFamily.value = String(el.options.fontFamily || '');
    styleFontSize.value = readStyleNumber(el.options.fontSize);
    styleFontWeight.value = String(el.options.fontWeight || '');
    styleTextAlign.value = String(el.options.textAlign || '');
    styleLineHeight.value = readStyleNumber(el.options.lineHeight);
    styleLetterSpacing.value = readStyleNumber(el.options.letterSpacing);
    styleTextDecoration.value = String(el.options.textDecoration || '');
    styleTextVerticalAlign.value = String(
      el.options.textContentVerticalAlign || '',
    );
    styleColor.value = String(el.options.color || '');
    styleBackgroundColor.value = String(el.options.backgroundColor || '');
    styleBorderWidth.value = readStyleNumber(el.options.borderWidth);
    styleBorderStyle.value = String(el.options.borderStyle || '');
    styleTableBorder.value = String(el.options.tableBorder || '');
    styleTableHeaderBackground.value = String(
      el.options.tableHeaderBackground || '',
    );
    styleTableHeaderFontSize.value = readStyleNumber(
      el.options.tableHeaderFontSize,
    );
    styleTableHeaderFontWeight.value = String(
      el.options.tableHeaderFontWeight || '',
    );
    styleTableHeaderRowHeight.value = readStyleNumber(
      el.options.tableHeaderRowHeight,
    );
    styleTableHeaderCellBorder.value = String(
      el.options.tableHeaderCellBorder || '',
    );
    styleTableHeaderBorder.value = String(el.options.tableHeaderBorder || '');
    styleTableBodyRowHeight.value = readStyleNumber(
      el.options.tableBodyRowHeight,
    );
    styleTableBodyCellBorder.value = String(
      el.options.tableBodyCellBorder || '',
    );
    styleTableFooterCellBorder.value = String(
      el.options.tableFooterCellBorder || '',
    );
    styleTableFooterBorder.value = String(el.options.tableFooterBorder || '');
  },
  { immediate: true },
);
</script>

<template>
  <div class="print-style-panel">
    <ElAlert
      type="info"
      :closable="false"
      class="mb-2"
      :title="
        draft
          ? '修改先更新样例，点击应用到画布后生效；留空使用默认样式。'
          : '修改后同步到画布和打印预览，留空使用默认样式。'
      "
    />

    <template v-if="supportsTypography">
      <div class="print-style-panel__style-section">文字</div>
      <ElForm
        label-position="top"
        size="small"
        class="print-style-panel__style-grid"
      >
        <ElFormItem label="字体">
          <ElSelect
            v-model="styleFontFamily"
            clearable
            placeholder="默认（宋体）"
            @change="persistElementStyle"
          >
            <ElOption
              v-for="item in FONT_FAMILY_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="字号（pt）">
          <ElInputNumber
            v-model="styleFontSize"
            :min="4"
            :max="72"
            :precision="2"
            :step="0.75"
            controls-position="right"
            placeholder="默认 9"
            @change="persistElementStyle"
          />
        </ElFormItem>
        <ElFormItem label="字重">
          <ElSelect
            v-model="styleFontWeight"
            clearable
            placeholder="默认"
            @change="persistElementStyle"
          >
            <ElOption
              v-for="item in FONT_WEIGHT_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="行高（pt）">
          <ElInputNumber
            v-model="styleLineHeight"
            :min="4"
            :max="100"
            :precision="2"
            :step="0.75"
            controls-position="right"
            placeholder="默认 9.75"
            @change="persistElementStyle"
          />
        </ElFormItem>
      </ElForm>
      <div class="print-style-panel__color-row">
        <span>{{ isTable ? '整表默认文字颜色' : '文字颜色' }}</span>
        <ElColorPicker
          v-model="styleColor"
          show-alpha
          @change="persistElementStyle"
        />
        <ElButton
          v-if="styleColor"
          size="small"
          text
          @click="
            styleColor = '';
            persistElementStyle();
          "
        >
          清除
        </ElButton>
      </div>
      <p v-if="isTable" class="print-style-panel__hint">
        作用于整张表格，不会只修改画布中选中的单元格。
      </p>
      <div class="print-style-panel__color-row">
        <span>元素背景</span>
        <ElColorPicker
          v-model="styleBackgroundColor"
          show-alpha
          @change="persistElementStyle"
        />
        <ElButton
          v-if="styleBackgroundColor"
          size="small"
          text
          @click="
            styleBackgroundColor = '';
            persistElementStyle();
          "
        >
          清除
        </ElButton>
      </div>
    </template>

    <ElForm
      v-if="isTextLike && !isCode"
      label-position="top"
      size="small"
      class="print-style-panel__style-grid mt-2"
    >
      <ElFormItem label="左右对齐">
        <ElSelect
          v-model="styleTextAlign"
          clearable
          placeholder="默认（左）"
          @change="persistElementStyle"
        >
          <ElOption label="左对齐" value="left" />
          <ElOption label="居中" value="center" />
          <ElOption label="右对齐" value="right" />
          <ElOption label="两端对齐" value="justify" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="文字修饰">
        <ElSelect
          v-model="styleTextDecoration"
          clearable
          placeholder="无"
          @change="persistElementStyle"
        >
          <ElOption label="下划线" value="underline" />
          <ElOption label="删除线" value="line-through" />
          <ElOption label="上划线" value="overline" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="字间距（pt）">
        <ElInputNumber
          v-model="styleLetterSpacing"
          :min="0"
          :max="30"
          :precision="2"
          :step="0.75"
          controls-position="right"
          placeholder="默认 0"
          @change="persistElementStyle"
        />
      </ElFormItem>
      <ElFormItem label="上下对齐">
        <ElSelect
          v-model="styleTextVerticalAlign"
          clearable
          placeholder="默认（顶部）"
          @change="persistElementStyle"
        >
          <ElOption label="顶部" value="" />
          <ElOption label="垂直居中" value="middle" />
          <ElOption label="底部" value="bottom" />
        </ElSelect>
      </ElFormItem>
    </ElForm>

    <template v-if="isTable">
      <template v-if="!isFormGrid">
        <div class="print-style-panel__style-section mt-3">表头</div>
        <ElForm
          label-position="top"
          size="small"
          class="print-style-panel__style-grid"
        >
          <ElFormItem label="表头字号（pt）">
            <ElInputNumber
              v-model="styleTableHeaderFontSize"
              :min="4"
              :max="40"
              :precision="2"
              :step="0.75"
              controls-position="right"
              placeholder="默认 9"
              @change="persistElementStyle"
            />
          </ElFormItem>
          <ElFormItem label="表头字重">
            <ElSelect
              v-model="styleTableHeaderFontWeight"
              clearable
              placeholder="默认（粗体）"
              @change="persistElementStyle"
            >
              <ElOption
                v-for="item in FONT_WEIGHT_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="表头行高（pt）">
            <ElInputNumber
              v-model="styleTableHeaderRowHeight"
              :min="6"
              :max="100"
              :precision="2"
              :step="0.75"
              controls-position="right"
              placeholder="默认 18"
              @change="persistElementStyle"
            />
          </ElFormItem>
          <ElFormItem label="表头单元格边框">
            <ElSelect
              v-model="styleTableHeaderCellBorder"
              @change="persistElementStyle"
            >
              <ElOption
                v-for="item in BORDER_VISIBILITY_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="表头外边框">
            <ElSelect
              v-model="styleTableHeaderBorder"
              @change="persistElementStyle"
            >
              <ElOption
                v-for="item in BORDER_VISIBILITY_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </ElSelect>
          </ElFormItem>
        </ElForm>
        <div class="print-style-panel__color-row">
          <span>表头背景</span>
          <ElColorPicker
            v-model="styleTableHeaderBackground"
            show-alpha
            @change="persistElementStyle"
          />
          <ElButton
            v-if="styleTableHeaderBackground"
            size="small"
            text
            @click="
              styleTableHeaderBackground = '';
              persistElementStyle();
            "
          >
            清除
          </ElButton>
        </div>
      </template>
      <div class="print-style-panel__style-section mt-3">
        {{ isFormGrid ? '表格边框' : '表体与表尾' }}
      </div>
      <ElForm
        label-position="top"
        size="small"
        class="print-style-panel__style-grid"
      >
        <ElFormItem v-if="!isFormGrid" label="表体行高（pt）">
          <ElInputNumber
            v-model="styleTableBodyRowHeight"
            :min="6"
            :max="100"
            :precision="2"
            :step="0.75"
            controls-position="right"
            placeholder="默认 18"
            @change="persistElementStyle"
          />
        </ElFormItem>
        <ElFormItem label="表格外边框">
          <ElSelect v-model="styleTableBorder" @change="persistElementStyle">
            <ElOption
              v-for="item in BORDER_VISIBILITY_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="表体单元格边框">
          <ElSelect
            v-model="styleTableBodyCellBorder"
            @change="persistElementStyle"
          >
            <ElOption
              v-for="item in BORDER_VISIBILITY_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-if="!isFormGrid" label="表尾单元格边框">
          <ElSelect
            v-model="styleTableFooterCellBorder"
            @change="persistElementStyle"
          >
            <ElOption
              v-for="item in BORDER_VISIBILITY_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-if="!isFormGrid" label="表尾外边框">
          <ElSelect
            v-model="styleTableFooterBorder"
            @change="persistElementStyle"
          >
            <ElOption
              v-for="item in BORDER_VISIBILITY_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <p class="print-style-panel__hint">
        {{
          isFormGrid
            ? '单元格对齐、加粗和格式在“编辑自由表单 → 单元格”设置。'
            : '每列的对齐与格式在“编辑明细表 → 当前列与表头”设置。'
        }}
      </p>
    </template>

    <template v-if="isLineOrShape">
      <div class="print-style-panel__style-section">线条</div>
      <ElForm
        label-position="top"
        size="small"
        class="print-style-panel__style-grid"
      >
        <ElFormItem label="线宽（pt）">
          <ElInputNumber
            v-model="styleBorderWidth"
            :min="0.25"
            :max="12"
            :precision="2"
            :step="0.25"
            controls-position="right"
            placeholder="默认 0.75"
            @change="persistElementStyle"
          />
        </ElFormItem>
        <ElFormItem label="线型">
          <ElSelect
            v-model="styleBorderStyle"
            clearable
            placeholder="默认（实线）"
            @change="persistElementStyle"
          >
            <ElOption label="实线" value="solid" />
            <ElOption label="虚线" value="dashed" />
            <ElOption label="点线" value="dotted" />
            <ElOption label="双线" value="double" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <div class="print-style-panel__color-row">
        <span>线条颜色</span>
        <ElColorPicker
          v-model="styleColor"
          show-alpha
          @change="persistElementStyle"
        />
      </div>
    </template>

    <div v-if="isCode" class="text-xs text-gray-500">
      二维码和条形码的尺寸请直接拖动元素控制点；码制与绑定字段在“数据”中设置。
    </div>
    <div
      v-else-if="!supportsTypography && !isLineOrShape"
      class="text-xs text-gray-500"
    >
      当前元素暂无可编辑的通用样式。
    </div>
    <ElButton class="mt-3" size="small" @click="resetElementStyle">
      恢复默认样式
    </ElButton>
  </div>
</template>

<style scoped>
.print-style-panel__hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.print-style-panel__style-section {
  padding-bottom: 5px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  border-bottom: 1px solid var(--el-border-color);
}

.print-style-panel__style-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 8px;
}

.print-style-panel__style-grid :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 10px;
}

.print-style-panel__style-grid :deep(.el-input-number),
.print-style-panel__style-grid :deep(.el-select) {
  width: 100%;
}

.print-style-panel__color-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 36px;
  color: var(--el-text-color-regular);
}

.print-style-panel__color-row > span {
  min-width: 60px;
}
</style>
