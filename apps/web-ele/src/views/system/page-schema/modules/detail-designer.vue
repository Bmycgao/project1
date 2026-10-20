<script setup lang="ts">
import type { AgreeFieldRule } from '../../../biz/agreement/access/field-access';
import type { AgreeModuleWidgetKind } from '../../../biz/agreement/access/module-access';
import type { ModuleInnerConfig } from '../../../biz/agreement/config/module-inner-config';
import type { FcRuleMap } from '../../../biz/agreement/fc/types';
import type { ModuleLayoutEditRow } from './module-layout-editor.vue';

import type { FcBindingsMap, FcSchemaApi } from '#/api';

import { computed, onMounted, ref, watch } from 'vue';

import { GripVertical } from '@vben/icons';

import {
  ElAlert,
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTag,
} from 'element-plus';

import { createFcSchema, getFcSchema, getFcSchemaList } from '#/api';

import {
  createCustomAgreeModule,
  normalizeModuleRegion,
  normalizeModuleSpan,
} from '../../../biz/agreement/access/module-access';
import {
  buildDefaultCustomFormInner,
  buildDefaultCustomTableInner,
} from '../../../biz/agreement/config/module-inner-config';
import { cloneFcRule } from '../../../biz/agreement/fc/types';
import {
  detailModuleKind,
  detailTemplateIssue,
  templateFieldSketches,
} from '../detail-designer-model';
import DetailPreview from './detail-preview.vue';
import TemplateOverview from './template-overview.vue';

const props = withDefaults(
  defineProps<{ fieldRules?: AgreeFieldRule[]; pageTitle?: string }>(),
  { pageTitle: '办理详情', fieldRules: () => [] },
);
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

const selectedKey = ref('');
const selected = computed(() =>
  layouts.value.find((m) => m.key === selectedKey.value),
);
const search = ref('');
const addingModule = ref(false);
const newName = ref('');
const newKind = ref<AgreeModuleWidgetKind>('form');
const templates = ref<FcSchemaApi.FcSchema[]>([]);
const templatesLoading = ref(false);
const templatesError = ref(false);
const preview = ref(false);
const previewLoading = ref(false);
const previewRules = ref<FcRuleMap>({});
const previewWidth = ref('desktop');
const templateDialog = ref(false);
const inspectingTemplate = ref<FcSchemaApi.FcSchema>();
const inspectingModuleKey = ref('');
const copyName = ref('');
const copyingTemplate = ref(false);
const checksVisible = ref(false);
const dragKey = ref('');

const regions = [
  { key: 'content', label: '内容区', hint: '直接展开 · 可调整模块宽度' },
  { key: 'tabs', label: '标签页区', hint: '切换查看 · 每个标签独占整行' },
] as const;
const activeTab = ref('');
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
      selected.value &&
      t.kind === detailModuleKind(selected.value) &&
      t.status === 1 &&
      t.usage !== 'workflowSupplement',
  ),
);
const issues = computed(() =>
  mounted.value.flatMap((module) => {
    const message = detailTemplateIssue(
      module,
      fcBindings.value,
      templates.value,
    );
    return message ? [{ key: module.key, message }] : [];
  }),
);
const canCheckTemplates = computed(
  () => !templatesLoading.value && !templatesError.value,
);
const validModuleCount = computed(
  () => mounted.value.length - issues.value.length,
);

