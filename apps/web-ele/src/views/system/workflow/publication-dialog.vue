<script setup lang="ts">
import type { PublicationCheck } from '#/api/system/workflow';
import { ref } from 'vue';
import { ElAlert, ElButton, ElDialog, ElMessage } from 'element-plus';
import {
  checkWorkflowPublication,
  publishWorkflowVersion,
} from '#/api/system/workflow';
const emit = defineEmits<{
  published: [];
  locate: [issue: PublicationCheck['issues'][number]];
}>();
const visible = ref(false);
const loading = ref(false);
const publishing = ref(false);
const check = ref<PublicationCheck>();
const id = ref('');
async function open(value: string) {
  id.value = value;
  visible.value = true;
  check.value = undefined;
  loading.value = true;
  try {
    check.value = await checkWorkflowPublication(value);
  } catch {
  } finally {
    loading.value = false;
  }
}
async function publish() {
  if (!check.value || check.value.issues.length) return;
  publishing.value = true;
  try {
    await publishWorkflowVersion(id.value, check.value.revision);
    ElMessage.success('版本已发布，可以发起新流程');
    visible.value = false;
    emit('published');
  } catch {
  } finally {
    publishing.value = false;
  }
}
defineExpose({ open });
</script>
<template>
  <ElDialog
    v-model="visible"
    title="发布检查"
    width="640px"
    :close-on-click-modal="false"
    :show-close="!publishing"
    :close-on-press-escape="!publishing"
  >
    <div v-loading="loading" style="min-height: 150px">
      <template v-if="check">
        <h3 style=" margin-bottom: 16px;font-size: 18px">
          {{ check.name }} · V{{ check.version }}
        </h3>
        <p style="margin-bottom: 16px">
          {{ check.nodeCount }} 个节点 · {{ check.formCount }} 份表单快照
        </p>
        <ElAlert
          v-if="!check.issues.length"
          title="发布检查通过"
          type="success"
          :closable="false"
        />
        <ElAlert
          v-else
          :title="`发现 ${check.issues.length} 项问题，请修正后再发布`"
          type="error"
          :closable="false"
        />
        <div style="max-height: 280px; margin-top: 12px; overflow: auto">
          <button
            v-for="(issue, i) in check.issues"
            :key="i"
            style="
              display: block;
              margin: 10px 0;
              color: var(--el-color-danger);
              text-align: left;
            "
            @click="
              emit('locate', issue);
              visible = false;
            "
          >
            {{ i + 1 }}. {{ issue.message }}
          </button>
        </div>
        <ul
          style="
            padding: 16px 20px;
            line-height: 2;
            color: var(--el-text-color-secondary);
          "
        >
          <li>发布后本版本只读，修改需新建版本。</li>
          <li>流程图、表单字段规则、节点权限及按钮配置一并冻结。</li>
          <li>在途实例继续使用原版本，新发起使用最新发布版本。</li>
          <li>
            审批节点可配置会签（全部通过）、依次审批，或比例会签（达到百分比即流转，人数向上取整）；任一人驳回即退回。
          </li>
          <li>
            允许转办时可再开「转办后转回」：对方提交或通过后待办回到转办人；驳回仍按驳回路径退回。
          </li>
          <li>
            办理人可选「表单字段取人」，从协议的经办人或协办人字段读取用户 ID。
          </li>
          <li>
            开启撤回后，下一节点尚未办理时，上一环节办理人可在详情页撤回。
          </li>
        </ul>
      </template>
      <ElButton v-else-if="!loading" @click="open(id)">检查失败，重试</ElButton>
    </div>
    <template #footer
      ><ElButton :disabled="publishing" @click="visible = false">取消</ElButton
      ><ElButton
        type="primary"
        :loading="publishing"
        :disabled="!check || check.issues.length > 0 || loading"
        @click="publish"
        >确认发布</ElButton
      ></template
    >
  </ElDialog>
</template>
