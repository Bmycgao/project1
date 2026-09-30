<script setup lang="ts">
import type { AgreeModuleWidgetKind } from '../../../biz/agreement/access/module-access';
import type { ModuleInnerConfig } from '../../../biz/agreement/config/module-inner-config';
import type { FcRuleMap } from '../../../biz/agreement/fc/types';
import type { ModuleLayoutEditRow } from './module-layout-editor.vue';

import type { FcBindingsMap, FcSchemaApi } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { GripVertical } from '@vben/icons';

import {
  ElAlert,
  ElButton,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTag,
} from 'element-plus';

import { getFcSchemaList } from '#/api';

import {
  createCustomAgreeModule,
  normalizeModuleRegion,
  normalizeModuleSpan,
} from '../../../biz/agreement/access/module-access';
import {
  buildDefaultCustomFormInner,
  buildDefaultCustomTableInner,
} from '../../../biz/agreement/config/module-inner-config';
import { cloneFcRule, isFcRule } from '../../../biz/agreement/fc/types';
import DetailPreview from './detail-preview.vue';

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
const customInners = defineModel<Record<string, ModuleInnerConfig>>(
  'customInners',
  { default: () => ({}) },
);
const fcBindings = defineModel<FcBindingsMap>('fcBindings', {
  default: () => ({}),
});
const selectedKey = ref('basic');
const selected = computed(() =>
  layouts.value.find((m) => m.key === selectedKey.value),
);
const search = ref('');
const newName = ref('');
const newKind = ref<AgreeModuleWidgetKind>('form');
const templates = ref<FcSchemaApi.FcSchema[]>([]);
const templatesLoading = ref(false);
const templatesError = ref(false);
const preview = ref(false);
const previewLoading = ref(false);
const previewRules = ref<FcRuleMap>({});
const dragKey = ref('');
const regions = [
  { key: 'content', label: '内容区', hint: '直接展开 · 支持整行、半行布局' },
  { key: 'tabs', label: '标签页区', hint: '按顺序切换查看 · 每个标签独占整行' },
] as const;
const palette = computed(() =>
  layouts.value.filter((m) => m.label.includes(search.value.trim())),
);
const mounted = computed(() =>
  layouts.value.filter((m) => m.enabled).toSorted((a, b) => a.order - b.order),
);
const inners = computed(() => ({
  ...customInners.value,
  basic: basicInner.value,
  houses: housesInner.value,
  compensation: compensationInner.value,
  rewards: rewardsInner.value,
  population: populationInner.value,
}));
const selectedTemplates = computed(() =>
  templates.value.filter(
    (t) =>
      t.kind === (selected.value?.widgetKind || 'form') &&
      t.status === 1 &&
      t.usage !== 'workflowSupplement',
  ),
);
function regionOf(row: ModuleLayoutEditRow) {
  return normalizeModuleRegion(row.key, row.region);
}
function rowsIn(region: string) {
  return mounted.value.filter((m) => regionOf(m) === region);
}
function patch(key: string, value: Partial<ModuleLayoutEditRow>) {
  layouts.value = layouts.value.map((m) =>
    m.key === key ? { ...m, ...value } : m,
  );
}
function templateName(key: string) {
  const id = fcBindings.value[key];
  return (
    templates.value.find((t) => t.id === id)?.name ||
    (id ? '模板不可用，请重新选择' : '请选择模板')
  );
}
function setBinding(id: unknown) {
  fcBindings.value = {
    ...fcBindings.value,
    [selectedKey.value]: String(id || '') || undefined,
  };
}
function move(key: string, direction: number) {
  const row = layouts.value.find((m) => m.key === key);
  if (!row) return;
  const list = rowsIn(regionOf(row));
  const index = list.findIndex((m) => m.key === key);
  const target = index + direction;
  if (target < 0 || target >= list.length) return;
  const keys = list.map((m) => m.key);
  keys.splice(target, 0, keys.splice(index, 1)[0]!);
  const order = new Map(keys.map((id, i) => [id, (i + 1) * 10]));
  layouts.value = layouts.value.map((m) =>
    order.has(m.key) ? { ...m, order: order.get(m.key)! } : m,
  );
}
function drop(region: 'content' | 'tabs', before?: string) {
  const key = dragKey.value;
  dragKey.value = '';
  if (!key || before === key) return;
  const ids = rowsIn(region)
    .filter((m) => m.key !== key)
    .map((m) => m.key);
  const index = before ? ids.indexOf(before) : ids.length;
  ids.splice(index < 0 ? ids.length : index, 0, key);
  const order = new Map(ids.map((id, i) => [id, (i + 1) * 10]));
  layouts.value = layouts.value.map((m) =>
    order.has(m.key) ? { ...m, region, order: order.get(m.key)! } : m,
  );
}
function changeRegion(region: unknown) {
  if (!selected.value || (region !== 'content' && region !== 'tabs')) return;
  patch(selectedKey.value, {
    region,
    order: Math.max(0, ...rowsIn(region).map((m) => m.order)) + 10,
  });
}
function createModule() {
  if (!newName.value.trim()) {
    ElMessage.warning('请填写模块名称');
    return;
  }
  const mount = createCustomAgreeModule({
    label: newName.value,
    widgetKind: newKind.value,
    order: Math.max(0, ...layouts.value.map((m) => m.order)) + 10,
  });
  layouts.value = [
    ...layouts.value,
    {
      ...mount,
      label: mount.label!,
      authCode: mount.authCode!,
      order: mount.order!,
      span: 24,
      region: 'tabs',
    },
  ];
  customInners.value = {
    ...customInners.value,
    [mount.key]:
      newKind.value === 'table'
        ? buildDefaultCustomTableInner(mount.label!)
        : buildDefaultCustomFormInner(mount.label!),
  };
  selectedKey.value = mount.key;
  newName.value = '';
  ElMessage.success('模块已添加，请选择对应模板');
}
async function loadTemplates() {
  templatesLoading.value = true;
  templatesError.value = false;
  try {
    templates.value = await getFcSchemaList({ status: 1 });
  } catch {
    templatesError.value = true;
  } finally {
    templatesLoading.value = false;
  }
}
async function openPreview() {
  if (
    mounted.value.some(
      (m) =>
        !fcBindings.value[m.key] ||
        !templates.value.some(
          (t) =>
            t.id === fcBindings.value[m.key] &&
            t.status === 1 &&
            t.usage !== 'workflowSupplement' &&
            t.kind === (m.widgetKind || 'form'),
        ),
    )
  ) {
    ElMessage.warning('请先为所有显示的模块选择可用且类型匹配的模板');
    return;
  }
  previewLoading.value = true;
  try {
    const rules: FcRuleMap = {};
    for (const module of mounted.value) {
      const rule = templates.value.find(
        (t) => t.id === fcBindings.value[module.key],
      )?.rule;
      if (!isFcRule(rule)) throw new Error('模板规则不可用');
      rules[module.key] = cloneFcRule(rule);
    }
    previewRules.value = rules;
    preview.value = true;
  } catch {
    ElMessage.error('预览加载失败，请稍后重试');
  } finally {
    previewLoading.value = false;
  }
}
onMounted(loadTemplates);
</script>

