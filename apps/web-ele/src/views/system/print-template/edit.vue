<script lang="ts" setup>
/**
 * 打印模板编辑：维护元信息 + hiprint 设计器
 * 保存一次同时写入基本信息和模板 JSON
 */
import type { PrintTemplatePreset } from '../../biz/agreement/print/template/template-presets';

import { computed, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  ElButton,
  ElDrawer,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
} from 'element-plus';

import {
  createPrintTemplate,
  getPrintTemplate,
  updatePrintTemplate,
} from '#/api';

import DesignerPanel from '../../biz/agreement/print/designer/agreement-print-designer.vue';
import PrintTemplatePresetPicker from '../../biz/agreement/print/designer/print-template-preset-picker.vue';
import { createPrintTemplatePreset } from '../../biz/agreement/print/template/template-presets';

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === 'new');
const recordId = ref('');
const name = ref('');
const templateCode = ref('');
const bizType = ref('agreement');
const remark = ref('');
const status = ref<0 | 1>(1);
const loading = ref(false);
const saving = ref(false);
const infoOpen = ref(false);
const startingPreset = ref<PrintTemplatePreset>('example');
const designerDirty = ref(false);
const designerReady = ref(false);
const savedMeta = ref('');
const saveFeedback = ref<'failed' | 'idle' | 'saved'>('idle');
const designerRef = ref<null | {
  getTemplateJson: () => null | Record<string, any>;
  markClean: (json?: Record<string, any>) => void;
  preview: () => Promise<void>;
}>(null);

function metaSnapshot() {
  return JSON.stringify({
    name: name.value,
    templateCode: templateCode.value,
    bizType: bizType.value,
    status: status.value,
    remark: remark.value,
  });
}

const metaDirty = computed(() =>
  recordId.value
    ? metaSnapshot() !== savedMeta.value
    : Boolean(name.value || templateCode.value || remark.value),
);
const hasUnsavedChanges = computed(
  () => metaDirty.value || designerDirty.value,
);
const saveState = computed(() => {
  if (saving.value) return '保存中…';
  if (saveFeedback.value === 'failed') return '保存失败';
  if (hasUnsavedChanges.value) return '未保存';
  return recordId.value ? '已保存' : '尚未创建';
});

/** 加载模板元信息 */
async function loadRecord() {
  if (isNew.value) {
    recordId.value = '';
    name.value = '';
    templateCode.value = '';
    remark.value = '';
    bizType.value = 'agreement';
    status.value = 1;
    infoOpen.value = true;
    return;
  }
  loading.value = true;
  try {
    const row = await getPrintTemplate(String(route.params.id));
    recordId.value = row.id;
    name.value = row.name;
    templateCode.value = row.templateCode;
    bizType.value = row.bizType || 'agreement';
    remark.value = row.remark || '';
    status.value = row.status;
    savedMeta.value = metaSnapshot();
    saveFeedback.value = 'saved';
  } catch (error: any) {
    ElMessage.error(error?.message || '加载失败');
    router.back();
  } finally {
    loading.value = false;
  }
}

/** 校验名称与编码 */
function validateMeta() {
  const code = templateCode.value.trim();
  if (!name.value.trim()) {
    infoOpen.value = true;
    ElMessage.warning('请填写模板名称');
    return null;
  }
  if (!code) {
    infoOpen.value = true;
    ElMessage.warning('请填写模板编码');
    return null;
  }
  return code;
}

