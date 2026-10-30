<script setup lang="ts">
import type { PrintMaskMode, PrintMaskRule } from '../runtime/print-masking';

import { computed, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTag,
} from 'element-plus';

import { cloneJson } from '../../clone';
import {
  AGREE_PRINT_ALL_FIELDS,
  AGREE_PRINT_TABLE_FIELDS,
  TABLE_COLUMN_PRESETS,
} from '../data/fields';
import {
  maskPrintValue,
  normalizePrintMaskRules,
  PRINT_MASK_MODES,
} from '../runtime/print-masking';

const props = defineProps<{
  initialField?: string;
  modelValue: boolean;
  sampleData: Record<string, any>;
  templateJson: null | Record<string, any>;
}>();
const emit = defineEmits<{
  apply: [Record<string, any>];
  'update:modelValue': [boolean];
}>();
const draft = ref<PrintMaskRule[]>([]);
const field = ref('');
const choices = computed(() => {
  const items = new Map<string, string>();
  for (const item of AGREE_PRINT_ALL_FIELDS)
    if (item.group !== 'table') items.set(item.field, item.text);
  for (const [source, cols] of Object.entries(TABLE_COLUMN_PRESETS))
    for (const col of cols)
      items.set(
        `${source}.${col.field}`,
        `${AGREE_PRINT_TABLE_FIELDS.find((item) => item.field === source)?.text || source} · ${col.title}`,
      );
  const visit = (data: unknown, prefix = '') => {
    if (Array.isArray(data)) {
      for (const row of data) visit(row, prefix);
    } else if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('__')) continue;
        const path = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object') visit(value, path);
        else if (!items.has(path)) items.set(path, path);
      }
    }
  };
  visit(props.sampleData);
  if (props.initialField && !items.has(props.initialField))
    items.set(props.initialField, props.initialField);
  for (const rule of draft.value)
    if (!items.has(rule.field)) items.set(rule.field, rule.field);
  return [...items].map(([value, label]) => ({
    value,
    label: `${label} (${value})`,
  }));
});
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    draft.value = normalizePrintMaskRules(
      props.templateJson?.agreePrintMaskRules,
    );
    field.value = props.initialField || draft.value[0]?.field || 'compensatee';
  },
  { immediate: true },
);
const rule = computed(() =>
  draft.value.find((item) => item.field === field.value),
);
const enabled = computed({
  get: () => Boolean(rule.value),
  set: (on: boolean) => {
    draft.value = draft.value.filter((item) => item.field !== field.value);
    if (on && field.value)
      draft.value.push({ field: field.value, mode: 'all' });
  },
});
const mode = computed({
  get: () => rule.value?.mode || 'all',
  set: (value: PrintMaskMode) => {
    if (rule.value) rule.value.mode = value;
  },
});
const sampleValue = computed(() => {
  let value: any = props.sampleData;
  for (const part of field.value.split('.')) {
    if (Array.isArray(value)) value = value[0];
    value = value?.[part];
  }
  return value;
});
const sampleOutput = computed(() =>
  rule.value
    ? maskPrintValue(sampleValue.value, rule.value)
    : String(sampleValue.value ?? ''),
);
const hasSample = computed(
  () =>
    sampleValue.value !== null &&
    sampleValue.value !== undefined &&
    sampleValue.value !== '',
);
function apply() {
  if (!props.templateJson) return;
  const rules = normalizePrintMaskRules(draft.value);
  if (rules.length !== draft.value.length) {
    ElMessage.error('字段路径无效，请从列表选择字段，例如 houses.certNo');
    return;
  }
  const next = cloneJson(props.templateJson);
  if (rules.length > 0) next.agreePrintMaskRules = rules;
  else delete next.agreePrintMaskRules;
  emit('apply', next);
  emit('update:modelValue', false);
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    title="打印脱敏"
    width="680px"
    top="6vh"
    body-class="print-mask__body"
    :style="{ maxWidth: 'calc(100vw - 32px)' }"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert type="info" :closable="false" class="mb-4">
      <template #title>
        按字段设置本模板的打码方式，画布、预览、打印和 PDF 使用相同规则。
      </template>
      同一字段的所有绑定位置都会生效。明细字段请选具体列，例如“房屋明细 ·
      产权证号”。
    </ElAlert>
    <ElForm label-position="top">
      <ElFormItem label="选择字段">
        <ElSelect
          v-model="field"
          filterable
          allow-create
          default-first-option
          placeholder="搜索字段，也可输入自定义字段路径"
          style="width: 100%"
          aria-label="脱敏字段"
        >
          <ElOption
            v-for="item in choices"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="打印时打码">
        <ElSwitch
          v-model="enabled"
          :disabled="!field"
          aria-label="打印时打码"
        />
      </ElFormItem>
      <ElFormItem v-if="enabled" label="脱敏方式">
        <ElSelect v-model="mode" style="width: 100%" aria-label="脱敏方式">
          <ElOption
            v-for="item in PRINT_MASK_MODES"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
      </ElFormItem>
      <div v-if="rule && mode === 'custom'" class="print-mask__custom">
        <ElFormItem label="保留开头字符数">
          <ElInputNumber
            v-model="rule.keepStart"
            :min="0"
            :max="100"
            :precision="0"
            aria-label="保留开头字符数"
          />
        </ElFormItem>
        <ElFormItem label="保留结尾字符数">
          <ElInputNumber
            v-model="rule.keepEnd"
            :min="0"
            :max="100"
            :precision="0"
            aria-label="保留结尾字符数"
          />
        </ElFormItem>
      </div>
    </ElForm>
    <div class="print-mask__preview" role="status">
      <strong>样例输出</strong>
      <p>
        {{
          hasSample
            ? sampleOutput
            : '当前样例无值；空值保持为空，可在样例数据中补充后查看效果。'
        }}
      </p>
    </div>
    <p class="print-mask__hint">
      引用脱敏字段的计算、汇总和拼接表达式统一显示 ***。计算和筛选仍使用原值。
      固定文字及其他字段中预先拼接的信息需单独检查；短于保留位数的值全部隐藏。
    </p>
    <div class="print-mask__rules">
      <strong>已设置 {{ draft.length }} 个字段</strong>
      <div v-if="draft.length" class="print-mask__tags">
        <ElTag
          v-for="item in draft"
          :key="item.field"
          closable
          @click="field = item.field"
          @close="draft = draft.filter((entry) => entry.field !== item.field)"
        >
          <button type="button" :aria-label="`编辑 ${item.field} 脱敏规则`">
            {{ item.field }}
          </button>
        </ElTag>
      </div>
      <p v-else class="print-mask__hint">
        暂未设置，选择字段并开启打码即可添加。
      </p>
    </div>
    <template #footer>
      <ElButton @click="emit('update:modelValue', false)">取消</ElButton>
      <ElButton type="primary" @click="apply">应用到模板</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
:deep(.print-mask__body) {
  max-height: calc(88vh - 120px);
  overflow: auto;
}

.print-mask__custom,
.print-mask__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.print-mask__preview {
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.print-mask__preview p {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.print-mask__hint {
  margin: 12px 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.print-mask__rules {
  margin-top: 20px;
}

.print-mask__tags {
  margin-top: 12px;
}

.print-mask__tags button {
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
}
</style>
