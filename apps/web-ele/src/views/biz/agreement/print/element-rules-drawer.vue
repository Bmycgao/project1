<script lang="ts" setup>
/**
 * 打印元素高级规则抽屉：日常只配 agreeVisibleWhen / agreeFormat
 * 已有 agreeRowFilter / agreeValueExpr 仍原样写回，避免清空历史模板
 */
import type { AgreePrintData } from './types';

import { computed, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTag,
} from 'element-plus';

import { PRINT_EXPR_HELP, PRINT_EXPR_PRESETS } from './fields';
import {
  getElementOptions,
  listPrintElements,
  patchElementOptions,
} from './print-element-meta';
import { validatePrintExpr } from './print-expr';

const props = defineProps<{
  modelValue: boolean;
  /** 样例 printData（表达式测试） */
  sampleData: AgreePrintData;
  /** 当前模板 JSON */
  templateJson: null | Record<string, any>;
}>();

const emit = defineEmits<{
  /** 应用规则后的新 JSON（勿用 apply，避免与 DOM/CSS 语义冲突） */
  rulesApply: [Record<string, any>];
  'update:modelValue': [boolean];
}>();

const selectedKey = ref('');
const applying = ref(false);
const agreeVisibleWhen = ref('');
const agreeRowFilter = ref('');
const agreeValueExpr = ref('');
const agreeFormat = ref('');

const elements = computed(() => listPrintElements(props.templateJson));

const selectedRef = computed(() =>
  elements.value.find((e) => e.key === selectedKey.value),
);

const isTextLike = computed(
  () =>
    selectedRef.value?.type === 'text' ||
    selectedRef.value?.type === 'longText',
);

const sampleCtx = computed(
  () => props.sampleData as unknown as Record<string, unknown>,
);

/** 条件显隐校验结果 */
const visibleCheck = computed(() =>
  validatePrintExpr(agreeVisibleWhen.value, sampleCtx.value),
);

/**
 * 把样例求值说成「将打印 / 将隐藏」，避免理解成测试对错
 * @param preview 表达式结果字符串
 */
function visibleSampleLabel(preview: string | undefined) {
  if (preview === 'true') return '当前设计器样例下：将打印';
  if (preview === 'false') return '当前设计器样例下：将隐藏';
  return `当前设计器样例求值 → ${preview}`;
}

/** 显隐结果条颜色：假为警告（会藏），不是失败 */
const visibleAlertType = computed(() => {
  if (!visibleCheck.value.ok) return 'error' as const;
  if (visibleCheck.value.preview === 'false') return 'warning' as const;
  return 'success' as const;
});

/** 选中元素变化时回填表单 */
watch(selectedKey, (key) => {
  if (!key || !props.templateJson) return;
  const ref = elements.value.find((e) => e.key === key);
  if (!ref) return;
  const opts = getElementOptions(props.templateJson, ref) || {};
  agreeVisibleWhen.value = String(opts.agreeVisibleWhen || '');
  agreeRowFilter.value = String(opts.agreeRowFilter || '');
  agreeValueExpr.value = String(opts.agreeValueExpr || '');
  agreeFormat.value = String(opts.agreeFormat || '');
});

/** 打开时默认选第一个元素 */
watch(
  () => props.modelValue,
  (open) => {
    if (open && elements.value.length > 0 && !selectedKey.value) {
      const first = elements.value[0];
      if (first) selectedKey.value = first.key;
    }
  },
);

watch(
  () => props.templateJson,
  () => {
    if (
      selectedKey.value &&
      !elements.value.some((e) => e.key === selectedKey.value)
    ) {
      selectedKey.value = elements.value[0]?.key || '';
    }
  },
);

/**
 * 快捷填入预设表达式
 * @param target 目标字段
 * @param value 表达式
 */
function applyPreset(
  target: 'agreeFormat' | 'agreeVisibleWhen',
  value: string,
) {
  if (target === 'agreeVisibleWhen') agreeVisibleWhen.value = value;
  if (target === 'agreeFormat') agreeFormat.value = value;
}

/**
 * 写入模板 JSON 并通知父级刷新画布
 */
