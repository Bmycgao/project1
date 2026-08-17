<script lang="ts" setup>
/**
 * 协议详情设计器：左业务组件 / 中 WYSIWYG 画布 / 右「点选」属性
 * 表单可增删字段、拖顺序/占宽；表格配列宽/单元格/增删行
 */
import type { AgreementModuleKey } from '../../../biz/agreement/types';
import type {
  ModuleInnerConfig,
  ModuleInnerControlType,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../../../biz/agreement/module-inner-config';
import type { ModuleLayoutEditRow } from './module-layout-editor.vue';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { GripVertical } from '@vben/icons';

import {
  ElButton,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTag,
} from 'element-plus';

import {
  AGREE_DETAIL_MODULES,
  type AgreeModuleMeta,
} from '../../../biz/agreement/module-access';
import {
  FORM_CONTROL_OPTIONS,
  FORM_SPAN_OPTIONS,
  TABLE_CELL_OPTIONS,
  isCustomBasicSection,
  normalizeFieldSpan,
  resolveEnabledFields,
  resolveEnabledSections,
  snapFieldSpan,
  type ModuleInnerCellType,
} from '../../../biz/agreement/module-inner-config';

const layouts = defineModel<ModuleLayoutEditRow[]>('layouts', {
  required: true,
});
const basicInner = defineModel<ModuleInnerConfig>('basicInner', {
  required: true,
});
const housesInner = defineModel<ModuleInnerConfig>('housesInner', {
  required: true,
});
const compensationInner = defineModel<ModuleInnerConfig>('compensationInner', {
  required: true,
});
const rewardsInner = defineModel<ModuleInnerConfig>('rewardsInner', {
  required: true,
});
const populationInner = defineModel<ModuleInnerConfig>('populationInner', {
  required: true,
});

const selectedKey = ref<AgreementModuleKey>('basic');
/** 当前点中的子块（表格多表时用） */
const selectedSectionKey = ref('');
/** 当前点中的字段/列 */
const selectedFieldKey = ref('');
const tabListRef = ref<HTMLElement | null>(null);
const canvasPageRef = ref<HTMLElement | null>(null);
let tabSortable: { destroy: () => void } | null = null;
const formSortables: { destroy: () => void }[] = [];

const palette = AGREE_DETAIL_MODULES;

const mounted = computed(() =>
  [...layouts.value]
    .filter((r) => r.enabled)
    .sort((a, b) => a.order - b.order),
);

const basicOnCanvas = computed(() =>
  mounted.value.find((r) => r.key === 'basic'),
);

const tabMounted = computed(() =>
  mounted.value.filter((r) => r.key !== 'basic'),
);

watch(
  mounted,
  (list) => {
    if (!list.length) return;
    if (!list.some((r) => r.key === selectedKey.value)) {
      selectedKey.value = list[0]!.key;
      selectedFieldKey.value = '';
    }
  },
  { immediate: true },
);

function metaOf(key: string): AgreeModuleMeta | undefined {
  return palette.find((m) => m.key === key);
}

function isMounted(key: AgreementModuleKey) {
  return layouts.value.some((r) => r.key === key && r.enabled);
}

function isTableWidget(key: AgreementModuleKey) {
  return metaOf(key)?.widgetKind === 'table';
}

/**
 * 当前选中模块的内部配置
 */
const selectedInner = computed({
  get(): ModuleInnerConfig {
    return innerOf(selectedKey.value);
  },
  set(val: ModuleInnerConfig) {
    assignInner(selectedKey.value, val);
  },
});

const selectedSections = computed(() =>
  resolveEnabledSections(selectedInner.value),
);

const currentSection = computed(() => {
  const secs = selectedSections.value;
  return (
    secs.find((s) => s.key === selectedSectionKey.value) || secs[0] || null
  );
});

const currentField = computed(() => {
  const sec = currentSection.value;
  if (!sec || !selectedFieldKey.value) return null;
  return sec.fields.find((f) => f.key === selectedFieldKey.value) || null;
});

function addToCanvas(key: AgreementModuleKey) {
  const maxOrder = Math.max(0, ...layouts.value.map((r) => r.order || 0));
  layouts.value = layouts.value.map((row) =>
    row.key === key ? { ...row, enabled: true, order: maxOrder + 10 } : row,
  );
  selectBlock(key);
}

function removeFromCanvas(key: AgreementModuleKey) {
  layouts.value = layouts.value.map((row) =>
    row.key === key ? { ...row, enabled: false } : row,
  );
}

/**
 * 选中整块（清空字段点选）
 * @param key 模块
 */
function selectBlock(key: AgreementModuleKey) {
  selectedKey.value = key;
  selectedFieldKey.value = '';
  selectedSectionKey.value = resolveEnabledSections(innerOf(key))[0]?.key || '';
}

/**
 * 点选字段/列
 * @param moduleKey 模块
 * @param sectionKey 子块
 * @param fieldKey 字段
 */
function selectField(
  moduleKey: AgreementModuleKey,
  sectionKey: string,
  fieldKey: string,
) {
  selectedKey.value = moduleKey;
  selectedSectionKey.value = sectionKey;
  selectedFieldKey.value = fieldKey;
}

function innerOf(key: AgreementModuleKey): ModuleInnerConfig {
  if (key === 'basic') return basicInner.value;
  if (key === 'houses') return housesInner.value;
  if (key === 'compensation') return compensationInner.value;
  if (key === 'rewards') return rewardsInner.value;
  return populationInner.value;
}

function previewSections(key: AgreementModuleKey) {
  return resolveEnabledSections(innerOf(key));
}

function previewFields(section: ModuleInnerSection) {
  return resolveEnabledFields(section).filter((f) => f.key !== '_selection');
}

/** 表单子块（排除自定义表格） */
function formSectionsOf(key: AgreementModuleKey) {
  return previewSections(key).filter((s) => !isCustomBasicSection(s));
}

/** 基础信息里残留的自定义表格子块 */
function customSectionsOf(key: AgreementModuleKey) {
  return previewSections(key).filter((s) => isCustomBasicSection(s));
}

/**
 * 属性面板是否按表格展示（整模块是表，或当前点中自定义表）
 */
function isTableContext() {
  if (isTableWidget(selectedKey.value)) return true;
  return currentSection.value?.custom === true;
}

/**
 * 写回指定模块内部配置
 * @param key 模块
 * @param next 下一份
 */
function assignInner(key: AgreementModuleKey, next: ModuleInnerConfig) {
  const cloned: ModuleInnerConfig = {
    sections: next.sections.map((s) => ({
      ...s,
      fields: [...s.fields],
    })),
  };
  if (key === 'basic') basicInner.value = cloned;
  else if (key === 'houses') housesInner.value = cloned;
  else if (key === 'compensation') compensationInner.value = cloned;
  else if (key === 'rewards') rewardsInner.value = cloned;
  else populationInner.value = cloned;
}

/**
 * 按画布 DOM 顺序写回字段 order
 * @param el 栅格容器
 */
function syncFieldOrderFromGrid(el: HTMLElement) {
  const moduleKey = el.dataset.moduleKey as AgreementModuleKey;
  const sectionKey = el.dataset.sectionKey || '';
  if (!moduleKey || !sectionKey) return;
  const keys = [...el.querySelectorAll('.form-cell')]
    .map((n) => (n as HTMLElement).dataset.fieldKey)
    .filter(Boolean) as string[];
  const src = innerOf(moduleKey);
  const next: ModuleInnerConfig = {
    sections: src.sections.map((s) => {
      if (s.key !== sectionKey) return s;
      const byKey = new Map(s.fields.map((f) => [f.key, f]));
      const seen = new Set(keys);
      const ordered = keys
        .map((k, i) => {
          const f = byKey.get(k);
          return f ? { ...f, order: (i + 1) * 10 } : null;
        })
        .filter(Boolean) as ModuleInnerFieldItem[];
      const rest = s.fields
        .filter((f) => !seen.has(f.key))
        .map((f, i) => ({ ...f, order: 1000 + i * 10 }));
      return { ...s, fields: [...ordered, ...rest] };
    }),
  };
  assignInner(moduleKey, next);
}

/**
 * 给每个表单栅格挂拖拽排序
 */
async function initFormSortable() {
  formSortables.forEach((s) => s.destroy());
  formSortables.length = 0;
  const root = canvasPageRef.value;
  if (!root) return;
  const Sortable = await loadSortable();
  if (!Sortable?.create) return;
  root.querySelectorAll('.form-grid').forEach((node) => {
    formSortables.push(
      Sortable.create(node, {
        animation: 180,
        handle: '.cell-drag',
        draggable: '.form-cell',
        onEnd() {
          syncFieldOrderFromGrid(node as HTMLElement);
        },
      }),
    );
  });
}

/**
 * 拖右侧把手改占宽（吸附 8/12/16/24）
 * @param e 鼠标按下
 * @param moduleKey 模块
 * @param sectionKey 子块
 * @param fieldKey 字段
 */
function onSpanResizeStart(
  e: MouseEvent,
  moduleKey: AgreementModuleKey,
  sectionKey: string,
  fieldKey: string,
) {
  e.preventDefault();
  const grid = (e.currentTarget as HTMLElement).closest(
    '.form-grid',
  ) as HTMLElement | null;
  if (!grid) return;
  const field = innerOf(moduleKey)
    .sections.find((s) => s.key === sectionKey)
    ?.fields.find((f) => f.key === fieldKey);
  if (!field) return;
  const startX = e.clientX;
  const startSpan = normalizeFieldSpan(field.span);
  const colWidth = Math.max(grid.clientWidth / 24, 8);
  selectField(moduleKey, sectionKey, fieldKey);
  const onMove = (ev: MouseEvent) => {
    const next = snapFieldSpan(startSpan + (ev.clientX - startX) / colWidth);
    patchFieldAt(moduleKey, sectionKey, fieldKey, { span: next });
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/**
 * 改指定字段属性（不依赖当前选中）
 */
function patchFieldAt(
  moduleKey: AgreementModuleKey,
  sectionKey: string,
  fieldKey: string,
  patch: Partial<ModuleInnerFieldItem>,
) {
  const src = innerOf(moduleKey);
  assignInner(moduleKey, {
    sections: src.sections.map((s) => {
      if (s.key !== sectionKey) return s;
      return {
        ...s,
        fields: s.fields.map((f) =>
          f.key === fieldKey ? { ...f, ...patch } : f,
        ),
      };
    }),
  });
}

/**
 * 写回当前模块内部配置
 * @param next 下一份
 */
function commitInner(next: ModuleInnerConfig) {
  selectedInner.value = {
    sections: next.sections.map((s) => ({
      ...s,
      fields: [...s.fields],
    })),
  };
}

/**
 * 更新当前字段若干属性
 * @param patch 局部属性
 */
function patchField(patch: Partial<ModuleInnerFieldItem>) {
  const secKey = currentSection.value?.key;
  const fieldKey = selectedFieldKey.value;
  if (!secKey || !fieldKey) return;
  const next: ModuleInnerConfig = {
    sections: selectedInner.value.sections.map((s) => {
      if (s.key !== secKey) return s;
      return {
        ...s,
        fields: s.fields.map((f) =>
          f.key === fieldKey ? { ...f, ...patch } : f,
        ),
      };
    }),
  };
  commitInner(next);
}

function setFieldEnabled(sectionKey: string, fieldKey: string, enabled: boolean) {
  const next: ModuleInnerConfig = {
    sections: selectedInner.value.sections.map((s) => {
      if (s.key !== sectionKey) return s;
      return {
        ...s,
        fields: s.fields.map((f) =>
          f.key === fieldKey ? { ...f, enabled } : f,
        ),
      };
    }),
  };
  commitInner(next);
}

/**
 * 表格：插入一列
 */
function addTableColumn() {
  const sec = currentSection.value;
  if (!sec) return;
  const maxOrder = Math.max(0, ...sec.fields.map((f) => f.order));
  const key = `col_${Date.now()}`;
  const next: ModuleInnerConfig = {
    sections: selectedInner.value.sections.map((s) => {
      if (s.key !== sec.key) return s;
      return {
        ...s,
        fields: [
          ...s.fields,
          {
            key,
            label: '新列',
            enabled: true,
            order: maxOrder + 10,
            minWidth: 120,
            custom: true,
            cellType: 'text' as ModuleInnerCellType,
          },
        ],
      };
    }),
  };
  commitInner(next);
  selectedFieldKey.value = key;
}

/**
 * 表单：新增扩展字段（如「用户名」），保存后详情页按 schema 渲染
 */
function addFormField() {
  const sec = currentSection.value;
  if (!sec || isTableContext()) return;
  const maxOrder = Math.max(0, ...sec.fields.map((f) => f.order));
  const key = `ext_${Date.now()}`;
  const next: ModuleInnerConfig = {
    sections: selectedInner.value.sections.map((s) => {
      if (s.key !== sec.key) return s;
      return {
        ...s,
        fields: [
          ...s.fields,
          {
            key,
            label: '新字段',
            enabled: true,
            order: maxOrder + 10,
            custom: true,
            controlType: 'input',
            span: 8,
          },
        ],
      };
    }),
  };
  commitInner(next);
  selectedFieldKey.value = key;
}

/**
 * 删除当前字段：自定义直接去掉；内置写入 removedFieldKeys，normalize 不再补回
 */
function removeCurrentField() {
  const sec = currentSection.value;
  const field = currentField.value;
  if (!sec || !field || field.key === '_selection') return;
  const next: ModuleInnerConfig = {
    sections: selectedInner.value.sections.map((s) => {
      if (s.key !== sec.key) return s;
      const removed = new Set(s.removedFieldKeys || []);
      if (!field.custom) removed.add(field.key);
      return {
        ...s,
        removedFieldKeys: [...removed],
        fields: s.fields.filter((f) => f.key !== field.key),
      };
    }),
  };
  commitInner(next);
  selectedFieldKey.value = '';
}

/**
 * 自定义字段可改数据 key（如 username），便于详情保存到 basic/population 扩展值
 * @param raw 新 key
 */
function renameCustomFieldKey(raw: string) {
  const sec = currentSection.value;
  const field = currentField.value;
  const nextKey = String(raw || '')
    .trim()
    .replace(/\s+/g, '_');
  if (!sec || !field?.custom || !nextKey || nextKey === field.key) return;
  if (sec.fields.some((f) => f.key === nextKey)) return;
  const next: ModuleInnerConfig = {
    sections: selectedInner.value.sections.map((s) => {
      if (s.key !== sec.key) return s;
      return {
        ...s,
        fields: s.fields.map((f) =>
          f.key === field.key ? { ...f, key: nextKey } : f,
        ),
      };
    }),
  };
  commitInner(next);
  selectedFieldKey.value = nextKey;
}

function patchTableOptions(patch: {
  allowAdd?: boolean;
  allowRemove?: boolean;
  minRows?: number;
}) {
  const sec = currentSection.value;
  if (!sec) return;
  const next: ModuleInnerConfig = {
    sections: selectedInner.value.sections.map((s) => {
      if (s.key !== sec.key) return s;
      return {
        ...s,
        tableOptions: {
          allowAdd: s.tableOptions?.allowAdd ?? true,
          allowRemove: s.tableOptions?.allowRemove ?? true,
          minRows: s.tableOptions?.minRows ?? 1,
          ...patch,
        },
      };
    }),
  };
  commitInner(next);
}

function controlPreview(field: ModuleInnerFieldItem) {
  const t = field.controlType || 'input';
  if (t === 'select' || t === 'yesno') return '下拉';
  if (t === 'textarea') return '多行';
  if (t === 'date') return '日期';
  if (t === 'radio') return '单选';
  return '输入';
}

function colSpan(field: ModuleInnerFieldItem) {
  return normalizeFieldSpan(field.span);
}

function syncTabOrderFromDom() {
  const el = tabListRef.value;
  if (!el) return;
  const keys = [...el.children]
    .map((n) => (n as HTMLElement).dataset.key)
    .filter(Boolean) as AgreementModuleKey[];
  const orderByKey = new Map(keys.map((k, i) => [k, (i + 2) * 10]));
  layouts.value = layouts.value.map((row) => {
    if (row.key === 'basic') return { ...row, order: 10 };
    const next = orderByKey.get(row.key);
    return next === undefined ? row : { ...row, order: next };
  });
}

async function loadSortable() {
  const mod = await import(
    // @ts-expect-error sortable 完整包
    'sortablejs/modular/sortable.complete.esm.js'
  );
  return mod?.default;
}

async function initTabSortable() {
  tabSortable?.destroy();
  tabSortable = null;
  const el = tabListRef.value;
  if (!el) return;
  const Sortable = await loadSortable();
  if (!Sortable?.create) return;
  tabSortable = Sortable.create(el, {
    animation: 180,
    handle: '.tab-drag',
    draggable: '.canvas-tab',
    onEnd() {
      syncTabOrderFromDom();
    },
  });
}

onMounted(() => {
  void nextTick().then(() => {
    void initTabSortable();
    void initFormSortable();
  });
});

onBeforeUnmount(() => {
  tabSortable?.destroy();
  formSortables.forEach((s) => s.destroy());
});

watch(
  () => tabMounted.value.map((r) => r.key).join(','),
  () => {
    void nextTick().then(() => initTabSortable());
  },
);

watch(
  () =>
    [
      selectedKey.value,
      mounted.value.map((r) => r.key).join(','),
      selectedInner.value.sections
        .flatMap((s) => s.fields.map((f) => f.key))
        .join(','),
    ].join('|'),
  () => {
    void nextTick().then(() => initFormSortable());
  },
);
</script>

<template>
  <div class="detail-designer">
    <aside class="designer-pane designer-palette">
      <div class="pane-title">业务组件</div>
      <p class="pane-hint">表单可增删字段、拖顺序/占宽；表格配列。点放到画布，再在中间点字段/列。</p>
      <button
        v-for="item in palette"
        :key="item.key"
        type="button"
        class="palette-item"
        :class="{ 'is-on': isMounted(item.key) }"
        @click="isMounted(item.key) ? selectBlock(item.key) : addToCanvas(item.key)"
      >
        <div class="flex items-center justify-between gap-1">
          <span class="font-medium">{{ item.label }}</span>
          <ElTag
            size="small"
            :type="item.widgetKind === 'table' ? 'success' : 'primary'"
          >
            {{ item.widgetKind === 'table' ? '表格' : '表单' }}
          </ElTag>
        </div>
        <div class="mt-0.5 text-[11px] text-gray-400">{{ item.desc }}</div>
      </button>
    </aside>

    <div class="designer-pane designer-canvas">
      <div class="pane-title">详情画布</div>
      <p class="pane-hint">拖格子改顺序，拖右边改占宽；可新增/删除字段。Tab 可拖排序。</p>

      <div ref="canvasPageRef" class="canvas-page">
        <div class="canvas-header">
          <span class="text-xs font-semibold">XY-2024-0025</span>
          <ElTag size="small" type="warning">待复核</ElTag>
          <span class="ml-auto text-[11px] text-gray-400">预览</span>
        </div>
        <div class="canvas-summary">
          <div v-for="n in 4" :key="n" class="summary-mini">指标 {{ n }}</div>
        </div>

        <div
          v-if="basicOnCanvas"
          class="canvas-block"
          :class="{ 'is-selected': selectedKey === 'basic' && !selectedFieldKey }"
          @click.stop="selectBlock('basic')"
        >
          <div class="canvas-block__head">基础信息</div>
          <template v-for="sec in formSectionsOf('basic')" :key="sec.key">
            <div class="mb-1 text-[11px] text-gray-500">{{ sec.label }}</div>
            <div
              class="form-grid mb-2"
              data-module-key="basic"
              :data-section-key="sec.key"
            >
              <button
                v-for="f in previewFields(sec)"
                :key="f.key"
                type="button"
                class="form-cell"
                :class="{
                  'is-hit':
                    selectedKey === 'basic' &&
                    selectedSectionKey === sec.key &&
                    selectedFieldKey === f.key,
                }"
                :data-field-key="f.key"
                :style="{ gridColumn: `span ${colSpan(f)}` }"
                @click.stop="selectField('basic', sec.key, f.key)"
              >
                <GripVertical class="cell-drag size-3.5 text-gray-400" />
                <div class="min-w-0 flex-1">
                  <div class="text-[11px] text-gray-500">
                    {{ f.label }}
                    <span v-if="f.required" class="text-red-500">*</span>
                    <span class="ml-1 text-gray-300">{{ colSpan(f) }}</span>
                  </div>
                  <div class="form-ctrl">{{ controlPreview(f) }}</div>
                </div>
                <i
                  class="span-handle"
                  title="拖动改占宽"
                  @mousedown.stop="
                    onSpanResizeStart($event, 'basic', sec.key, f.key)
                  "
                />
              </button>
            </div>
          </template>
          <div
            v-for="sec in customSectionsOf('basic')"
            :key="sec.key"
            class="mb-2"
          >
            <div class="mb-1 text-[11px] text-gray-500">{{ sec.label }}</div>
            <div class="canvas-table-preview">
              <button
                v-for="f in previewFields(sec)"
                :key="f.key"
                type="button"
                class="table-col"
                :class="{
                  'is-hit':
                    selectedKey === 'basic' &&
                    selectedSectionKey === sec.key &&
                    selectedFieldKey === f.key,
                }"
                @click.stop="selectField('basic', sec.key, f.key)"
              >
                {{ f.label }}
              </button>
              <div class="table-row-ghost">自定义表格</div>
            </div>
          </div>
        </div>

        <div v-if="tabMounted.length" class="canvas-tabs-wrap">
          <div ref="tabListRef" class="canvas-tabs">
            <button
              v-for="row in tabMounted"
              :key="row.key"
              type="button"
              class="canvas-tab"
              :class="{ 'is-selected': selectedKey === row.key }"
              :data-key="row.key"
              @click="selectBlock(row.key)"
            >
              <GripVertical class="tab-drag size-3.5 text-gray-400" />
              {{ metaOf(row.key)?.label }}
            </button>
          </div>

          <template v-if="selectedKey !== 'basic' && isMounted(selectedKey)">
            <!-- 表单栅格：每子块一格，可拖顺序/占宽 -->
            <div v-if="!isTableWidget(selectedKey)">
              <template
                v-for="sec in formSectionsOf(selectedKey)"
                :key="sec.key"
              >
                <div class="mb-1 text-[11px] text-gray-500">{{ sec.label }}</div>
                <div
                  class="form-grid mb-2"
                  :data-module-key="selectedKey"
                  :data-section-key="sec.key"
                >
                  <button
                    v-for="f in previewFields(sec)"
                    :key="f.key"
                    type="button"
                    class="form-cell"
                    :class="{
                      'is-hit':
                        selectedSectionKey === sec.key &&
                        selectedFieldKey === f.key,
                    }"
                    :data-field-key="f.key"
                    :style="{ gridColumn: `span ${colSpan(f)}` }"
                    @click.stop="selectField(selectedKey, sec.key, f.key)"
                  >
                    <GripVertical class="cell-drag size-3.5 text-gray-400" />
                    <div class="min-w-0 flex-1">
                      <div class="text-[11px] text-gray-500">
                        {{ f.label }}
                        <span v-if="f.required" class="text-red-500">*</span>
                        <span class="ml-1 text-gray-300">{{ colSpan(f) }}</span>
                      </div>
                      <div class="form-ctrl">{{ controlPreview(f) }}</div>
                    </div>
                    <i
                      class="span-handle"
                      title="拖动改占宽"
                      @mousedown.stop="
                        onSpanResizeStart(
                          $event,
                          selectedKey,
                          sec.key,
                          f.key,
                        )
                      "
                    />
                  </button>
                </div>
              </template>
            </div>
            <!-- 表格表头 -->
            <div v-else>
              <div
                v-for="sec in previewSections(selectedKey)"
                :key="sec.key"
                class="canvas-table-preview"
              >
                <button
                  v-for="f in previewFields(sec)"
                  :key="f.key"
                  type="button"
                  class="table-col"
                  :class="{
                    'is-hit':
                      selectedSectionKey === sec.key &&
                      selectedFieldKey === f.key,
                  }"
                  :style="{ minWidth: `${f.minWidth || 80}px` }"
                  @click.stop="selectField(selectedKey, sec.key, f.key)"
                >
                  {{ f.label }}
                </button>
                <div class="table-row-ghost">示例行 · 点「新增列」可插列</div>
              </div>
            </div>
          </template>
        </div>

        <div
          v-if="!mounted.length"
          class="py-10 text-center text-xs text-gray-400"
        >
          从左侧把组件放到画布
        </div>
      </div>
    </div>

    <aside class="designer-pane designer-props">
      <div class="flex items-center justify-between gap-2">
        <div class="pane-title mb-0">
          {{ isTableContext() ? '表格属性' : '表单属性' }}
        </div>
        <ElButton
          v-if="isMounted(selectedKey)"
          link
          type="danger"
          size="small"
          @click="removeFromCanvas(selectedKey)"
        >
          卸下画布
        </ElButton>
      </div>
      <p class="pane-hint">
        {{ metaOf(selectedKey)?.label }} ·
        {{
          isTableContext()
            ? '点表头配列，可插列/删列'
            : '可新增或删除字段（如删签约日期、加用户名）'
        }}
      </p>

      <template v-if="isMounted(selectedKey)">
        <!-- 表格：整表行操作 -->
        <div v-if="isTableContext()" class="prop-card">
          <div class="prop-label">行操作</div>
          <div class="mb-2 flex items-center justify-between text-xs">
            <span>允许新增行</span>
            <ElSwitch
              size="small"
              :model-value="currentSection?.tableOptions?.allowAdd !== false"
              @change="(v: boolean) => patchTableOptions({ allowAdd: v })"
            />
          </div>
          <div class="mb-2 flex items-center justify-between text-xs">
            <span>允许删除行</span>
            <ElSwitch
              size="small"
              :model-value="currentSection?.tableOptions?.allowRemove !== false"
              @change="(v: boolean) => patchTableOptions({ allowRemove: v })"
            />
          </div>
          <div class="flex items-center justify-between gap-2 text-xs">
            <span>至少保留</span>
            <ElInputNumber
              size="small"
              :min="0"
              :max="9"
              :model-value="currentSection?.tableOptions?.minRows ?? 1"
              @change="(v: number | undefined) => patchTableOptions({ minRows: v ?? 1 })"
            />
          </div>
          <ElButton
            class="mt-2"
            size="small"
            type="primary"
            plain
            @click="addTableColumn"
          >
            插入列
          </ElButton>
        </div>

        <div v-else class="prop-card">
          <div class="prop-label">字段操作</div>
          <ElButton size="small" type="primary" plain @click="addFormField">
            新增字段
          </ElButton>
          <p class="mt-1 text-[11px] text-gray-400">
            新增后改显示名/控件；删除内置字段（如签约日期）保存后不会再补回来。
          </p>
        </div>

        <!-- 未点字段：列出可点项 -->
        <div v-if="!currentField" class="prop-card">
          <div class="prop-label">
            {{ isTableContext() ? '列（点击画布表头）' : '字段（拖格子 / 点选）' }}
          </div>
          <button
            v-for="sec in selectedSections"
            :key="sec.key"
            class="hidden"
            type="button"
          />
          <div
            v-for="sec in selectedSections"
            :key="sec.key"
            class="mb-2"
          >
            <div class="mb-1 text-[11px] text-gray-400">{{ sec.label }}</div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="f in sec.fields"
                :key="f.key"
                type="button"
                class="mini-chip"
                :class="{ 'is-off': !f.enabled }"
                @click="selectField(selectedKey, sec.key, f.key)"
              >
                {{ f.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 点中某一项 -->
        <div v-else class="prop-card">
          <div class="mb-2 flex items-center justify-between">
            <div class="prop-label mb-0">{{ currentField.label }}</div>
            <ElSwitch
              size="small"
              :model-value="currentField.enabled"
              @change="
                (v: boolean) =>
                  setFieldEnabled(
                    currentSection!.key,
                    currentField!.key,
                    v,
                  )
              "
            />
          </div>
          <div class="prop-label">显示名</div>
          <ElInput
            size="small"
            class="mb-2"
            :model-value="currentField.label"
            @update:model-value="(v: string) => patchField({ label: v })"
          />
          <div class="text-[11px] text-gray-400 mb-2">编码 {{ currentField.key }}</div>
          <template v-if="currentField.custom">
            <div class="prop-label">数据字段名</div>
            <ElInput
              size="small"
              class="mb-2"
              :model-value="currentField.key"
              placeholder="如 username"
              @change="(v: string) => renameCustomFieldKey(v)"
            />
          </template>
          <ElButton
            v-if="currentField.key !== '_selection'"
            class="mb-2"
            size="small"
            type="danger"
            plain
            @click="removeCurrentField"
          >
            删除{{ isTableContext() ? '本列' : '本字段' }}
          </ElButton>

          <template v-if="!isTableContext()">
            <div class="prop-label">控件</div>
            <ElSelect
              size="small"
              class="mb-2 w-full"
              :model-value="currentField.controlType || 'input'"
              @change="(v: ModuleInnerControlType) => patchField({ controlType: v })"
            >
              <ElOption
                v-for="opt in FORM_CONTROL_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
            <div class="prop-label">占宽</div>
            <ElSelect
              size="small"
              class="mb-2 w-full"
              :model-value="colSpan(currentField)"
              @change="(v: number) => patchField({ span: v })"
            >
              <ElOption
                v-for="opt in FORM_SPAN_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
            <div class="mb-2 flex items-center justify-between text-xs">
              <span>必填</span>
              <ElSwitch
                size="small"
                :model-value="!!currentField.required"
                @change="(v: boolean) => patchField({ required: v })"
              />
            </div>
            <div class="prop-label">占位提示</div>
            <ElInput
              size="small"
              :model-value="currentField.placeholder || ''"
              @update:model-value="(v: string) => patchField({ placeholder: v })"
            />
          </template>

          <template v-else>
            <div class="prop-label">列宽</div>
            <ElInputNumber
              size="small"
              class="mb-2"
              :min="60"
              :max="400"
              :step="20"
              :model-value="currentField.minWidth || 120"
              @change="(v: number | undefined) => patchField({ minWidth: v || 120 })"
            />
            <div class="prop-label">单元格</div>
            <ElSelect
              size="small"
              class="mb-2 w-full"
              :model-value="
                currentField.cellType ||
                (currentField.controlType === 'yesno' ||
                currentField.controlType === 'select'
                  ? currentField.controlType
                  : 'text')
              "
              @change="
                (v: ModuleInnerCellType) =>
                  patchField({
                    cellType: v,
                    controlType: v === 'text' ? 'input' : v,
                  })
              "
            >
              <ElOption
                v-for="opt in TABLE_CELL_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </ElSelect>
            <div class="flex items-center justify-between text-xs">
              <span>必填</span>
              <ElSwitch
                size="small"
                :model-value="!!currentField.required"
                @change="(v: boolean) => patchField({ required: v })"
              />
            </div>
          </template>
        </div>
      </template>
      <div v-else class="text-xs text-gray-400">请先放到画布</div>
    </aside>
  </div>
</template>

<style scoped>
.detail-designer {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr) 280px;
  gap: 10px;
  min-height: 580px;
}

.designer-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 10px;
  overflow: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.pane-title {
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 600;
}

.pane-hint {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.4;
  color: #6b7280;
}

.palette-item {
  width: 100%;
  padding: 8px;
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
  background: #f9fafb;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
}

.palette-item.is-on {
  background: #eff6ff;
  border-color: #93c5fd;
  border-style: solid;
}

.canvas-page {
  padding: 10px;
  background: #f3f4f6;
  border-radius: 8px;
}

.canvas-header {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: #fff;
  border-radius: 8px;
}

.canvas-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}

