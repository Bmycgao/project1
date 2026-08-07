<script lang="ts" setup>
/**
 * 区块卡片：左侧短竖条标题，替代老系统彩色通栏
 */
defineProps<{
  /** 标题 */
  title: string;
  /** 可选副标题 */
  subtitle?: string;
}>();
</script>

<template>
  <section class="agree-section mb-4 overflow-hidden rounded-lg border border-gray-200/80 bg-white">
    <header
      class="flex items-center justify-between border-b border-gray-100 px-4 py-3"
    >
      <div class="flex min-w-0 items-center gap-2">
        <span class="agree-section__bar shrink-0" />
        <div class="min-w-0">
          <h3 class="m-0 text-sm font-semibold text-gray-800">{{ title }}</h3>
          <p v-if="subtitle" class="m-0 mt-0.5 text-xs text-gray-400">
            {{ subtitle }}
          </p>
        </div>
      </div>
      <div class="shrink-0">
        <slot name="extra" />
      </div>
    </header>
    <div class="p-4">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.agree-section__bar {
  display: inline-block;
  width: 3px;
  height: 14px;
  background: #2563eb;
  border-radius: 2px;
}
</style>
