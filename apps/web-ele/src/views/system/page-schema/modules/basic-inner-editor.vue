<script lang="ts" setup>
/**
 * 模块「内部字段」可视化编辑：子块 + 字段拖拽排序 / 挂卸
 * 可用于基础信息 / 签约信息等（传入对应 buildDefault + normalize）
 */
import type {
  ModuleInnerConfig,
  ModuleInnerSection,
} from '../../../biz/agreement/module-inner-config';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { GripVertical } from '@vben/icons';

import { ElButton, ElInput, ElSwitch, ElTag } from 'element-plus';

import {
  buildDefaultBasicModuleInner,
  createCustomBasicSection,
  isCustomBasicSection,
  normalizeBasicModuleInner,
} from '../../../biz/agreement/module-inner-config';

const props = defineProps<{
  /** 标题 */
  title?: string;
  /** 说明文案 */
  description?: string;
  /** 默认全量目录工厂 */
  buildDefault?: () => ModuleInnerConfig;
  /** 合并规范化 */
  normalize?: (raw?: ModuleInnerConfig | null) => ModuleInnerConfig;
  /** 是否允许配置台「新增子块」（仅基础信息表格场景） */
  allowCreateSection?: boolean;
}>();

const model = defineModel<ModuleInnerConfig>({ required: true });

const sectionListRef = ref<HTMLElement | null>(null);
const fieldListRefs = ref<Record<string, HTMLElement | null>>({});

let sectionSortable: { destroy: () => void } | null = null;
const fieldSortables: Record<string, { destroy: () => void }> = {};

/** 子块显示名编辑草稿 sectionKey → text */
const sectionLabelDraft = ref<Record<string, string>>({});
/** 字段显示名编辑草稿 `${sectionKey}::${fieldKey}` → text */
const fieldLabelDraft = ref<Record<string, string>>({});

/**
 * 字段草稿 key
 * @param sectionKey 子块
 * @param fieldKey 字段
 */
function fieldDraftKey(sectionKey: string, fieldKey: string) {
  return `${sectionKey}::${fieldKey}`;
}

/**
 * 子块标题展示（优先草稿，避免受控输入被打回）
 * @param sectionKey 子块
 * @param label 已保存名
 */
function sectionLabelOf(sectionKey: string, label: string) {
  return sectionLabelDraft.value[sectionKey] ?? label;
}

/**
 * 字段显示名展示
 * @param sectionKey 子块
 * @param fieldKey 字段
 * @param label 已保存名
 */
function fieldLabelOf(sectionKey: string, fieldKey: string, label: string) {
  return fieldLabelDraft.value[fieldDraftKey(sectionKey, fieldKey)] ?? label;
}

/** 标题（可覆盖） */
const editorTitle = computed(
  () => props.title || '基础信息 · 内部字段配置',
);
/** 说明（可覆盖） */
const editorDesc = computed(
  () =>
    props.description ||
    '拖拽调整顺序；可改显示名；卸下不需要的项。点「新增子块」可自建类似权利人的表格（详情页再点新增加行）。',
);

/**
 * 规范化（避免 withDefaults 对 Function prop 包一层导致调用结果错乱）
 * @param raw 原始配置
 */
function runNormalize(raw?: ModuleInnerConfig | null) {
  const fn = props.normalize || normalizeBasicModuleInner;
  return fn(raw);
}

/** 取默认全量目录 */
function runBuildDefault() {
  const fn = props.buildDefault || buildDefaultBasicModuleInner;
  return fn();
}

/** 规范化后的编辑数据 */
const normalized = computed(() => runNormalize(model.value));

const enabledSections = computed(() =>
  normalized.value.sections
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order),
);

const poolSections = computed(() =>
  normalized.value.sections.filter((s) => !s.enabled),
);

/**
 * 写回整个配置
 * @param next 下一份
 */
function commit(next: ModuleInnerConfig) {
  model.value = runNormalize(next);
}

/**
 * 挂上 / 卸下子块
 * @param key 子块
 * @param enabled 是否启用
 */
function setSectionEnabled(key: string, enabled: boolean) {
  const sections = normalized.value.sections.map((s) => {
    if (s.key !== key) return s;
    const maxOrder = Math.max(
      0,
      ...normalized.value.sections.map((x) => x.order),
    );
    return {
      ...s,
      enabled,
      order: enabled ? maxOrder + 10 : s.order,
    };
  });
  commit({ sections });
}