function regionOf(row: ModuleLayoutEditRow) {
  return normalizeModuleRegion(row.key, row.region);
}
function rowsIn(region: string) {
  return mounted.value.filter((m) => regionOf(m) === region);
}
function templateOf(key: string) {
  return templates.value.find((t) => t.id === fcBindings.value[key]);
}
function templateName(key: string) {
  return (
    templateOf(key)?.name ||
    (fcBindings.value[key] ? '模板不可用，请重新选择' : '请选择模板')
  );
}
function issueOf(row: ModuleLayoutEditRow) {
  return detailTemplateIssue(row, fcBindings.value, templates.value);
}
function patch(key: string, value: Partial<ModuleLayoutEditRow>) {
  layouts.value = layouts.value.map((m) =>
    m.key === key ? { ...m, ...value } : m,
  );
}
function selectModule(key: string) {
  selectedKey.value = key;
  const row = layouts.value.find((m) => m.key === key);
  if (row?.enabled && regionOf(row) === 'tabs') activeTab.value = key;
}
function setEnabled(enabled: boolean) {
  const key = selectedKey.value;
  patch(key, { enabled });
  if (enabled && selected.value && regionOf(selected.value) === 'tabs')
    activeTab.value = key;
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
  const movedKey = keys.splice(index, 1)[0];
  if (movedKey === undefined) return;
  keys.splice(target, 0, movedKey);
  const order = new Map(keys.map((id, i) => [id, (i + 1) * 10]));
  layouts.value = layouts.value.map((m) =>
    order.has(m.key) ? { ...m, order: order.get(m.key) ?? m.order } : m,
  );
}
function startDrag(event: DragEvent, key: string) {
  dragKey.value = key;
  event.dataTransfer?.setData('text/plain', key);
}
function drop(region: 'content' | 'tabs', before?: string) {
  const key = dragKey.value;
  dragKey.value = '';
  if (!layouts.value.some((m) => m.key === key) || before === key) return;
  const ids = rowsIn(region)
    .filter((m) => m.key !== key)
    .map((m) => m.key);
  const index = before ? ids.indexOf(before) : ids.length;
  ids.splice(index < 0 ? ids.length : index, 0, key);
  const order = new Map(ids.map((id, i) => [id, (i + 1) * 10]));
  layouts.value = layouts.value.map((m) =>
    order.has(m.key)
      ? { ...m, enabled: true, region, order: order.get(m.key) ?? m.order }
      : m,
  );
  selectModule(key);
}
function changeRegion(region: unknown) {
  if (!selected.value || (region !== 'content' && region !== 'tabs')) return;
  patch(selectedKey.value, {
    region,
    order: Math.max(0, ...rowsIn(region).map((m) => m.order)) + 10,
  });
  if (region === 'tabs') activeTab.value = selectedKey.value;
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
      label: mount.label || mount.key,
      authCode: mount.authCode || '',
      order: mount.order ?? 10,
      span: 24,
      region: 'tabs',
    },
  ];
  customInners.value = {
    ...customInners.value,
    [mount.key]:
      newKind.value === 'table'
        ? buildDefaultCustomTableInner(mount.label || mount.key)
        : buildDefaultCustomFormInner(mount.label || mount.key),
  };
  selectModule(mount.key);
  newName.value = '';
  addingModule.value = false;
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
function inspectTemplate() {
  const template = templateOf(selectedKey.value);
  if (!template) return;
  inspectingTemplate.value = template;
  inspectingModuleKey.value = selectedKey.value;
  copyName.value = `${template.name} · 独立副本`;
  templateDialog.value = true;
}
async function copyTemplate() {
  const source = inspectingTemplate.value;
  const key = inspectingModuleKey.value;
  if (!source || copyingTemplate.value) return;
  if (!copyName.value.trim()) {
    ElMessage.warning('请填写副本名称');
    return;
  }
  copyingTemplate.value = true;
  try {
    const latest = await getFcSchema(source.id);
    const module = layouts.value.find((m) => m.key === key);
    if (!module || detailTemplateIssue(module, { [key]: source.id }, [latest]))
      throw new Error('原模板已不可用，请刷新后重新选择');
    const copy = await createFcSchema({
      name: copyName.value.trim(),
      kind: latest.kind,
      usage: 'agreementModule',
      status: 1,
      remark: `复制自「${latest.name}」，用于独立维护字段`,
      rule: cloneFcRule(latest.rule),
      option: latest.option ? structuredClone(latest.option) : undefined,
    });
    templates.value = [...templates.value, copy];
    if (fcBindings.value[key] === source.id) {
      fcBindings.value = { ...fcBindings.value, [key]: copy.id };
      ElMessage.success(
        '副本已创建并选中，保存页面后关联生效；可在模板编辑器中修改字段',
      );
    } else
      ElMessage.success(
        '副本已创建。当前模块关联已变化，请在模板列表中按需选择副本',
      );
    inspectingTemplate.value = copy;
    copyName.value = `${copy.name} · 独立副本`;
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : '复制模板失败，请重试',
    );
  } finally {
    copyingTemplate.value = false;
  }
}
async function openPreview() {
  previewLoading.value = true;
  try {
    await loadTemplates();
    if (templatesError.value) {
      ElMessage.error('无法检查模板，请刷新后重试');
      return;
    }
    if (mounted.value.length === 0 || issues.value.length > 0) {
      checksVisible.value = true;
      if (issues.value[0]) selectModule(issues.value[0].key);
      ElMessage.warning(
        mounted.value.length === 0
          ? '请至少显示一个模块'
          : '请先修复模板关联再预览',
      );
      return;
    }
    previewRules.value = Object.fromEntries(
      mounted.value.map((module) => [
        module.key,
        cloneFcRule(templateOf(module.key)?.rule || []),
      ]),
    );
    preview.value = true;
  } finally {
    previewLoading.value = false;
  }
}
watch(
  () => layouts.value.map((m) => m.key),
  (keys) => {
    if (!keys.includes(selectedKey.value)) selectedKey.value = keys[0] || '';
  },
  { immediate: true },
);
watch(
  () => rowsIn('tabs').map((m) => m.key),
  (keys) => {
    if (!keys.includes(activeTab.value)) activeTab.value = keys[0] || '';
  },
  { immediate: true },
);
onMounted(loadTemplates);
</script>

