<script lang="ts" setup>
import type { ApprovalApi } from '#/api/approval';

import { computed, ref } from 'vue';

import { AccessControl } from '@vben/access';

import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElStep,
  ElSteps,
  ElTag,
  ElTimeline,
  ElTimelineItem,
} from 'element-plus';

import { approveInstance, rejectInstance } from '#/api/approval';
import { $t } from '#/locales';

const props = withDefaults(
  defineProps<{
    /** 是否可操作（待办场景） */
    actionable?: boolean;
    /** 审批实例 */
    instance: ApprovalApi.Instance;
  }>(),
  { actionable: false },
);

const emit = defineEmits<{
  /** 审批操作成功后通知父级刷新 */
  success: [];
}>();

const dialogVisible = ref(false);
const dialogAction = ref<'approve' | 'reject'>('approve');
const remark = ref('');
const submitting = ref(false);

/** 步骤条当前激活下标 */
const activeStep = computed(() => {
  const idx = props.instance.nodes.findIndex((n) => n.status === 'pending');
  if (idx >= 0) return idx;
  if (props.instance.status === 'approved') {
    return props.instance.nodes.length;
  }
  return Math.max(
    0,
    props.instance.nodes.findIndex((n) => n.status === 'rejected'),
  );
});

/**
 * 节点状态映射为 Steps 状态
 * @param status 节点状态
 */
function mapStepStatus(status: ApprovalApi.NodeStatus) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  if (status === 'pending') return 'process';
  return 'wait';
}

/**
 * 历史记录动作文案
 * @param action 动作类型
 */
function actionLabel(action: ApprovalApi.RecordItem['action']) {
  const map = {
    approve: $t('approval.actionApprove'),
    reject: $t('approval.actionReject'),
    submit: $t('approval.actionSubmit'),
  };
  return map[action];
}

/**
 * 打开通过/驳回弹窗
 * @param action 操作类型
 */
function openDialog(action: 'approve' | 'reject') {
  dialogAction.value = action;
  remark.value = '';
  dialogVisible.value = true;
}

/** 提交审批意见 */
async function submitAction() {
  if (dialogAction.value === 'reject' && !remark.value.trim()) {
    ElMessage.warning($t('approval.remarkPlaceholder'));
    return;
  }
  submitting.value = true;
  try {
    if (dialogAction.value === 'approve') {
      await approveInstance(props.instance.id, remark.value);
      ElMessage.success($t('approval.approve'));
    } else {
      await rejectInstance(props.instance.id, remark.value);
      ElMessage.success($t('approval.reject'));
    }
    dialogVisible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="approval-panel space-y-6">
    <div>
      <div class="mb-3 text-base font-medium">
        {{ $t('approval.flowProgress') }}
      </div>
      <ElSteps :active="activeStep" align-center finish-status="success">
        <ElStep
          v-for="node in instance.nodes"
          :key="node.code"
          :title="node.name"
          :description="node.approverName || node.remark"
          :status="mapStepStatus(node.status)"
        />
      </ElSteps>
    </div>

    <div>
      <div class="mb-3 text-base font-medium">
        {{ $t('approval.flowHistory') }}
      </div>
      <ElTimeline>
        <ElTimelineItem
          v-for="(item, index) in instance.records"
          :key="index"
          :timestamp="item.time"
          placement="top"
          :type="
            item.action === 'reject'
              ? 'danger'
              : item.action === 'approve'
                ? 'success'
                : 'primary'
          "
        >
          <div class="flex items-center gap-2">
            <span>{{ item.operatorName }}</span>
            <ElTag size="small">{{ actionLabel(item.action) }}</ElTag>
          </div>
          <div v-if="item.remark" class="mt-1 text-sm text-gray-500">
            {{ item.remark }}
          </div>
        </ElTimelineItem>
      </ElTimeline>
    </div>

    <div
      v-if="actionable && instance.status === 'pending'"
      class="flex justify-end gap-3"
    >
      <AccessControl :codes="['Approval:Reject']" type="code">
        <ElButton type="danger" @click="openDialog('reject')">
          {{ $t('approval.reject') }}
        </ElButton>
      </AccessControl>
      <AccessControl :codes="['Approval:Approve']" type="code">
        <ElButton type="primary" @click="openDialog('approve')">
          {{ $t('approval.approve') }}
        </ElButton>
      </AccessControl>
    </div>

    <ElDialog
      v-model="dialogVisible"
      :title="
        dialogAction === 'approve'
          ? $t('approval.approve')
          : $t('approval.reject')
      "
      width="420px"
    >
      <div class="mb-2">{{ $t('approval.remark') }}</div>
      <ElInput
        v-model="remark"
        type="textarea"
        :rows="4"
        :placeholder="$t('approval.remarkPlaceholder')"
      />
      <template #footer>
        <ElButton @click="dialogVisible = false">
          {{ $t('common.cancel') }}
        </ElButton>
        <ElButton
          type="primary"
          :loading="submitting"
          @click="submitAction"
        >
          {{ $t('common.confirm') }}
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>