/**
 * 挂上 / 卸下字段
 * @param sectionKey 子块
 * @param fieldKey 字段
 * @param enabled 是否启用
 */
function setFieldEnabled(
  sectionKey: string,
  fieldKey: string,
  enabled: boolean,
) {
  const sections = normalized.value.sections.map((s) => {
    if (s.key !== sectionKey) return s;
    const maxOrder = Math.max(0, ...s.fields.map((f) => f.order));
    return {
      ...s,
      fields: s.fields.map((f) =>
        f.key === fieldKey
          ? { ...f, enabled, order: enabled ? maxOrder + 10 : f.order }
          : f,
      ),
    };
  });
  commit({ sections });
}

/**
 * 输入子块显示名（仅写草稿）
 * @param sectionKey 子块
 * @param label 文案
 */
function onSectionLabelInput(sectionKey: string, label: string) {
  sectionLabelDraft.value = {
    ...sectionLabelDraft.value,
    [sectionKey]: label,
  };
}

/**
 * 失焦提交子块显示名
 * @param sectionKey 子块
 * @param fallback 原名
 */
function flushSectionLabel(sectionKey: string, fallback: string) {
  const raw = sectionLabelDraft.value[sectionKey];
  const next = String(raw ?? fallback).trim() || fallback;
  const { [sectionKey]: _, ...rest } = sectionLabelDraft.value;
  sectionLabelDraft.value = rest;
  if (next === fallback) return;
  const sections = normalized.value.sections.map((s) =>
    s.key === sectionKey ? { ...s, label: next } : s,
  );
  commit({ sections });
}

/**
 * 输入字段显示名（仅写草稿）
 * @param sectionKey 子块
 * @param fieldKey 字段
 * @param label 文案
 */
function onFieldLabelInput(
  sectionKey: string,
  fieldKey: string,
  label: string,
) {
  const k = fieldDraftKey(sectionKey, fieldKey);
  fieldLabelDraft.value = { ...fieldLabelDraft.value, [k]: label };
}

/**
 * 失焦/回车提交字段显示名
 * @param sectionKey 子块
 * @param fieldKey 字段
 * @param fallback 原名
 */
function flushFieldLabel(
  sectionKey: string,
  fieldKey: string,
  fallback: string,
) {
  const k = fieldDraftKey(sectionKey, fieldKey);
  const raw = fieldLabelDraft.value[k];
  const next = String(raw ?? fallback).trim() || fallback;
  const { [k]: _, ...rest } = fieldLabelDraft.value;
  fieldLabelDraft.value = rest;
  if (next === fallback) return;
  const sections = normalized.value.sections.map((s) => {
    if (s.key !== sectionKey) return s;
    return {
      ...s,
      fields: s.fields.map((f) =>
        f.key === fieldKey ? { ...f, label: next } : f,
      ),
    };
  });
  commit({ sections });
}

/**
 * 按 DOM 同步子块顺序
 */
function syncSectionOrderFromDom() {
  const el = sectionListRef.value;
  if (!el) return;
  const keys = [...el.children]
    .map((n) => (n as HTMLElement).dataset.key)
    .filter(Boolean) as string[];
  const orderByKey = new Map(keys.map((k, i) => [k, (i + 1) * 10]));
  commit({
    sections: normalized.value.sections.map((s) => ({
      ...s,
      order: orderByKey.get(s.key) ?? s.order,
    })),
  });
}

/**
 * 按 DOM 同步某子块字段顺序
 * @param sectionKey 子块
 */
function syncFieldOrderFromDom(sectionKey: string) {
  const el = fieldListRefs.value[sectionKey];
  if (!el) return;
  const keys = [...el.children]
    .map((n) => (n as HTMLElement).dataset.key)
    .filter(Boolean) as string[];
  const orderByKey = new Map(keys.map((k, i) => [k, (i + 1) * 10]));
  commit({
    sections: normalized.value.sections.map((s) => {
      if (s.key !== sectionKey) return s;
      return {
        ...s,
        fields: s.fields.map((f) => ({
          ...f,
          order: orderByKey.get(f.key) ?? f.order,
        })),
      };
    }),
  });
}

/**
 * 动态导入 Sortable
 */
