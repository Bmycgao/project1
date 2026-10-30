<script setup lang="ts">
defineProps<{ draft?: boolean; scope: string; target: string }>();
</script>

<template>
  <div class="print-edit-scope" aria-label="编辑范围">
    <div class="print-edit-scope__heading">
      <strong>正在编辑：{{ target }}</strong>
      <span v-if="draft" class="print-edit-scope__badge">草稿 · 尚未应用</span>
    </div>
    <p>作用范围：{{ scope }}</p>
    <p class="print-edit-scope__hint">
      {{
        draft
          ? '应用到画布后，再保存模板。取消放弃本窗口的修改。'
          : '修改后更新画布，点击顶部「保存」写入模板。'
      }}
    </p>
  </div>
</template>

<style scoped>
.print-edit-scope {
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.print-edit-scope__heading {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
}

.print-edit-scope__badge {
  color: var(--el-color-warning-dark-2);
}

.print-edit-scope p {
  margin: 3px 0 0;
}

.print-edit-scope__hint {
  color: var(--el-text-color-secondary);
}
</style>
