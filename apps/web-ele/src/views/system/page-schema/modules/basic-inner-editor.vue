<script lang="ts" setup>
/**
 * 基础信息「模块内部」可视化编辑：子块 + 字段拖拽排序 / 挂卸
 * 演示：全量目录可多于本页，只启用需要的字段（100 也可只配 80）
 */
import type {
  BasicModuleInnerConfig,
  ModuleInnerFieldItem,
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

import { ElButton, ElSwitch, ElTag } from 'element-plus';

import {
  buildDefaultBasicModuleInner,
  normalizeBasicModuleInner,
} from '../../../biz/agreement/module-inner-config';

const model = defineModel<BasicModuleInnerConfig>({ required: true });

const sectionListRef = ref<HTMLElement | null>(null);
const fieldListRefs = ref<Record<string, HTMLElement | null>>({});

let sectionSortable: { destroy: () => void } | null = null;
const fieldSortables: Record<string, { destroy: () => void }> = {};

/** 规范化后的编辑数据 */
const normalized = computed(() => normalizeBasicModuleInner(model.value));

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
function commit(next: BasicModuleInnerConfig) {
  model.value = normalizeBasicModuleInner(next);
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

/** 重置为默认全量 */
function resetDefaults() {
  commit(buildDefaultBasicModuleInner());
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
        <div class="text-sm font-medium">基础信息 · 内部字段配置</div>
        <p class="m-0 mt-0.5 text-xs text-gray-500">
          拖拽调整子块/字段顺序；卸下不需要的项。全量目录可很多，本场景只启用需要的（例如
          100 项只开 80）。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <ElTag size="small" type="info">
          子块 {{ enabledSections.length }} /
          {{ normalized.sections.length }}
        </ElTag>
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
            <div class="text-sm font-medium">{{ sec.label }}</div>
            <div v-if="sec.subtitle" class="text-xs text-gray-400">
              {{ sec.subtitle }}
            </div>
          </div>
          <ElButton
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
            <span class="min-w-0 flex-1 truncate text-xs">
              {{ field.label }}
              <span class="text-gray-400">({{ field.key }})</span>
            </span>
            <ElSwitch
              size="small"
              :model-value="true"
              @change="setFieldEnabled(sec.key, field.key, false)"
            />
          </div>
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