<template>
  <div class="view-designer">
    <header class="designer-toolbar">
      <div>
        <strong>详情视图</strong><span class="toolbar-note">{{ mounted.length }} 个显示 ·
          {{ layouts.length - mounted.length }} 个隐藏</span>
      </div>
      <ElButton v-if="preview" @click="preview = false">返回配置</ElButton>
      <ElButton
        v-else
        type="primary"
        plain
        :loading="previewLoading"
        @click="openPreview"
        >
预览详情
</ElButton>
    </header>
    <div v-if="preview" class="preview-surface">
      <DetailPreview
        :modules="layouts"
        :rules="previewRules"
        :inners="inners"
      />
    </div>
    <div v-else class="designer-columns">
      <aside class="module-library">
        <h3>业务模块</h3>
        <p class="hint">选择模块设置属性；隐藏后可随时恢复。</p>
        <ElInput
          v-model="search"
          clearable
          placeholder="搜索模块"
          aria-label="搜索模块"
        />
        <div class="library-list">
          <button
            v-for="item in palette"
            :key="item.key"
            class="library-item"
            :class="{ selected: selectedKey === item.key }"
            @click="selectedKey = item.key"
          >
            <span>{{ item.label }}</span><ElTag size="small" :type="item.enabled ? 'success' : 'info'">
{{
              item.enabled ? '显示' : '隐藏'
            }}
