<script lang="ts" setup>
/**
 * 表单模板编辑：iframe 加载独立 FormCreate 设计器
 * rule 经 JSON 序列化后 postMessage（避免 DataCloneError）
 */
import type { FcRule } from '../../biz/agreement/fc/types';

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { ElButton, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus';

import { createFcSchema, getFcSchema, updateFcSchema } from '#/api';

import {
  buildDefaultCustomFormFcRule,
  buildDefaultCustomTableFcRule,
} from '../../biz/agreement/fc/default-rules';
import {
  buildFcFormOption,
  cloneFcRule,
  isFcRule,
} from '../../biz/agreement/fc/types';

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === 'new');
const schemaId = computed(() => String(route.params.id || ''));

const name = ref('');
const kind = ref<'form' | 'table'>('form');
const remark = ref('');
const saving = ref(false);
const iframeReady = ref(false);
/** 待灌入 rule 的 JSON 字符串（可 structuredClone） */
const pendingRuleJson = ref('[]');
const iframeRef = ref<HTMLIFrameElement | null>(null);

const embedSrc = `${import.meta.env.BASE_URL}fc-designer-embed.html`;

/**
 * rule → 纯 JSON 字符串（去掉 Proxy / 函数，供 postMessage）
 * @param rule 规则
 */
function ruleToJson(rule: FcRule[]): string {
  try {
    return JSON.stringify(rule || []);
  } catch {
    return '[]';
  }
}

/**
 * JSON 字符串 → rule
 * @param raw JSON 或数组
 */
function jsonToRule(raw: unknown): FcRule[] | null {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return isFcRule(data) ? cloneFcRule(data) : null;
  } catch {
    return null;
  }
}

/**
 * 向 iframe 发消息（payload 必须可结构化克隆）
 * @param payload 消息
 */
function postToEmbed(payload: Record<string, unknown>) {
  const win = iframeRef.value?.contentWindow;
  if (!win) return;
  // 再走一遍 JSON，确保无可克隆对象
  const safe = JSON.parse(
    JSON.stringify({ source: 'fc-designer-host', ...payload }),
  );
  win.postMessage(safe, '*');
}

/**
 * 推送 rule 到设计器
 * @param rule 规则
 */
function pushRule(rule: FcRule[]) {
  pendingRuleJson.value = ruleToJson(rule);
  if (!iframeReady.value) return;
  postToEmbed({ type: 'fc-init', ruleJson: pendingRuleJson.value });
}

/**
 * 加载模板
 */
async function loadSchema() {
  if (isNew.value) {
    name.value = '';
    remark.value = '';
    kind.value = (route.query.kind as 'form' | 'table') || 'form';
    pushRule(
      kind.value === 'table'
        ? buildDefaultCustomTableFcRule('新表格')
        : buildDefaultCustomFormFcRule('新表单'),
    );
    return;
  }
  const data = await getFcSchema(schemaId.value);
  name.value = data.name || '';
  kind.value = data.kind;
  remark.value = data.remark || '';
  pushRule(isFcRule(data.rule) ? cloneFcRule(data.rule) : []);
}

/**
 * 保存模板
 * @param rule 画布规则
 */
async function persistTemplate(rule: FcRule[]) {
  const label = name.value.trim();
  if (!label) {
    ElMessage.warning('请先填写模板名称');
    return;
  }
  if (!isFcRule(rule)) {
    ElMessage.warning('画布为空，请先从左侧拖入控件');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      name: label,
      kind: kind.value,
      remark: remark.value.trim(),
      status: 1 as const,
      rule: cloneFcRule(rule),
      option: buildFcFormOption(),
    };
    if (isNew.value) {
      const created = await createFcSchema(payload);
      ElMessage.success('模板已保存');
      await router.replace({
        name: 'SystemFcSchemaEdit',
        params: { id: created.id },
      });
    } else {
      await updateFcSchema(schemaId.value, payload);
      ElMessage.success('模板已保存');
    }
  } finally {
    saving.value = false;
  }
}

function onToolbarSave() {
  if (!iframeReady.value) {
    ElMessage.warning('设计器尚未就绪');
    return;
  }
  postToEmbed({ type: 'fc-get-rule' });
}

/**
 * 接收 iframe 消息
 * @param event MessageEvent
 */
function onMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || data.source !== 'fc-designer-embed') return;

  if (data.type === 'fc-ready') {
    iframeReady.value = true;
    postToEmbed({ type: 'fc-init', ruleJson: pendingRuleJson.value });
    return;
  }

  if (data.type === 'fc-save' || data.type === 'fc-rule') {
    const rule = jsonToRule(data.ruleJson) || jsonToRule(data.rule);
    if (!rule) {
      ElMessage.warning('画布为空，请先从左侧拖入控件');
      return;
    }
    void persistTemplate(rule);
    return;
  }

  if (data.type === 'fc-error') {
    ElMessage.error(data.message || '设计器加载失败');
  }
}

function onBack() {
  router.push({ name: 'SystemFcSchema' });
}

onMounted(() => {
  window.addEventListener('message', onMessage);
  loadSchema().catch((error: any) => {
    ElMessage.error(error?.message || '加载失败');
  });
});

onUnmounted(() => {
  window.removeEventListener('message', onMessage);
});
</script>

<template>
  <Page auto-content-height>
    <div class="fc-edit-page">
      <header class="fc-edit-page__bar">
        <ElButton size="small" @click="onBack">返回列表</ElButton>
        <ElInput
          v-model="name"
          class="fc-edit-page__name"
          placeholder="模板名称，如：协议基础信息表单"
          size="small"
        />
        <ElSelect
          v-model="kind"
          class="fc-edit-page__kind"
          size="small"
          :disabled="!isNew"
        >
          <ElOption label="表单" value="form" />
          <ElOption label="表格" value="table" />
        </ElSelect>
        <ElInput
          v-model="remark"
          class="fc-edit-page__remark"
          placeholder="备注（可选）"
          size="small"
        />
        <ElButton
          type="primary"
          size="small"
          :loading="saving"
          @click="onToolbarSave"
        >
          保存模板
        </ElButton>
      </header>
      <iframe
        ref="iframeRef"
        class="fc-edit-page__frame"
        :src="embedSrc"
        title="FormCreate 设计器"
      ></iframe>
    </div>
  </Page>
</template>

<style>
.fc-edit-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  min-height: 520px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.fc-edit-page__bar {
  box-sizing: border-box;
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  height: 52px;
  padding: 0 12px;
  border-bottom: 1px solid #ececec;
}

.fc-edit-page__name {
  width: 240px;
}

.fc-edit-page__kind {
  width: 100px;
}

.fc-edit-page__remark {
  flex: 1;
  min-width: 120px;
}

.fc-edit-page__frame {
  flex: 1;
  width: 100%;
  min-height: 0;
  background: #fff;
  border: 0;
}
</style>
