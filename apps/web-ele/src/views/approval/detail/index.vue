<script lang="ts" setup>
import type { ApprovalApi } from '#/api/approval';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import { ElCard, ElDescriptions, ElDescriptionsItem, ElTag } from 'element-plus';

import { getApprovalDetail } from '#/api/approval';
import BaseApproval from '#/components/approval/BaseApproval.vue';
import { $t } from '#/locales';

const route = useRoute();
const loading = ref(false);
const instance = ref<ApprovalApi.Instance | null>(null);

/** 是否来自待办入口（可审批） */
const actionable = computed(() => route.query.from === 'todo');

/**
 * 状态展示
 * @param status 实例状态
 */
function statusMeta(status: ApprovalApi.InstanceStatus) {
  const map: Record<
    ApprovalApi.InstanceStatus,
    { label: string; type: 'danger' | 'info' | 'success' | 'warning' }
  > = {
    approved: { label: $t('approval.statusApproved'), type: 'success' },
    cancelled: { label: $t('approval.statusCancelled'), type: 'info' },
    pending: { label: $t('approval.statusPending'), type: 'warning' },
    rejected: { label: $t('approval.statusRejected'), type: 'danger' },
  };
  return map[status];
}

/** 拉取详情 */
async function loadDetail() {
  const id = String(route.params.id || '');
  if (!id) return;
  loading.value = true;
  try {
    instance.value = await getApprovalDetail(id);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadDetail();
});
</script>

<template>
  <Page auto-content-height :title="$t('approval.detail')">
    <ElCard v-loading="loading" shadow="never">
      <template v-if="instance">
        <ElDescriptions :column="2" border class="mb-6">
          <ElDescriptionsItem :label="$t('approval.bizTitle')">
            {{ instance.bizTitle }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('approval.bizType')">
            {{ instance.bizType }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('approval.initiator')">
            {{ instance.initiatorName }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('approval.status')">
            <ElTag :type="statusMeta(instance.status).type">
              {{ statusMeta(instance.status).label }}
            </ElTag>
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="$t('approval.createTime')">
            {{ instance.createTime }}
          </ElDescriptionsItem>
        </ElDescriptions>

        <BaseApproval
          :instance="instance"
          :actionable="actionable"
          @success="loadDetail"
        />      </template>
    </ElCard>
  </Page>
</template>