</ElTag>
          </button>
        </div>
        <div class="create-module">
          <h3>添加自定义模块</h3>
          <ElInput
            v-model="newName"
            placeholder="例如：评估信息"
            aria-label="新模块名称"
            @keyup.enter="createModule"
          />
          <ElSelect v-model="newKind" aria-label="新模块类型">
<ElOption value="form" label="表单模块" /><ElOption
              value="table"
              label="表格模块"
          />
</ElSelect>
          <ElButton class="w-full" @click="createModule">添加模块</ElButton>
        </div>
      </aside>
      <main class="layout-canvas">
        <div class="canvas-page-head">
          <strong>协议详情</strong><span>页头与操作按钮由业务页面提供</span>
        </div>
        <section
          v-for="region in regions"
          :key="region.key"
          class="region"
          @dragover.prevent
          @drop.prevent="drop(region.key)"
        >
          <div class="region-heading">
            <h3>{{ region.label }}</h3>
            <span>{{ region.hint }}</span>
          </div>
          <div class="region-grid">
            <article
              v-for="(item, index) in rowsIn(region.key)"
              :key="item.key"
              class="module-tile"
              :class="{ selected: selectedKey === item.key }"
              :style="{
                gridColumn: `span ${region.key === 'tabs' ? 24 : normalizeModuleSpan(item.span)}`,
              }"
              @click="selectedKey = item.key"
              @dragover.prevent.stop
              @drop.prevent.stop="drop(region.key, item.key)"
            >
              <div class="tile-heading">
                <span
                  draggable="true"
                  class="drag-handle"
                  title="拖动调整顺序或移动到另一区域"
                  @dragstart="
                    dragKey = item.key;
                    $event.dataTransfer?.setData('text/plain', item.key);
                  "
                  @dragend="dragKey = ''"
                  ><GripVertical class="size-4" /></span>
                <strong>{{ item.label }}</strong><ElTag size="small" type="info">
{{
                  item.widgetKind === 'table' ? '表格' : '表单'
                }}
</ElTag>
              </div>
              <p class="template-caption">{{ templateName(item.key) }}</p>
              <div class="tile-actions">
                <ElButton
                  link
                  size="small"
                  :disabled="index === 0"
                  @click.stop="move(item.key, -1)"
                  >
上移
</ElButton>
                <ElButton
                  link
                  size="small"
                  :disabled="index === rowsIn(region.key).length - 1"
                  @click.stop="move(item.key, 1)"
                  >
下移
</ElButton>
                <ElButton
                  link
                  size="small"
                  @click.stop="
                    selectedKey = item.key;
                    patch(item.key, { enabled: false });
                  "
                  >
隐藏
</ElButton>
              </div>
            </article>
          </div>
          <p v-if="!rowsIn(region.key).length" class="drop-hint">
            拖动模块到这里，或在右侧设置显示区域
          </p>
        </section>
      </main>
      <aside class="module-properties">
        <template v-if="selected">
          <h3>模块属性</h3>
          <p class="hint">仅影响当前页面视图；隐藏不删除资料。</p>
          <label class="property"><span>显示此模块</span><ElSwitch
              :model-value="selected.enabled"
              @change="patch(selectedKey, { enabled: !!$event })"
          /></label>
          <label class="property"><span>显示名称</span><ElInput
              :model-value="selected.label"
              @change="
                patch(selectedKey, {
                  label: String($event).trim() || selected.label,
                })
              "
          /></label>
          <label class="property"><span>显示区域</span><ElSelect :model-value="regionOf(selected)" @change="changeRegion"><ElOption value="content" label="内容区 · 直接展开" /><ElOption
                value="tabs"
                label="标签页区 · 切换查看"