async function loadSortable() {
  const mod = await import(
    // @ts-expect-error sortable 完整包
    'sortablejs/modular/sortable.complete.esm.js'
  );
  return mod?.default;
}

async function initSectionSortable() {
  sectionSortable?.destroy();
  sectionSortable = null;
  const el = sectionListRef.value;
  if (!el) return;
  const Sortable = await loadSortable();
  if (!Sortable?.create) return;
  sectionSortable = Sortable.create(el, {
    animation: 200,
    handle: '.inner-sec-drag',
    draggable: '.inner-sec-card',
    filter: 'input, textarea, .el-input, .el-switch, .el-button',
    preventOnFilter: false,
    onEnd() {
      syncSectionOrderFromDom();
    },
  });
}

async function initFieldSortable(sectionKey: string) {
  fieldSortables[sectionKey]?.destroy();
  delete fieldSortables[sectionKey];
  const el = fieldListRefs.value[sectionKey];
  if (!el) return;
  const Sortable = await loadSortable();
  if (!Sortable?.create) return;
  fieldSortables[sectionKey] = Sortable.create(el, {
    animation: 180,
    handle: '.inner-field-drag',
    draggable: '.inner-field-row',
    // 避免拖拽逻辑干扰输入框聚焦与选字
    filter: 'input, textarea, .el-input, .el-switch, .el-button',
    preventOnFilter: false,
    onEnd() {
      syncFieldOrderFromDom(sectionKey);
    },
  });
}

async function initAllSortables() {
  await nextTick();
  await initSectionSortable();
  for (const s of enabledSections.value) {
    await initFieldSortable(s.key);
  }
}

/**
 * 绑定字段列表 DOM ref
 * @param key 子块
 * @param el 节点
 */
function setFieldListRef(key: string, el: Element | null) {
  fieldListRefs.value[key] = el as HTMLElement | null;
}

/** 某子块已启用字段 */
function enabledFieldsOf(section: ModuleInnerSection) {
  return section.fields
    .filter((f) => f.enabled)
    .sort((a, b) => a.order - b.order);
}

/** 某子块未启用字段 */
function poolFieldsOf(section: ModuleInnerSection) {
  return section.fields.filter((f) => !f.enabled);
}

/** 重置为默认全量（会清掉自定义子块） */
function resetDefaults() {
  commit(runBuildDefault());
}

/**
 * 配置台新增一块自定义表格子块（不预填业务数据）
 */
function addCustomSection() {
  const maxOrder = Math.max(
    0,
    ...normalized.value.sections.map((s) => s.order),
  );
  const next = createCustomBasicSection(maxOrder + 10);
  commit({
    sections: [...normalized.value.sections, next],
  });
}

/**
 * 自定义子块：新增一列
 * @param sectionKey 子块
 */
function addCustomField(sectionKey: string) {
  const sections = normalized.value.sections.map((s) => {
    if (s.key !== sectionKey) return s;
    const maxOrder = Math.max(0, ...s.fields.map((f) => f.order));
    const idx = s.fields.length + 1;
    return {
      ...s,
      fields: [
        ...s.fields,
        {
          key: `col_${Date.now()}`,
          label: `新列${idx}`,
          enabled: true,
          order: maxOrder + 10,
          minWidth: 120,
        },
      ],
    };
  });
  commit({ sections });
}

/**
 * 彻底删除自定义子块（内置子块只能卸下）
 * @param sectionKey 子块
 */
function removeCustomSection(sectionKey: string) {
  commit({
    sections: normalized.value.sections.filter((s) => s.key !== sectionKey),
  });
}

onMounted(() => {
  void initAllSortables();
});

onBeforeUnmount(() => {
  sectionSortable?.destroy();
  Object.values(fieldSortables).forEach((s) => s.destroy());
});

watch(
  () =>
    enabledSections.value
      .map(
        (s) =>
          `${s.key}:${enabledFieldsOf(s)
            .map((f) => f.key)
            .join(',')}`,
      )
      .join('|'),
  () => {
    void initAllSortables();
  },
);
</script>