/** 新建：只建记录，设计器随后出现 */
async function createAndDesign() {
  if (saving.value || loading.value) return;
  const code = validateMeta();
  if (!code) return;
  saveFeedback.value = 'idle';
  saving.value = true;
  try {
    const created = await createPrintTemplate({
      name: name.value.trim(),
      templateCode: code,
      bizType: bizType.value,
      remark: remark.value,
      status: status.value,
      templateJson: createPrintTemplatePreset(startingPreset.value),
      version: 1,
    });
    recordId.value = created.id;
    savedMeta.value = metaSnapshot();
    saveFeedback.value = 'saved';
    infoOpen.value = false;
    ElMessage.success('已创建，可在下方设计版式');
    await router.replace({
      name: 'SystemPrintTemplateEdit',
      params: { id: created.id },
    });
  } catch (error: any) {
    saveFeedback.value = 'failed';
    ElMessage.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

/**
 * 一次保存：元信息 + 画布 JSON
 * @param canvasJson 设计器 Ctrl+S / 保存按钮传来的 JSON
 */
async function saveAll(canvasJson?: Record<string, any>) {
  if (saving.value || loading.value) return;
  if (isNew.value || !recordId.value) {
    await createAndDesign();
    return;
  }
  if (!designerReady.value) return;
  const code = validateMeta();
  if (!code) return;
  const submittedMeta = metaSnapshot();
  saveFeedback.value = 'idle';
  saving.value = true;
  try {
    const json = canvasJson?.panels?.length
      ? canvasJson
      : designerRef.value?.getTemplateJson();
    await updatePrintTemplate(recordId.value, {
      name: name.value.trim(),
      templateCode: code,
      bizType: bizType.value,
      remark: remark.value,
      status: status.value,
      ...(json?.panels ? { templateJson: json } : {}),
    });
    savedMeta.value = submittedMeta;
    if (json) designerRef.value?.markClean(json);
    saveFeedback.value = 'saved';
    ElMessage.success('已保存信息和模板');
  } catch (error: any) {
    saveFeedback.value = 'failed';
    ElMessage.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function goBack() {
  void router.push({ name: 'SystemPrintTemplate' });
}

onBeforeRouteLeave(async () => {
  if (!hasUnsavedChanges.value) return true;
  try {
    await ElMessageBox.confirm(
      '当前修改尚未保存，确定离开编辑页吗？',
      '未保存的修改',
      {
        confirmButtonText: '离开',
        cancelButtonText: '继续编辑',
        type: 'warning',
      },
    );
    return true;
  } catch {
    return false;
  }
});

onMounted(() => {
  void loadRecord();
});
</script>

<template>
  <Page
    auto-content-height
    content-class="flex h-full min-h-0 flex-col overflow-hidden p-2"
    v-loading="loading"
  >
    <header class="print-editor-header">
      <div class="print-editor-header__identity">
        <ElButton text @click="goBack">‹ 返回列表</ElButton>
        <div class="print-editor-header__name">
          <strong>{{ name || '新建打印模板' }}</strong>
          <span>{{ templateCode || '请先填写模板信息' }} ·
            {{ status ? '启用' : '停用' }}</span>
        </div>
        <span
          class="print-editor-header__status"
          :class="{
            'is-dirty': hasUnsavedChanges,
            'is-failed': saveFeedback === 'failed',
          }"
          role="status"
          >{{ saveState }}</span>
      </div>
      <div class="print-editor-header__actions">
        <ElButton @click="infoOpen = true">模板信息</ElButton>
        <ElButton
          v-if="recordId"
          :disabled="!designerReady"
          @click="designerRef?.preview()"
        >
          预览
        </ElButton>
        <ElButton
          type="primary"
          :loading="saving"
          :disabled="loading || (!!recordId && !designerReady)"
          @click="saveAll()"
        >
          {{ recordId ? '保存' : '创建并设计' }}
        </ElButton>
      </div>
    </header>

    <ElDrawer v-model="infoOpen" title="模板信息" size="400px" append-to-body>
      <div class="print-editor-meta">
        <label>模板名称 <ElInput v-model="name" placeholder="如：附件一" /></label>
        <label>模板编码
          <ElInput
            v-model="templateCode"
            placeholder="如：PrintFujian1"
            :disabled="!!recordId"
        /></label>
        <label>业务类型
          <ElSelect v-model="bizType" class="w-full"><ElOption label="协议" value="agreement" /></ElSelect></label>
        <label>状态
          <ElSelect v-model="status" class="w-full"><ElOption label="启用" :value="1" /><ElOption
              label="停用"
              :value="0"
/></ElSelect></label>
        <label>备注
          <ElInput
            v-model="remark"
            type="textarea"
            :rows="3"
            placeholder="用途说明"
        /></label>
        <div v-if="!recordId">
          <p class="mb-2">选择起始版式</p>
          <PrintTemplatePresetPicker v-model="startingPreset" />
        </div>
        <p>
          {{
            recordId
              ? '修改会保留在当前页面；点击顶部「保存」后写入模板。'
              : '点击「完成」后，使用顶部「创建并设计」创建所选版式。'
          }}
        </p>
      </div>
      <template #footer>
        <ElButton @click="infoOpen = false">完成</ElButton>
      </template>
    </ElDrawer>

    <DesignerPanel
      v-if="recordId"
      ref="designerRef"
      class="min-h-0 flex-1"
      :template-id="recordId"
      delegate-save
      @save-requested="saveAll"
      @dirty-change="designerDirty = $event"
      @ready-change="designerReady = $event"
    />
    <div
      v-else
      class="text-muted-foreground flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-background text-sm"
    >
      <div class="text-center">
        <p class="mb-3">先填写模板信息并选择起始版式，再开始设计。</p>
        <ElButton type="primary" @click="infoOpen = true">
          填写模板信息
        </ElButton>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.print-editor-header {
  display: flex;
  flex: none;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 58px;
  padding: 8px 14px;
  margin-bottom: 8px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.print-editor-header__identity,
.print-editor-header__actions {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.print-editor-header__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.print-editor-header__name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  white-space: nowrap;
}

.print-editor-header__name span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.print-editor-header__status {
  flex: none;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
  border-radius: 12px;
}

.print-editor-header__status.is-dirty {
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
}

.print-editor-header__status.is-failed {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.print-editor-meta {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.print-editor-meta label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
}

.print-editor-meta p {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 900px) {
  .print-editor-header {
    flex-wrap: wrap;
  }

  .print-editor-header__actions {
    margin-left: auto;
  }
}
</style>
