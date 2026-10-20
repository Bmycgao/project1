<script setup lang="ts">
import type { PageSchemaReference } from '../../../../../../shared/page-schema';

import type { PageSchemaUsage } from '#/api';

import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import { getPageSchemaUsage } from '#/api';

const props = defineProps<{ schemaId?: string }>();
const emit = defineEmits<{ openPage: [id: string] }>();
const router = useRouter();
const usage = ref<PageSchemaUsage>();
const loading = ref(false);
const failed = ref(false);
let requestId = 0;

async function loadUsage() {
  const current = ++requestId;
  usage.value = undefined;
  failed.value = false;
  loading.value = false;
  if (!props.schemaId) return;
  loading.value = true;
  try {
    const result = await getPageSchemaUsage(props.schemaId);
    if (current === requestId) usage.value = result;
  } catch {
    if (current === requestId) failed.value = true;
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch(() => props.schemaId, loadUsage, { immediate: true });

function openReference(value: object) {
  const row = value as PageSchemaReference;
  if (row.type === 'columnTemplate' || row.type === 'listDetail')
    emit('openPage', row.id);
  else if (row.type === 'menu') void router.push({ name: 'SystemMenu' });
  else void router.push({ name: 'SystemWorkflowEdit', params: { id: row.id } });
}
</script>

<template>
  <ElEmpty
    v-if="!schemaId"
    description="保存后可查看菜单、公共列方案和流程的引用位置"
  />
  <template v-else>
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="font-medium">使用位置</div>
      <ElButton size="small" :loading="loading" @click="loadUsage">
        刷新引用
      </ElButton>
    </div>
    <ElAlert
      v-if="failed"
      title="使用位置加载失败，不能据此判断是否被引用。请重试。"
      type="error"
      :closable="false"
    />
    <template v-else>
      <ElAlert
        v-if="usage"
        class="mb-3"
        type="info"
        :closable="false"
        :title="`实时引用 ${usage.liveCount} 处 · 流程冻结快照 ${usage.snapshotCount} 处`"
        description="实时引用会读取当前配置；已发布及已停用的流程版本保留冻结快照。删除前必须先解除实时引用。"
      />
      <ElTable
        v-loading="loading"
        :data="usage?.references || []"
        border
        empty-text="暂无菜单、公共列方案或流程引用"
      >
        <ElTableColumn prop="title" label="引用位置" min-width="180" />
        <ElTableColumn
          prop="description"
          label="用途与生效范围"
          min-width="300"
        />
        <ElTableColumn label="引用方式" width="120">
          <template #default="{ row }">
            <ElTag :type="row.mode === 'snapshot' ? 'info' : 'success'">
              {{ row.mode === 'snapshot' ? '冻结快照' : '实时引用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="90">
          <template #default="{ row }">
            <ElButton link type="primary" @click="openReference(row)">
              查看
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </template>
  </template>
</template>