/></ElSelect></label>
          <label v-if="regionOf(selected) === 'content'" class="property"><span>模块宽度</span><ElSelect
              :model-value="selected.span"
              @change="patch(selectedKey, { span: Number($event) })"
              ><ElOption :value="24" label="整行" /><ElOption
                :value="12"
                label="半行"
/><ElOption
                :value="16"
                label="三分之二"
/><ElOption
                :value="8"
                label="三分之一"
/></ElSelect></label>
          <p class="hint">小屏幕自动使用整行；排序在各区域内生效。</p>
          <label class="property"><span>{{ selected.widgetKind === 'table' ? '表格' : '表单' }}模板</span>
            <ElSelect
              :model-value="fcBindings[selectedKey]"
              :loading="templatesLoading"
              filterable
              placeholder="选择模板"
              @change="setBinding"
              ><ElOption
                v-for="t in selectedTemplates"
                :key="t.id"
                :label="t.name"
                :value="t.id"
            /></ElSelect>
          </label>
          <ElAlert
            v-if="templatesError"
            title="模板加载失败"
            type="error"
            :closable="false"
            >
<ElButton link @click="loadTemplates">重新加载</ElButton>
</ElAlert>
          <RouterLink
            :to="{ name: 'SystemFcSchema' }"
            target="_blank"
            class="template-link"
            >
管理表单模板 ↗
</RouterLink>
          <ElButton
            link
            size="small"
            :loading="templatesLoading"
            @click="loadTemplates"
            >
刷新模板列表
</ElButton>
          <p class="hint">
            共用模板修改会影响引用它的页面。需要独立字段时，请新建模板再绑定。
          </p>
          <details class="module-identity">
            <summary>模块标识与数据</summary>
            <p>{{ selected.key }}</p>
            <p>
              改名、隐藏、移动均保留此标识与已有业务数据，便于后续节点引用。
            </p>
          </details>
        </template>
        <p v-else class="hint">选择左侧模块开始配置</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.view-designer {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.designer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.toolbar-note {
  margin-left: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.designer-columns {
  display: grid;
  grid-template-columns: 210px minmax(320px, 1fr) 270px;
  min-height: 580px;
}

h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.module-library,
.module-properties {
  padding: 16px;
  background: var(--el-bg-color);
}

.module-library {
  border-right: 1px solid var(--el-border-color-lighter);
}

.module-properties {
  border-left: 1px solid var(--el-border-color-lighter);
}

.hint {
  margin: 8px 0 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.library-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.library-item {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  text-align: left;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary) !important;
}

.create-module {
  display: grid;
  gap: 10px;
  padding-top: 16px;
  margin-top: 24px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.layout-canvas,
.preview-surface {
  padding: 20px;
  background: var(--el-fill-color-light);
}

.canvas-page-head {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 16px;
  background: var(--el-bg-color);
  border-radius: 8px;
}

.canvas-page-head span,
.region-heading span {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.region {
  padding: 16px;
  margin-top: 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 10px;
}

.region-heading {
  margin-bottom: 12px;
}

.region-heading h3 {
  margin-bottom: 4px;
}

.region-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 12px;
}

.module-tile {
  min-width: 0;
  padding: 12px;
  cursor: pointer;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.tile-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.drag-handle {
  color: var(--el-text-color-secondary);
  cursor: grab;
}

.template-caption {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.tile-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.drop-hint {
  padding: 24px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.property {
  display: grid;
  gap: 8px;
  margin: 18px 0;
  font-size: 13px;
}

.template-link {
  display: inline-block;
  margin: 0 8px 8px 0;
  font-size: 12px;
  color: var(--el-color-primary);
}

.module-identity {
  margin-top: 24px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.module-identity p {
  margin-top: 8px;
}

@media (max-width: 1200px) {
  .designer-columns {
    grid-template-columns: 170px minmax(260px, 1fr) 230px;
  }
}

@media (max-width: 900px) {
  .designer-columns {
    grid-template-columns: 1fr;
  }

  .module-library,
  .module-properties {
    border: 0;
  }

  .library-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