.summary-mini {
  padding: 8px;
  font-size: 11px;
  color: #6b7280;
  background: #fff;
  border-left: 3px solid #93c5fd;
  border-radius: 6px;
}

.canvas-block {
  padding: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.canvas-block.is-selected,
.canvas-tab.is-selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}

.canvas-block__head {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 8px;
}

.form-cell {
  position: relative;
  display: flex;
  gap: 4px;
  align-items: flex-start;
  padding: 6px 8px 6px 4px;
  text-align: left;
  cursor: pointer;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.cell-drag {
  flex-shrink: 0;
  margin-top: 2px;
  cursor: grab;
}

.span-handle {
  position: absolute;
  top: 4px;
  right: 0;
  width: 8px;
  height: calc(100% - 8px);
  cursor: ew-resize;
  background: transparent;
  border-right: 2px solid #cbd5e1;
  border-radius: 0 4px 4px 0;
}

.span-handle:hover {
  border-right-color: #2563eb;
}

.form-cell.is-hit,
.table-col.is-hit {
  background: #eff6ff;
  border-color: #2563eb;
}

.form-ctrl {
  margin-top: 4px;
  padding: 4px 6px;
  font-size: 11px;
  color: #9ca3af;
  background: #fff;
  border: 1px dashed #d1d5db;
  border-radius: 4px;
}

.canvas-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.canvas-tab {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.canvas-tabs-wrap {
  padding: 8px;
  background: #fff;
  border-radius: 8px;
}

.canvas-table-preview {
  display: flex;
  flex-wrap: wrap;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.table-col {
  flex: 1;
  min-width: 72px;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  background: #f9fafb;
  border-right: 1px solid #e5e7eb;
}

.table-row-ghost {
  width: 100%;
  padding: 10px;
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
  border-top: 1px solid #e5e7eb;
}

.tab-drag {
  cursor: grab;
}

.prop-card {
  padding: 8px;
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 8px;
}

.prop-label {
  margin-bottom: 4px;
  font-size: 11px;
  color: #6b7280;
}

.mini-chip {
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
}

.mini-chip.is-off {
  color: #9ca3af;
  text-decoration: line-through;
}

.col-span-24 {
  grid-column: span 24;
}

@media (max-width: 1100px) {
  .detail-designer {
    grid-template-columns: 1fr;
  }
}
</style>
