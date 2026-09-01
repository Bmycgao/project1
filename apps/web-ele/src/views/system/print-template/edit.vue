<script lang="ts" setup>
/**
 * 打印模板编辑：维护元信息 + hiprint 设计器
 * 保存一次同时写入基本信息和模板 JSON
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { ElButton, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus';

import {
  createPrintTemplate,
  getPrintTemplate,
  updatePrintTemplate,
} from '#/api';

import { agreePrintTemplate } from '../../biz/agreement/print/agreement-template';
import DesignerPanel from '../../biz/agreement/print/designer-panel.vue';
import { cloneTemplate } from '../../biz/agreement/print/template-store';

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
const designerRef = ref<null | {
  getTemplateJson: () => null | Record<string, any>;
  markClean: () => void;
}>(null);

/** 加载模板元信息 */
async function loadRecord() {
  if (isNew.value) {
    recordId.value = '';
    name.value = '';
    templateCode.value = '';
    remark.value = '';
    bizType.value = 'agreement';
    status.value = 1;
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
    ElMessage.warning('请填写模板名称');
    return null;
  }
  if (!code) {
    ElMessage.warning('请填写模板编码');
    return null;
  }
  return code;
}

/** 新建：只建记录，设计器随后出现 */
async function createAndDesign() {
  const code = validateMeta();
  if (!code) return;
  saving.value = true;
  try {
    const created = await createPrintTemplate({
      name: name.value.trim(),
      templateCode: code,
      bizType: bizType.value,
      remark: remark.value,
      status: status.value,
      templateJson: cloneTemplate(agreePrintTemplate),
      version: 1,
    });
    recordId.value = created.id;
    ElMessage.success('已创建，可在下方设计版式');
    await router.replace({
      name: 'SystemPrintTemplateEdit',
      params: { id: created.id },
    });
  } catch (error: any) {
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
  if (isNew.value || !recordId.value) {
    await createAndDesign();
    return;
  }
  const code = validateMeta();
  if (!code) return;
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
    designerRef.value?.markClean();
    ElMessage.success('已保存信息和模板');
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function goBack() {
  router.push({ name: 'SystemPrintTemplate' });
}

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
    <div
      class="mb-2 flex shrink-0 flex-wrap items-end gap-2 rounded-lg border border-gray-200/80 bg-white px-3 py-2"
    >
      <div class="min-w-[180px] flex-1">
        <div class="mb-1 text-xs text-gray-500">模板名称</div>
        <ElInput v-model="name" placeholder="如：附件一" />
      </div>
      <div class="min-w-[180px] flex-1">
        <div class="mb-1 text-xs text-gray-500">模板编码 templateCode</div>
        <ElInput
          v-model="templateCode"
          placeholder="如：PrintFujian1"
          :disabled="!!recordId && !isNew"
        />
      </div>
      <div class="w-[140px]">
        <div class="mb-1 text-xs text-gray-500">业务类型</div>
        <ElSelect v-model="bizType" class="w-full">
          <ElOption label="协议" value="agreement" />
        </ElSelect>
      </div>
      <div class="w-[120px]">
        <div class="mb-1 text-xs text-gray-500">状态</div>
        <ElSelect v-model="status" class="w-full">
          <ElOption label="启用" :value="1" />
          <ElOption label="停用" :value="0" />
        </ElSelect>
      </div>
      <div class="min-w-[200px] flex-[2]">
        <div class="mb-1 text-xs text-gray-500">备注</div>
        <ElInput v-model="remark" placeholder="用途说明" />
      </div>
      <div class="flex gap-2 pb-0.5">
        <ElButton @click="goBack">返回列表</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveAll()">
          {{ isNew && !recordId ? '创建并设计' : '保存' }}
        </ElButton>
      </div>
    </div>

    <DesignerPanel
      v-if="recordId"
      ref="designerRef"
      class="min-h-0 flex-1"
      :template-id="recordId"
      delegate-save
      @save-requested="saveAll"
    />
    <div
      v-else
      class="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500"
    >
      请先填写模板名称与编码，点击「创建并设计」后再进入设计器
    </div>
  </Page>
</template>