function onApply() {
  if (applying.value) return;
  const elRef = selectedRef.value;
  if (!elRef) {
    ElMessage.warning('请先选择要配置的元素');
    return;
  }
  if (!props.templateJson?.panels?.length) {
    ElMessage.warning('模板 JSON 未就绪，请关闭后重新打开「高级规则」');
    return;
  }
  applying.value = true;
  try {
    const next = patchElementOptions(props.templateJson, elRef, {
      agreeVisibleWhen: agreeVisibleWhen.value.trim(),
      agreeRowFilter: agreeRowFilter.value.trim(),
      agreeValueExpr: agreeValueExpr.value.trim(),
      agreeFormat: agreeFormat.value.trim(),
    });
    emit('update:modelValue', false);
    emit('rulesApply', next);
  } catch (error: any) {
    console.error('[print-rules] apply failed', error);
    ElMessage.error(error?.message || '应用规则失败');
  } finally {
    applying.value = false;
  }
}

function close() {
  emit('update:modelValue', false);
}
</script>

<template>
  <ElDrawer
    :model-value="modelValue"
    title="元素高级规则（显隐 / 格式）"
    size="420px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElForm label-position="top" size="small">
      <ElAlert
        class="mb-3"
        type="info"
        :closable="false"
        title="下方按钮只是填入公式，不会切换样例数据。正式打印仍走真实协议。"
      />
      <ElCollapse class="mb-3">
        <ElCollapseItem title="表达式写法说明" name="help">
          <div
            v-for="block in PRINT_EXPR_HELP"
            :key="block.title"
            class="print-rules-help__block"
          >
            <div class="print-rules-help__title">{{ block.title }}</div>
            <ul>
              <li v-for="(line, i) in block.lines" :key="i">{{ line }}</li>
            </ul>
          </div>
        </ElCollapseItem>
      </ElCollapse>
      <ElFormItem label="选择元素">
        <ElSelect
          v-model="selectedKey"
          filterable
          class="w-full"
          placeholder="选择纸面元素"
        >
          <ElOption
            v-for="el in elements"
            :key="el.key"
            :label="el.label"
            :value="el.key"
          />
        </ElSelect>
      </ElFormItem>

      <ElFormItem v-if="selectedRef" label="绑定字段">
        <ElTag size="small" type="info">
          {{ selectedRef.field || '（无 field）' }}
        </ElTag>
        <ElTag size="small" class="ml-1">{{ selectedRef.type }}</ElTag>
      </ElFormItem>

      <ElFormItem label="条件显隐 agreeVisibleWhen">
        <ElInput
          v-model="agreeVisibleWhen"
          type="textarea"
          :rows="2"
          placeholder="如 hasRewards、amount > 500000"
        />
        <div class="mt-1 flex flex-wrap gap-1">
          <ElButton
            v-for="p in PRINT_EXPR_PRESETS.visibleWhen"
            :key="p.value"
            size="small"
            @click="applyPreset('agreeVisibleWhen', p.value)"
          >
            {{ p.label }}
          </ElButton>
        </div>
        <ElAlert
          v-if="agreeVisibleWhen"
          class="mt-2"
          :type="visibleAlertType"
          :closable="false"
          :title="
            visibleCheck.ok
              ? visibleSampleLabel(visibleCheck.preview)
              : visibleCheck.message
          "
        />
      </ElFormItem>

      <ElFormItem v-if="isTextLike" label="展示格式 agreeFormat">
        <ElSelect
          v-model="agreeFormat"
          clearable
          placeholder="不格式化"
          class="w-full"
        >
          <ElOption
            v-for="p in PRINT_EXPR_PRESETS.format"
            :key="p.value"
            :label="p.label"
            :value="p.value"
          />
        </ElSelect>
      </ElFormItem>

      <!-- 操作栏放在抽屉内容区，避免 footer 插槽被遮挡导致点击无响应 -->
      <div class="print-rules-drawer__actions">
        <ElButton @click="close">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="!selectedRef"
          :loading="applying"
          @click.prevent.stop="onApply"
        >
          应用到模板
        </ElButton>
      </div>
    </ElForm>
  </ElDrawer>
</template>

<style scoped>
.print-rules-drawer__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 12px;
  margin-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.print-rules-help__block {
  margin-bottom: 10px;
  font-size: 12px;
  color: #4b5563;
}

.print-rules-help__title {
  margin-bottom: 4px;
  font-weight: 600;
  color: #374151;
}

.print-rules-help__block ul {
  padding-left: 16px;
  margin: 0;
}
</style>
