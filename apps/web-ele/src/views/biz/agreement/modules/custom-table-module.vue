<script lang="ts" setup>
import type { Ref } from 'vue';

import type { FcRuleMap } from '../fc/types';
import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
/**
 * 配置台自定义表格：浏览只读表；有权限时抽屉新增/编辑行
 */
import type { AgreementDetail } from '../types';

import { computed, inject, reactive, ref, watch } from 'vue';

import {
  ElButton,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import { cloneJson } from '../clone';
import SectionCard from '../components/section-card.vue';
import { buildSectionFromFcTable } from '../fc/rule-to-inner';
import { isFcRule } from '../fc/types';
import {
  normalizeCustomTableInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';

const props = defineProps<{
  /** 是否允许改表 */
  canEdit?: boolean;
  detail: AgreementDetail | null;
  /** 显示名 */
  label?: string;
  /** 自定义模块 key */
  moduleKey: string;
}>();
const emit = defineEmits<{ dirty: [] }>();

const customInners = inject<Ref<Record<string, ModuleInnerConfig>>>(
  'agreeModuleInnerCustom',
  ref({}),
);
const injectedFcRules = inject<Ref<FcRuleMap>>('agreeFcRules', ref({}));

const innerConfig = computed(() => {
  const fcRule = injectedFcRules.value?.[props.moduleKey];
  // 绑定了 FormCreate 模板时，用模板列（如「新建表格」），不要用默认名称/备注
  const fcSection = isFcRule(fcRule)
    ? buildSectionFromFcTable(fcRule, props.label || '自定义表格')
    : null;
  if (fcSection) {
    return { sections: [fcSection] };
  }
  return normalizeCustomTableInner(
    customInners.value[props.moduleKey],
    props.label || '自定义表格',
  );
});

const section = computed(() => {
  const secs = resolveEnabledSections(innerConfig.value);
  return secs[0] || null;
});

const rows = ref<Record<string, unknown>[]>([]);
const dirty = ref(false);
const drawerOpen = ref(false);
const drawerIndex = ref(-1);
const draft = reactive<Record<string, unknown>>({});

watch(
  () => [props.detail, props.moduleKey] as const,
  () => {
    rows.value = cloneJson(props.detail?.extraTables?.[props.moduleKey] || []);
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  if (dirty.value) return;
  dirty.value = true;
  emit('dirty');
}

function sectionFields(sec: ModuleInnerSection) {
  return resolveEnabledFields(sec).filter((f) => f.enabled);
}

/** 表格列（去掉勾选占位；直接 v-for 到 ElTableColumn） */
const tableColumns = computed(() => {
  if (!section.value) return [];
  return sectionFields(section.value).filter((f) => f.key !== '_selection');
});

function isSelectCol(field: ModuleInnerFieldItem) {
  const cell = field.cellType || field.controlType;
  return cell === 'select' || cell === 'yesno';
}

function cellValue(row: Record<string, unknown>, key: string) {
  return row[key];
}

/**
 * 浏览单元格文案
 * @param row 表格行（ElTable DefaultRow）
 * @param col 列
 */
function displayCell(row: unknown, col: ModuleInnerFieldItem) {
  const rec = (row ?? {}) as Record<string, unknown>;
  const raw = cellValue(rec, col.key);
  return raw === undefined || raw === null || raw === '' ? '—' : String(raw);
}

/**
 * 用新对象覆盖抽屉草稿，避免动态 delete
 * @param next 下一份草稿
 */
function replaceDraft(next: Record<string, unknown>) {
  for (const k of Object.keys(draft)) {
    draft[k] = undefined;
  }
  Object.assign(draft, next);
}

/** 空行 */
function emptyRow(): Record<string, unknown> {
  const next: Record<string, unknown> = { id: `ct-${Date.now()}` };
  for (const col of section.value ? sectionFields(section.value) : []) {
    if (col.key !== '_selection') next[col.key] = '';
  }
  return next;
}

/**
 * 打开抽屉：-1 新增，否则编辑该行
 * @param index 行下标
 */
function openDrawer(index: number) {
  if (!props.canEdit) return;
  const current = index < 0 ? emptyRow() : rows.value[index];
  if (!current) return;
  drawerIndex.value = index;
  replaceDraft(cloneJson(current));
  drawerOpen.value = true;
}

function closeDrawer() {
  drawerOpen.value = false;
  drawerIndex.value = -1;
}

function confirmDrawer() {
  if (!section.value) return;
  for (const col of sectionFields(section.value).filter((f) => f.required)) {
    if (!String(draft[col.key] ?? '').trim()) {
      ElMessage.warning(`请填写「${col.label}」`);
      return;
    }
  }
  const row = cloneJson(draft);
  if (!row.id) row.id = `ct-${Date.now()}`;
  if (drawerIndex.value < 0) rows.value.push(row);
  else rows.value[drawerIndex.value] = row;
  markDirty();
  closeDrawer();
}

function removeRow(index: number) {
  if (!props.canEdit) return;
  if (section.value?.tableOptions?.allowRemove === false) return;
  const minRows = section.value?.tableOptions?.minRows ?? 0;
  if (rows.value.length <= minRows) {
    ElMessage.warning(`至少保留 ${minRows} 行`);
    return;
  }
  rows.value.splice(index, 1);
  markDirty();
}

async function validate() {
  if (!section.value) return true;
  const required = sectionFields(section.value).filter((f) => f.required);
  for (const col of required) {
    if (rows.value.some((r) => !String(cellValue(r, col.key) ?? '').trim())) {
      ElMessage.warning(`请填写「${col.label}」`);
      return false;
    }
  }
  return true;
}

function getValues() {
  return {
    extraTables: { [props.moduleKey]: cloneJson(rows.value) },
  };
}

defineExpose({ validate, getValues, isDirty: () => dirty.value });
</script>

<template>
  <div>
    <SectionCard v-if="section" :title="section.label" subtitle="">
      <template #extra>
        <ElButton
          v-if="canEdit && section.tableOptions?.allowAdd !== false"
          size="small"
          type="primary"
          link
          @click="openDrawer(-1)"
        >
          + 添加
        </ElButton>
      </template>
      <ElTable
        :data="rows"
        border
        size="small"
        row-key="id"
        class="w-full"
        style="width: 100%"
      >
        <ElTableColumn type="index" label="#" width="48" />
        <ElTableColumn
          v-for="col in tableColumns"
          :key="col.key"
          :label="col.label"
          :min-width="col.minWidth || 100"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ displayCell(row, col) }}
          </template>
        </ElTableColumn>
        <ElTableColumn
          v-if="canEdit"
          label="操作"
          width="120"
          fixed="right"
          align="center"
        >
          <template #default="{ $index }">
            <ElButton
              type="primary"
              link
              size="small"
              @click="openDrawer($index)"
            >
              编辑
            </ElButton>
            <ElButton
              v-if="section.tableOptions?.allowRemove !== false"
              type="danger"
              link
              size="small"
              @click="removeRow($index)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </SectionCard>
    <div v-else class="py-8 text-center text-xs text-gray-400">
      当前组件尚未配置列
    </div>

    <ElDrawer
      v-model="drawerOpen"
      :title="drawerIndex < 0 ? '新增' : '编辑'"
      size="420px"
      destroy-on-close
    >
      <ElForm v-if="section" label-width="100px">
        <ElFormItem
          v-for="col in tableColumns"
          :key="col.key"
          :label="col.label"
          :required="col.required"
        >
          <ElSelect
            v-if="isSelectCol(col)"
            class="w-full"
            :model-value="String(draft[col.key] ?? '')"
            @update:model-value="(v: string) => (draft[col.key] = v)"
          >
            <ElOption
              v-for="opt in col.options || [
                { label: '是', value: '是' },
                { label: '否', value: '否' },
              ]"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </ElSelect>
          <ElInput
            v-else
            :placeholder="col.placeholder || `请输入${col.label}`"
            :model-value="String(draft[col.key] ?? '')"
            @update:model-value="(v: string) => (draft[col.key] = v)"
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <div class="flex justify-end gap-2">
          <ElButton @click="closeDrawer">取消</ElButton>
          <ElButton type="primary" @click="confirmDrawer">确定</ElButton>
        </div>
      </template>
    </ElDrawer>
  </div>
</template>