<template>
  <div class="basic-inner-editor mb-4 rounded-lg border border-gray-200 p-3">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="text-sm font-medium">{{ editorTitle }}</div>
        <p class="m-0 mt-0.5 text-xs text-gray-500">
          {{ editorDesc }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <ElTag size="small" type="info">
          子块 {{ enabledSections.length }} /
          {{ normalized.sections.length }}
        </ElTag>
        <ElButton
          v-if="allowCreateSection"
          size="small"
          type="primary"
          @click="addCustomSection"
        >
          新增子块
        </ElButton>
        <ElButton size="small" @click="resetDefaults">恢复默认全量</ElButton>
      </div>
    </div>

    <div
      v-if="enabledSections.length"
      ref="sectionListRef"
      class="space-y-3"
    >
      <div
        v-for="sec in enabledSections"
        :key="sec.key"
        class="inner-sec-card rounded-md border border-gray-100 bg-gray-50/80 p-3"
        :data-key="sec.key"
      >
        <div class="mb-2 flex items-start gap-2">
          <GripVertical
            class="inner-sec-drag mt-0.5 size-4 shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
          />
          <div class="min-w-0 flex-1">
            <ElInput
              size="small"
              class="max-w-xs"
              :model-value="sectionLabelOf(sec.key, sec.label)"
              placeholder="子块显示名"
              @update:model-value="
                (v: string) => onSectionLabelInput(sec.key, v)
              "
              @blur="flushSectionLabel(sec.key, sec.label)"
              @keyup.enter="flushSectionLabel(sec.key, sec.label)"
            />
            <div class="mt-0.5 text-[11px] text-gray-400">
              编码 {{ sec.key }}
              <span v-if="sec.subtitle"> · {{ sec.subtitle }}</span>
            </div>
          </div>
          <ElButton
            v-if="isCustomBasicSection(sec)"
            link
            type="danger"
            size="small"
            @click="removeCustomSection(sec.key)"
          >
            删除子块
          </ElButton>
          <ElButton
            v-else
            link
            type="danger"
            size="small"
            @click="setSectionEnabled(sec.key, false)"
          >
            卸下子块
          </ElButton>
        </div>

        <div
          :ref="(el) => setFieldListRef(sec.key, el as Element | null)"
          class="space-y-1"
        >
          <div
            v-for="field in enabledFieldsOf(sec)"
            :key="field.key"
            class="inner-field-row flex items-center gap-2 rounded border border-white bg-white px-2 py-1.5"
            :data-key="field.key"
          >
            <GripVertical
              class="inner-field-drag size-3.5 shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
            />
            <ElInput
              size="small"
              class="min-w-0 flex-1"
              :model-value="fieldLabelOf(sec.key, field.key, field.label)"
              placeholder="显示名"
              @update:model-value="
                (v: string) => onFieldLabelInput(sec.key, field.key, v)
              "
              @blur="flushFieldLabel(sec.key, field.key, field.label)"
              @keyup.enter="flushFieldLabel(sec.key, field.key, field.label)"
            />
            <span
              class="w-28 shrink-0 truncate text-[11px] text-gray-400"
              :title="field.key"
            >
              {{ field.key }}
            </span>
            <ElSwitch
              size="small"
              :model-value="true"
              @change="setFieldEnabled(sec.key, field.key, false)"
            />
          </div>
        </div>

        <div
          v-if="isCustomBasicSection(sec)"
          class="mt-2 flex items-center gap-2"
        >
          <ElButton size="small" link type="primary" @click="addCustomField(sec.key)">
            新增列
          </ElButton>
        </div>

        <div
          v-if="poolFieldsOf(sec).length"
          class="mt-2 flex flex-wrap gap-1.5 border-t border-dashed border-gray-200 pt-2"
        >
          <button
            v-for="field in poolFieldsOf(sec)"
            :key="field.key"
            type="button"
            class="rounded-full border border-dashed border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 hover:border-blue-300 hover:text-blue-600"
            @click="setFieldEnabled(sec.key, field.key, true)"
          >
            {{ field.label }} · 挂上
          </button>
        </div>
      </div>
    </div>
    <div
      v-else
      class="rounded border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400"
    >
      暂无启用子块，请从下方挂上
    </div>

    <div v-if="poolSections.length" class="mt-3">
      <div class="mb-1 text-xs text-gray-500">未挂载子块</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="sec in poolSections"
          :key="sec.key"
          type="button"
          class="rounded-full border border-dashed border-gray-300 bg-white px-3 py-1 text-xs hover:border-blue-300 hover:bg-blue-50"
          @click="setSectionEnabled(sec.key, true)"
        >
          {{ sec.label }} · 挂上
        </button>
      </div>
    </div>
  </div>
</template>
