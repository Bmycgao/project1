<script lang="ts" setup>
/**
 * 详情模块可视化布局编辑器（文档 2.2③）
 * - 画布内拖拽排序
 * - 卡片宽度 = 占比 span（24 栅格预览）
 * - 未挂载模块放在下方池，点击挂上（全量可多于本页：只配需要的）
 */
import type { AgreeModuleMount } from '../../../biz/agreement/module-access';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { GripVertical } from '@vben/icons';

import { ElButton, ElOption, ElSelect, ElTag } from 'element-plus';

import {
  MODULE_SPAN_OPTIONS,
  normalizeModuleSpan,
} from '../../../biz/agreement/module-access';

/** 编辑行（与页面配置表单一致） */
export interface ModuleLayoutEditRow {
  key: AgreeModuleMount['key'];
  label: string;
  authCode: string;
  enabled: boolean;
  order: number;
  span: number;
}

const model = defineModel<ModuleLayoutEditRow[]>({ required: true });

const canvasRef = ref<HTMLElement | null>(null);
/** Sortable 实例 */
let sortableInst: { destroy: () => void } | null = null;

/** 已挂载，按 order 排序（画布展示） */
const mountedRows = computed(() =>
  [...model.value]
    .filter((r) => r.enabled)
    .sort((a, b) => a.order - b.order),
);

/** 未挂载池 */
const poolRows = computed(() => model.value.filter((r) => !r.enabled));

/**
 * 按画布 DOM 顺序写回 order
 */
function syncOrderFromCanvas() {
  const el = canvasRef.value;
  if (!el) return;
  const keys = [...el.children]
    .map((node) => (node as HTMLElement).dataset.key)
    .filter(Boolean) as string[];
  const orderByKey = new Map(keys.map((k, i) => [k, (i + 1) * 10]));
  model.value = model.value.map((row) => {
    const nextOrder = orderByKey.get(row.key);
    return nextOrder === undefined ? row : { ...row, order: nextOrder };
  });
}

/**
 * 修改占比
 * @param key 模块
 * @param span 栅格
 */
function setSpan(key: string, span: number) {
  const n = normalizeModuleSpan(span);
  model.value = model.value.map((row) =>
    row.key === key ? { ...row, span: n } : row,
  );
}

/**
 * 挂载模块到画布末尾
 * @param key 模块
 */
async function mountModule(key: string) {
  const maxOrder = Math.max(0, ...model.value.map((r) => r.order || 0));
  model.value = model.value.map((row) =>
    row.key === key
      ? { ...row, enabled: true, order: maxOrder + 10 }
      : row,
  );
  await nextTick();
  await initSortable();
}

/**
 * 从画布卸下（不删资源，仅本场景不挂）
 * @param key 模块
 */
async function unmountModule(key: string) {
  model.value = model.value.map((row) =>
    row.key === key ? { ...row, enabled: false } : row,
  );
  await nextTick();
  await initSortable();
}

/**
 * 初始化 / 重建拖拽
 */
async function initSortable() {
  sortableInst?.destroy();
  sortableInst = null;
  const container = canvasRef.value;
  if (!container) return;

  const SortableMod = await import(
    // @ts-expect-error sortable 完整包动态导入
    'sortablejs/modular/sortable.complete.esm.js'
  );
  const Sortable = SortableMod?.default;
  if (!Sortable?.create) return;

  sortableInst = Sortable.create(container, {
    animation: 200,
    handle: '.module-drag-handle',
    draggable: '.module-canvas__card',
    ghostClass: 'module-canvas__ghost',
    onEnd() {
      syncOrderFromCanvas();
    },
  });
}

onMounted(() => {
  void initSortable();
});

onBeforeUnmount(() => {
  sortableInst?.destroy();
  sortableInst = null;
});

// 挂载数量变化后重建（避免 DOM 与实例脱节）
watch(
  () => mountedRows.value.map((r) => r.key).join(','),
  async () => {
    await nextTick();
    await initSortable();
  },
);
</script>

<template>
  <div class="module-layout-editor mb-4">
    <p class="mb-2 text-xs text-gray-500">
      <strong>可视化布局（可拖拽）：</strong>拖动手柄调整详情模块顺序；下拉改占比（24
      栅格预览）。点「挂上 / 卸下」控制本场景是否展示。
      详情页：基础信息固定在上方，其余模块按此处顺序显示在 Tab 中。
    </p>

    <div class="mb-2 flex items-center justify-between text-xs text-gray-500">
      <span>已挂载预览（拖拽排序）</span>
      <ElTag size="small" type="info">
        {{ mountedRows.length }} / {{ model.length }}
      </ElTag>
    </div>

    <div
      v-if="mountedRows.length"
      ref="canvasRef"
      class="module-canvas mb-3"
    >
      <div
        v-for="row in mountedRows"
        :key="row.key"
        class="module-canvas__card"
        :data-key="row.key"
        :style="{ gridColumn: `span ${normalizeModuleSpan(row.span)}` }"
      >
        <div class="module-canvas__head">
          <GripVertical
            class="module-drag-handle size-4 shrink-0 cursor-grab text-gray-400 active:cursor-grabbing"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-gray-800">
              {{ row.label }}
            </div>
            <div class="truncate text-xs text-gray-400">{{ row.authCode }}</div>
          </div>
          <ElButton
            link
            type="danger"
            size="small"
            @click="unmountModule(row.key)"
          >
            卸下
          </ElButton>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <span class="shrink-0 text-xs text-gray-400">占比</span>
          <ElSelect
            size="small"
            class="min-w-0 flex-1"
            :model-value="normalizeModuleSpan(row.span)"
            @update:model-value="(v: number) => setSpan(row.key, v)"
          >
            <ElOption
              v-for="opt in MODULE_SPAN_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
        </div>
      </div>
    </div>
    <div
      v-else
      class="mb-3 rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400"
    >
      暂无挂载模块，请从下方池中挂上（至少保留一个）
    </div>

    <div class="mb-1 text-xs text-gray-500">未挂载（可选用子集）</div>
    <div
      v-if="poolRows.length"
      class="flex flex-wrap gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2"
    >
      <button
        v-for="row in poolRows"
        :key="row.key"
        type="button"
        class="module-pool__chip"
        @click="mountModule(row.key)"
      >
        <span>{{ row.label }}</span>
        <span class="text-primary">挂上</span>
      </button>
    </div>
    <div v-else class="text-xs text-gray-400">全部模块已挂载</div>
  </div>
</template>

<style scoped>
.module-canvas {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 10px;
  min-height: 72px;
  padding: 12px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.module-canvas__card {
  min-width: 0;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.module-canvas__ghost {
  opacity: 0.55;
  background: #eff6ff;
  border-style: dashed;
  border-color: #93c5fd;
}

.module-canvas__head {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.module-pool__chip {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  background: #fff;
  border: 1px dashed #d1d5db;
  border-radius: 999px;
}

.module-pool__chip:hover {
  color: #1d4ed8;
  border-color: #93c5fd;
  background: #eff6ff;
}

.module-pool__chip .text-primary {
  color: #2563eb;
}
</style>