<template>
  <div class="view-designer">
    <header class="designer-toolbar">
      <div>
        <strong>{{ preview ? '效果预览' : '详情编排' }}</strong><span class="toolbar-note">{{ mounted.length }} 个显示 ·
          {{ layouts.length - mounted.length }} 个隐藏</span>
      </div>
      <div class="toolbar-actions">
        <ElButton v-if="preview" @click="preview = false">返回编排</ElButton>
        <template v-else>
          <ElButton
            :loading="templatesLoading"
            @click="checksVisible = !checksVisible"
          >
            配置检查<template v-if="canCheckTemplates">
              ·
              {{ issues.length || !mounted.length ? '待完善' : '通过' }}
            </template>
          </ElButton>
          <ElButton
            type="primary"
            plain
            :loading="previewLoading"
            @click="openPreview"
          >
            预览详情
          </ElButton>
        </template>
      </div>
    </header>
    <div
      v-if="checksVisible && !preview"
      class="designer-checks"
      aria-label="详情配置检查"
    >
      <ElAlert
        v-if="templatesError"
        type="error"
        title="模板检查失败，已有选择保留，请刷新重试"
        :closable="false"
      />
      <div class="check-heading">
        <strong>当前草稿检查</strong><ElButton link :loading="templatesLoading" @click="loadTemplates">
          刷新模板
        </ElButton>
      </div>
      <p v-if="!mounted.length">请至少显示一个模块。</p>
      <p v-else-if="templatesLoading">正在核实模板状态…</p>
      <template v-else-if="canCheckTemplates">
        <p>
          {{ validModuleCount }} /
          {{ mounted.length }} 个显示模块已关联有效模板。
        </p>
        <button
          v-for="issue in issues"
          :key="issue.key"
          class="check-issue"
          @click="selectModule(issue.key)"
        >
          {{ issue.message }} · 去配置
        </button>
      </template>
      <p class="hint">
        隐藏模块不参与模板检查；保存时会再次核实。流程发布还会检查节点权限与模板字段是否支持办理。
      </p>
    </div>
    <div v-if="preview" class="preview-surface">
      <div class="preview-toolbar">
        <div>
          <strong>{{ pageTitle }}</strong>
          <p class="hint">当前未保存草稿 · 示例数据 · 只读预览</p>
        </div>
        <ElSelect
          v-model="previewWidth"
          aria-label="预览宽度"
          class="preview-width"
        >
          <ElOption value="desktop" label="桌面宽度" /><ElOption
            value="mobile"
            label="窄屏 · 390px"
          />
        </ElSelect>
      </div>
      <div
        class="preview-device"
        :class="{ 'is-mobile': previewWidth === 'mobile' }"
      >
        <DetailPreview
          :modules="layouts"
          :rules="previewRules"
          :inners="inners"
          :field-rules="fieldRules"
        />
      </div>
    </div>
    <div v-else class="designer-columns">
      <aside class="module-library">
        <h3>资料模块</h3>
        <p class="hint">选择模块配置属性，也可拖入中间画布。</p>
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
            type="button"
            class="library-item"
            :class="{
              selected: selectedKey === item.key,
              'is-hidden': !item.enabled,
            }"
            :aria-pressed="selectedKey === item.key"
            :data-library-key="item.key"
            draggable="true"
            @click="selectModule(item.key)"
            @dragstart="startDrag($event, item.key)"
            @dragend="dragKey = ''"
          >
            <span class="library-copy"><span>{{ item.label }}</span><small>{{
                detailModuleKind(item) === 'table' ? '明细表' : '表单'
              }}</small></span>
            <span
              class="module-dot"
              :class="{ 'is-enabled': item.enabled }"
              :title="item.enabled ? '显示' : '隐藏'"
            ></span>
          </button>
          <p v-if="!palette.length" class="hint">没有找到对应模块</p>
        </div>
        <ElButton
          class="add-module-button"
          @click="addingModule = !addingModule"
        >
          {{ addingModule ? '收起添加' : '＋ 添加资料模块' }}
        </ElButton>
        <div v-if="addingModule" class="create-module">
          <ElInput
            v-model="newName"
            placeholder="例如：评估信息"
            aria-label="新模块名称"
            @keyup.enter="createModule"
          />
          <ElSelect v-model="newKind" aria-label="新模块类型">
            <ElOption value="form" label="表单 · 单份资料" /><ElOption
              value="table"
              label="表格 · 多条明细"
            />
          </ElSelect>
          <ElButton type="primary" @click="createModule">添加模块</ElButton>
        </div>
        <p class="library-note">
          模块保留同一条业务资料。改名、移动和隐藏均不删除已录入数据。
        </p>
      </aside>
      <main class="layout-canvas">
        <div class="canvas-caption">
          <span>页面结构 · 字段示意</span><span>拖动排序，点击配置</span>
        </div>
        <div class="canvas-page">
          <div class="canvas-page-head">
            <strong>{{ pageTitle }}</strong><ElTag size="small" type="info">详情页面</ElTag>
          </div>
          <section
            v-for="region in regions"
            :key="region.key"
            class="region"
            :class="{ 'is-dragging': !!dragKey }"
            :data-region="region.key"
            @dragover.prevent
            @drop.prevent="drop(region.key)"
          >
            <div class="region-heading">
              <h3>{{ region.label }}</h3>
              <span>{{ region.hint }}</span>
            </div>
            <nav
              v-if="region.key === 'tabs' && rowsIn('tabs').length"
              class="canvas-tabs"
              aria-label="编排标签页"
            >
              <button
                v-for="item in rowsIn('tabs')"
                :key="item.key"
                type="button"
                class="canvas-tab"
                :class="{ 'is-active': activeTab === item.key }"
                :aria-pressed="activeTab === item.key"
                draggable="true"
                :data-layout-tab="item.key"
                @click="selectModule(item.key)"
                @dragstart="startDrag($event, item.key)"
                @dragend="dragKey = ''"
                @dragover.prevent.stop
                @drop.prevent.stop="drop('tabs', item.key)"
              >
                {{ item.label
                }}<span
                  v-if="canCheckTemplates && issueOf(item)"
                  class="tab-warning"
                  >!</span>
              </button>
            </nav>
            <div class="region-grid">
              <article
                v-for="(item, index) in rowsIn(region.key)"
                v-show="region.key !== 'tabs' || activeTab === item.key"
                :key="item.key"
                class="module-tile"
                :class="{ selected: selectedKey === item.key }"
                :data-canvas-key="item.key"
                :style="{
                  '--module-span':
                    region.key === 'tabs' ? 24 : normalizeModuleSpan(item.span),
                }"
                tabindex="0"
                :aria-label="`配置模块：${item.label}`"
                @click="selectModule(item.key)"
                @keydown.enter.self="selectModule(item.key)"
                @keydown.space.prevent.self="selectModule(item.key)"
                @dragover.prevent.stop
                @drop.prevent.stop="drop(region.key, item.key)"
              >
                <div class="tile-heading">
                  <span
                    draggable="true"
                    class="drag-handle"
                    title="拖动调整顺序或显示区域"
                    @dragstart="startDrag($event, item.key)"
                    @dragend="dragKey = ''"
                    ><GripVertical class="size-4" /></span>
                  <strong>{{ item.label }}</strong><span class="tile-kind">{{
                    detailModuleKind(item) === 'table' ? '明细表' : '表单'
                  }}</span>
                </div>
                <div class="tile-body">
                  <p class="template-caption">{{ templateName(item.key) }}</p>
                  <p v-if="templatesLoading" class="hint">正在读取模板字段…</p>
                  <p v-else-if="templatesError" class="tile-warning">
                    模板加载失败，请刷新重试
                  </p>
                  <p v-else-if="issueOf(item)" class="tile-warning">
                    {{ issueOf(item) }}
                  </p>
                  <TemplateOverview
                    v-else
                    :rules="templateOf(item.key)?.rule"
                  />
                </div>
                <div class="tile-actions">
                  <ElButton
                    link
                    size="small"
                    :disabled="index === 0"
                    @click.stop="move(item.key, -1)"
                  >
                    前移
                  </ElButton>
                  <ElButton
                    link
                    size="small"
                    :disabled="index === rowsIn(region.key).length - 1"
                    @click.stop="move(item.key, 1)"
                  >
                    后移
                  </ElButton>
                  <ElButton
                    link
                    size="small"
                    @click.stop="
                      selectModule(item.key);
                      patch(item.key, { enabled: false });
                    "
                  >
                    隐藏
                  </ElButton>
                </div>
              </article>
            </div>
            <p v-if="!rowsIn(region.key).length" class="drop-hint">
              拖入模块，或选中左侧模块后设置显示区域
            </p>
          </section>
        </div>
        <p class="hint">
          字段示意来自所选模板；查看实际组件与示例数据请点击“预览详情”。
        </p>
      </main>
      <aside class="module-properties">
        <template v-if="selected">
          <div class="property-heading">
            <h3>模块属性</h3>
            <ElTag size="small" type="info">
              {{ detailModuleKind(selected) === 'table' ? '明细表' : '表单' }}
            </ElTag>
          </div>
          <label class="property property-toggle"><span>显示此模块</span><ElSwitch
              :model-value="selected.enabled"
              aria-label="显示此模块"
              @change="setEnabled(!!$event)"
          /></label>
          <label class="property"><span>显示名称</span><ElInput
              :model-value="selected.label"
              aria-label="模块显示名称"
              @change="
                patch(selectedKey, {
                  label: String($event).trim() || selected.label,
                })
              "
          /></label>
          <label class="property"><span>引用{{
                detailModuleKind(selected) === 'table' ? '表格' : '表单'
              }}模板</span>
            <ElSelect
              :model-value="fcBindings[selectedKey]"
              :loading="templatesLoading"
              filterable
              placeholder="选择模板"
              aria-label="引用模板"
              @change="setBinding"
            >
              <ElOption
                v-for="t in selectedTemplates"
                :key="t.id"
                :label="t.name"
                :value="t.id"
              />
              <ElOption
                v-if="
                  fcBindings[selectedKey] &&
                  !selectedTemplates.some(
                    (t) => t.id === fcBindings[selectedKey],
                  )
                "
                :value="fcBindings[selectedKey]!"
                :label="`待核实或已失效：${fcBindings[selectedKey]}`"
                disabled
              />
            </ElSelect>
          </label>
          <div class="template-actions">
            <ElButton
              link
              type="primary"
              :disabled="!templateOf(selectedKey)"
              @click="inspectTemplate"
            >
              查看字段 / 复制
