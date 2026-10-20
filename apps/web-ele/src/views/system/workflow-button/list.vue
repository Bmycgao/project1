<script setup lang="ts">
import type { WorkflowButtonResource } from '#/api/system/workflow-button';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import {
  createWorkflowButtonResource,
  deleteWorkflowButtonResource,
  getWorkflowButtonResources,
  updateWorkflowButtonResource,
} from '#/api/system/workflow-button';

import {
  WORKFLOW_BUTTON_ACTIONS,
  workflowButtonConfig,
} from '../../../../../shared/workflow';

const rows = ref<WorkflowButtonResource[]>([]);
const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const editingCode = ref('');
const form = ref<WorkflowButtonResource>(blank());
function blank(): WorkflowButtonResource {
  return {
    code: '',
    action: 'submit',
    label: '',
    status: 1,
    placement: 'bottom',
    style: 'primary',
    visibleWhen: '',
    enabledWhen: '',
    disabledReason: '',
    confirmText: '',
    requireOpinion: false,
  };
}
async function load() {
  loading.value = true;
  try {
    rows.value = await getWorkflowButtonResources();
  } finally {
    loading.value = false;
  }
}
function openCreate() {
  editingCode.value = '';
  form.value = blank();
  visible.value = true;
}
function openEdit(value: unknown) {
  const row = value as WorkflowButtonResource;
  editingCode.value = row.code;
  form.value = structuredClone({
    ...workflowButtonConfig({}, row.action),
    ...row,
  });
  visible.value = true;
}
async function save() {
  if (!form.value.code.trim() || !form.value.label.trim()) {
    ElMessage.warning('请填写按钮编码和名称');
    return;
  }
  saving.value = true;
  try {
    await (editingCode.value
      ? updateWorkflowButtonResource(editingCode.value, form.value)
      : createWorkflowButtonResource(form.value));
    visible.value = false;
    ElMessage.success('按钮资源已保存');
    await load();
  } catch {
    // Request interceptor displays the server validation error.
  } finally {
    saving.value = false;
  }
}
async function remove(value: unknown) {
  const row = value as WorkflowButtonResource;
  try {
    await ElMessageBox.confirm(
      `删除按钮资源「${row.label}」？已发布流程保留原版本快照。`,
      '删除按钮资源',
      { type: 'warning' },
    );
    await deleteWorkflowButtonResource(row.code);
    ElMessage.success('按钮资源已删除');
    await load();
  } catch {
    // Cancel or request error.
  }
}
onMounted(() => void load());
</script>

<template>
  <Page auto-content-height>
    <div class="button-page">
      <header>
        <div>
          <h1>按钮管理</h1>
          <p>
            统一定义按钮资源，在流程节点中选择绑定；发布版本会保存当时的配置。
          </p>
        </div>
        <ElButton type="primary" @click="openCreate">新建按钮</ElButton>
      </header>
      <ElTable :data="rows" v-loading="loading" border>
        <ElTableColumn prop="code" label="按钮编码" min-width="160" />
        <ElTableColumn prop="label" label="显示名称" min-width="150" />
        <ElTableColumn label="动作类型" width="120">
          <template #default="{ row }">{{ row.action }}</template>
        </ElTableColumn>
        <ElTableColumn label="来源" width="100">
          <template #default="{ row }">
            {{ row.builtIn ? '内置' : '自建' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="row.status ? 'success' : 'info'">
              {{ row.status ? '启用' : '停用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="openEdit(row)">编辑</ElButton>
            <ElButton
              v-if="!row.builtIn"
              link
              type="danger"
              @click="remove(row)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElDialog
        v-model="visible"
        :title="editingCode ? '编辑按钮资源' : '新建按钮资源'"
        width="620px"
        :close-on-click-modal="!saving"
      >
        <ElForm label-position="top" :disabled="saving" @submit.prevent>
          <div class="field-pair">
            <ElFormItem label="按钮编码" required>
              <ElInput
                v-model="form.code"
                :disabled="!!editingCode"
                maxlength="80"
                placeholder="例如 SUBMIT_REVIEW"
              />
            </ElFormItem>
            <ElFormItem label="显示名称" required>
              <ElInput v-model="form.label" maxlength="80" />
            </ElFormItem>
          </div>
          <div class="field-pair">
            <ElFormItem label="动作类型" required>
              <ElSelect v-model="form.action" :disabled="!!form.builtIn">
                <ElOption
                  v-for="action in WORKFLOW_BUTTON_ACTIONS"
                  :key="action"
                  :label="workflowButtonConfig({}, action).label"
                  :value="action"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="状态">
              <ElSwitch
                v-model="form.status"
                :disabled="form.builtIn"
                :active-value="1"
                :inactive-value="0"
              />
            </ElFormItem>
          </div>
          <div class="field-pair">
            <ElFormItem label="位置">
              <ElSelect v-model="form.placement">
                <ElOption label="办理意见区顶部" value="top" /><ElOption
                  label="办理意见区底部"
                  value="bottom"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="样式">
              <ElSelect v-model="form.style">
                <ElOption label="普通" value="default" /><ElOption
                  label="主要"
                  value="primary"
                /><ElOption label="警告" value="warning" /><ElOption
                  label="危险"
                  value="danger"
                />
              </ElSelect>
            </ElFormItem>
          </div>
          <ElFormItem label="显示条件">
            <ElInput
              v-model="form.visibleWhen"
              placeholder="留空始终显示，例如 BuChangJinE >= 1000000"
            />
          </ElFormItem>
          <ElFormItem label="启用条件">
            <ElInput
              v-model="form.enabledWhen"
              placeholder="留空始终可用，例如 nodeCode == 'N_2'"
            />
          </ElFormItem>
          <ElFormItem label="禁用原因">
            <ElInput v-model="form.disabledReason" maxlength="200" />
          </ElFormItem>
          <ElFormItem label="二次确认文案">
            <ElInput v-model="form.confirmText" maxlength="300" />
          </ElFormItem>
          <ElFormItem label="办理意见必填">
            <ElSwitch
              v-model="form.requireOpinion"
              :disabled="form.action === 'reject'"
            /><span v-if="form.action === 'reject'">驳回始终必填</span>
          </ElFormItem>
          <p class="help">
            支持已保存的业务字段和
            nodeCode、instanceStatus、actorId、initiatorId。流程节点可进一步设置按钮角色权限。
          </p>
        </ElForm>
        <template #footer>
          <ElButton :disabled="saving" @click="visible = false">取消</ElButton><ElButton type="primary" :loading="saving" @click="save">
            保存
          </ElButton>
        </template>
      </ElDialog>
    </div>
  </Page>
</template>

<style scoped>
.button-page {
  padding: 22px;
  background: var(--el-bg-color);
  border-radius: 12px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

h1 {
  margin: 0 0 6px;
  font-size: 22px;
}

header p,
.help {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.field-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.field-pair :deep(.el-select) {
  width: 100%;
}

@media (max-width: 680px) {
  .field-pair {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
