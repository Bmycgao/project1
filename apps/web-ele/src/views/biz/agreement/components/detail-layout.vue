<script setup lang="ts">
import type { AgreeModuleLayoutItem } from '../access/module-access';

import { computed, nextTick, ref, watch } from 'vue';

import { ElEmpty } from 'element-plus';

const props = defineProps<{ modules: AgreeModuleLayoutItem[] }>();
const active = defineModel<string>('active', { default: '' });
const root = ref<HTMLElement>();
const content = computed(() =>
  props.modules.filter((m) => m.region === 'content'),
);
const tabs = computed(() => props.modules.filter((m) => m.region === 'tabs'));
watch(
  tabs,
  (items) => {
    if (!items.some((m) => m.key === active.value))
      active.value = items[0]?.key || '';
  },
  { immediate: true },
);
async function focusModule(key: string) {
  const item = props.modules.find((m) => m.key === key);
  if (!item) return;
  if (item.region === 'tabs') active.value = key;
  await nextTick();
  const block = [
    ...(root.value?.querySelectorAll<HTMLElement>('[data-module-key]') || []),
  ].find((el) => el.dataset.moduleKey === key);
  block?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
defineExpose({ focusModule });
</script>

<template>
  <div ref="root" class="detail-layout">
    <ElEmpty v-if="!modules.length" description="此视图没有可显示的资料模块" />
    <div v-if="content.length" class="detail-content">
      <section
        v-for="item in content"
        :key="item.key"
        :data-module-key="item.key"
        class="detail-card"
        :style="{ '--module-span': item.span }"
      >
        <header class="detail-card-head">
          <strong>{{ item.label }}</strong><slot name="actions" :item="item"></slot>
        </header>
        <div class="detail-card-body"><slot :item="item"></slot></div>
      </section>
    </div>
    <section v-if="tabs.length" class="detail-card detail-tabs">
      <nav class="detail-tab-nav" aria-label="详情资料">
        <button
          v-for="item in tabs"
          :key="item.key"
          type="button"
          class="detail-tab"
          :class="{ 'is-active': active === item.key }"
          :aria-pressed="active === item.key"
          @click="active = item.key"
        >
          {{ item.label }}<slot name="badge" :item="item"></slot>
        </button>
      </nav>
      <div
        v-for="item in tabs"
        v-show="active === item.key"
        :key="item.key"
        :data-module-key="item.key"
        class="detail-card-body"
      >
        <div class="detail-tab-actions">
          <slot name="actions" :item="item"></slot>
        </div>
        <slot :item="item"></slot>
      </div>
    </section>
  </div>
</template>

<style scoped>
.detail-layout {
  container-type: inline-size;
}

.detail-content {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 16px;
}

.detail-card {
  grid-column: span var(--module-span, 24);
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color, white);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
}

.detail-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.detail-card-body {
  min-width: 0;
  padding: 16px;
  overflow-x: auto;
}

.detail-tabs {
  margin-top: 16px;
}

.detail-tab-nav {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  overflow-x: auto;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.detail-tab {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  padding: 8px 16px;
  color: var(--el-text-color-regular);
  border-radius: 20px;
}

.detail-tab.is-active {
  font-weight: 600;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.detail-tab-actions {
  display: flex;
  justify-content: flex-end;
}

@container (max-width: 760px) {
  .detail-card {
    grid-column: span 24;
  }
}
</style>