</ElButton><ElButton link :loading="templatesLoading" @click="loadTemplates">
              刷新
            </ElButton>
          </div>
          <ElAlert
            v-if="templatesError"
            title="模板加载失败，已有选择保留"
            type="error"
            :closable="false"
          />
          <p
            v-else-if="canCheckTemplates && issueOf(selected)"
            class="tile-warning"
          >
            {{ issueOf(selected) }}
          </p>
          <label class="property"><span>显示区域</span><ElSelect
              :model-value="regionOf(selected)"
              aria-label="显示区域"
              @change="changeRegion"
              ><ElOption value="content" label="内容区 · 直接展开" /><ElOption
                value="tabs"
                label="标签页区 · 切换查看"
/></ElSelect></label>
          <label class="property"><span>模块宽度</span><ElSelect
              :model-value="
                regionOf(selected) === 'tabs'
                  ? 24
                  : normalizeModuleSpan(selected.span)
              "
              :disabled="regionOf(selected) === 'tabs'"
              aria-label="模块宽度"
              @change="
                patch(selectedKey, {
                  span: normalizeModuleSpan(Number($event)),
                })
              "
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
          <p class="hint">
            {{
              regionOf(selected) === 'tabs'
                ? '标签页独占整行；移回内容区后恢复原宽度。'
                : '小屏幕自动使用整行；排序在各区域内生效。'
            }}
          </p>
          <div class="property-guidance">
            <strong>字段与办理权限</strong>
            <p>
              字段、控件和校验在表单模板中维护。共用模板改动影响所有实时引用；需要独立字段时先复制模板。
            </p>
            <p>节点的隐藏、只读和可编辑权限在流程设计中设置。</p>
            <RouterLink
              :to="{ name: 'SystemFcSchema' }"
              target="_blank"
              class="template-link"
            >
              管理表单模板 ↗
            </RouterLink>
          </div>
          <details class="module-identity">
            <summary>模块标识与数据</summary>
            <p>{{ selected.key }}</p>
            <p>此标识用于绑定原有业务资料，显示名称不会改变数据归属。</p>
          </details>
        </template>
        <p v-else class="hint">选择左侧模块开始配置</p>
      </aside>
    </div>
    <ElDialog
      v-model="templateDialog"
      :title="inspectingTemplate?.name || '模板字段'"
      width="760px"
      append-to-body
    >
      <template v-if="inspectingTemplate">
        <div class="template-dialog-meta">
          <ElTag type="info">
            {{
              inspectingTemplate.kind === 'table' ? '明细表模板' : '表单模板'
            }}
</ElTag><span>{{ templateFieldSketches(inspectingTemplate.rule).length }} 组字段
            · 结构示意</span>
        </div>
        <TemplateOverview :rules="inspectingTemplate.rule" />
        <div class="copy-template-panel">
          <strong>复制后独立修改</strong>
          <p class="hint">
            副本保留字段和校验，原模板保持不变。副本创建后选中到当前模块，页面关联需要保存。
          </p>
          <ElInput
            v-model="copyName"
            aria-label="模板副本名称"
            placeholder="副本名称"
            :disabled="copyingTemplate"
          /><ElButton
            type="primary"
            :loading="copyingTemplate"
            @click="copyTemplate"
          >
            创建副本并选中
          </ElButton>
        </div>
      </template>
      <template #footer>
        <RouterLink
          v-if="inspectingTemplate"
          :to="{
            name: 'SystemFcSchemaEdit',
            params: { id: inspectingTemplate.id },
          }"
          target="_blank"
          class="template-link"
        >
          打开模板编辑器 ↗
</RouterLink><ElButton @click="templateDialog = false">关闭</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.view-designer {
  container-type: inline-size;
  overflow: hidden;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.designer-toolbar,
.toolbar-actions,
.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.designer-toolbar {
  padding: 14px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.toolbar-note {
  margin-left: 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.designer-columns {
  display: grid;
  grid-template-columns: 185px minmax(0, 1fr) 260px;
  align-items: start;
  min-height: 640px;
}

h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.module-library,
.module-properties {
  min-width: 0;
  padding: 16px;
}

.module-library {
  border-right: 1px solid var(--el-border-color-lighter);
}

.module-properties {
  border-left: 1px solid var(--el-border-color-lighter);
}

.hint,
.library-note {
  margin: 8px 0 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.library-list {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.library-item {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
}

.library-copy {
  display: grid;
  gap: 3px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.library-copy small {
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.library-item.is-hidden {
  color: var(--el-text-color-secondary);
}

.module-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  background: var(--el-border-color);
  border-radius: 50%;
}

.module-dot.is-enabled {
  background: var(--el-color-success);
}

.selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary) !important;
}

.library-item.selected {
  color: var(--el-color-primary);
}

.add-module-button {
  width: 100%;
  margin-top: 14px;
  border-style: dashed;
}

.create-module {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.library-note {
  padding-top: 16px;
  margin-top: 24px;
  font-size: 11px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.layout-canvas,
.preview-surface {
  min-width: 0;
  padding: 18px;
  background: var(--el-fill-color-light);
}

.canvas-caption {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.canvas-page {
  padding: 16px;
  container-type: inline-size;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.canvas-page-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.region {
  padding: 10px 0;
  border: 1px solid transparent;
  border-radius: 6px;
}

.region.is-dragging {
  background: var(--el-color-primary-light-9);
  border: 1px dashed var(--el-color-primary);
}

.region-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.region-heading span {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.region-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 12px;
}

.module-tile {
  grid-column: span var(--module-span, 24);
  min-width: 0;
  overflow: hidden;
  cursor: pointer;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.module-tile:focus-visible,
.library-item:focus-visible,
.canvas-tab:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.tile-heading {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 10px;
  font-size: 12px;
  background: var(--el-fill-color-extra-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.tile-heading strong {
  overflow-wrap: anywhere;
}

.tile-kind {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.drag-handle {
  display: inline-flex;
  color: var(--el-text-color-secondary);
  cursor: grab;
}

.tile-body {
  padding: 12px;
}

.template-caption {
  margin: 0 0 12px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.tile-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 10px 8px;
}

.drop-hint {
  padding: 26px 10px;
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
}

.canvas-tabs {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  overflow-x: auto;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.canvas-tab {
  flex-shrink: 0;
  padding: 8px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}

.canvas-tab.is-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.tab-warning {
  margin-left: 4px;
  color: var(--el-color-warning);
}

.property-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.property {
  display: grid;
  gap: 7px;
  margin: 18px 0;
  font-size: 12px;
}

.property-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.template-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.template-link {
  display: inline-block;
  margin: 8px 8px 8px 0;
  font-size: 12px;
  color: var(--el-color-primary);
}

.property-guidance {
  padding-top: 16px;
  margin-top: 20px;
  font-size: 12px;
  line-height: 1.7;
  border-top: 1px solid var(--el-border-color-lighter);
}

.property-guidance p {
  margin-top: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.module-identity {
  margin-top: 18px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.module-identity p {
  margin-top: 8px;
}

.designer-checks {
  padding: 14px 18px;
  font-size: 12px;
  background: var(--el-fill-color-extra-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.check-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.check-issue {
  display: block;
  margin-top: 8px;
  color: var(--el-color-warning-dark-2);
  text-align: left;
  background: transparent;
  border: 0;
}

.tile-warning {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-color-warning-dark-2);
}

.preview-width {
  width: 160px;
}

.preview-device {
  min-width: 0;
  padding: 16px;
  margin: 16px auto 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.preview-device.is-mobile {
  width: 390px;
  max-width: 100%;
}

.template-dialog-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 20px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.copy-template-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 16px;
  margin-top: 24px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.copy-template-panel strong,
.copy-template-panel p {
  grid-column: 1 / -1;
}

.copy-template-panel p {
  margin: 0;
}

@container (max-width: 1000px) {
  .designer-columns {
    grid-template-columns: 150px minmax(0, 1fr) 230px;
  }

  .module-library,
  .module-properties {
    padding: 12px;
  }

  .layout-canvas {
    padding: 12px;
  }
}

@container (max-width: 760px) {
  .designer-columns {
    grid-template-columns: 145px minmax(0, 1fr);
  }

  .module-properties {
    grid-column: 1 / -1;
    border-top: 1px solid var(--el-border-color-lighter);
    border-left: 0;
  }
}

@container (max-width: 480px) {
  .designer-columns {
    grid-template-columns: 1fr;
  }

  .module-library {
    border-right: 0;
  }

  .library-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar-note {
    display: block;
    margin: 4px 0 0;
  }

  .copy-template-panel {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 400px) {
  .module-tile {
    grid-column: span 24;
  }
}
</style>
