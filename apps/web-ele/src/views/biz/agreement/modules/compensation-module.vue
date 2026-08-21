<script lang="ts" setup>
import type { Ref } from 'vue';

import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
/**
 * 补偿安置：浏览只读表；有权限时抽屉新增/编辑行
 */
import type { AgreementDetail, CompensationRow } from '../types';

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
import {
  normalizeCompensationModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{
  canEdit?: boolean;
  detail: AgreementDetail | null;
}>();
const emit = defineEmits<{ dirty: [] }>();

const { fieldVisible, fieldFormat } = useAgreeFieldAccess();

const injectedInner = inject<Ref<ModuleInnerConfig | null>>(
  'agreeModuleInnerCompensation',
  ref(null),
);

const innerConfig = computed(() =>
  normalizeCompensationModuleInner(injectedInner.value),
);
const section = computed(() => {
  const secs = resolveEnabledSections(innerConfig.value);
  return secs.find((s) => s.key === 'compensation') || secs[0] || null;
});

const rows = ref<CompensationRow[]>([]);
const dirty = ref(false);
const drawerOpen = ref(false);
const drawerIndex = ref(-1);
const draft = reactive<Record<string, unknown>>({});

watch(
  () => props.detail,
  (val) => {
    rows.value = val ? cloneJson(val.compensationItems || []) : [];
    if (rows.value.length === 0 && val?.compensation?.amount) {
      rows.value = [
        {
          id: 'cp-legacy',
          name: val.compensation.settleType || '补偿',
          calcType: '',
          quantity: 1,
          unitPrice: '',
          amount: val.compensation.amount,
          remark: val.compensation.remark || '',
        },
      ];
    }
    dirty.value = false;
  },
  { immediate: true },
);

function markDirty() {
  if (dirty.value) return;
  dirty.value = true;
  emit('dirty');
}

function columnVisible(field: ModuleInnerFieldItem) {
  if (!field.enabled) return false;
  if (field.accessField) return fieldVisible(field.accessField);
  return true;
}

function sectionFields(sec: ModuleInnerSection) {
  return resolveEnabledFields(sec).filter((f) => columnVisible(f));
}

function isSelectCol(field: ModuleInnerFieldItem) {
  const cell = field.cellType || field.controlType;
  return cell === 'select' || cell === 'yesno';
}

function cellValue(row: CompensationRow, key: string) {
  return (row as Record<string, unknown>)[key];
}

function displayCell(row: unknown, col: ModuleInnerFieldItem) {
  const rec = (row ?? {}) as CompensationRow;
  const raw = cellValue(rec, col.key);
  if (col.accessField) return fieldFormat(col.accessField, raw);
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

function emptyRow(): CompensationRow {
  return {
    id: `cp-${Date.now()}`,
    name: '',
    calcType: '',
    quantity: '',
    unitPrice: '',
    amount: '',
    remark: '',
  };
}

function openDrawer(index: number) {
  if (!props.canEdit) return;
  const current = index < 0 ? emptyRow() : rows.value[index];
  if (!current) return;
  drawerIndex.value = index;
  replaceDraft(cloneJson(current) as unknown as Record<string, unknown>);
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
  const row = {
    ...emptyRow(),
    ...(cloneJson(draft) as unknown as Record<string, unknown>),
  } as unknown as CompensationRow;
  if (!row.id) row.id = `cp-${Date.now()}`;
  if (drawerIndex.value < 0) rows.value.push(row);
  else rows.value[drawerIndex.value] = row;
  markDirty();
  closeDrawer();
}

function removeRow(index: number) {
  if (!props.canEdit) return;
  if (section.value?.tableOptions?.allowRemove === false) return;
  const minRows = section.value?.tableOptions?.minRows ?? 1;
  if (rows.value.length <= minRows) {
    ElMessage.warning(`至少保留 ${minRows} 条补偿项`);
    return;
  }
  rows.value.splice(index, 1);
  markDirty();
}

const totalAmount = computed(() =>
  rows.value.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
);

async function validate() {
  if (!section.value) return true;
  for (const col of sectionFields(section.value).filter((f) => f.required)) {
    if (rows.value.some((r) => !String(cellValue(r, col.key) ?? '').trim())) {
      ElMessage.warning(`请填写「${col.label}」`);
      return false;
    }
  }
  return true;
}

function getValues() {
  const items = cloneJson(rows.value);
  const amount = items.reduce(
    (sum: number, r: CompensationRow) => sum + (Number(r.amount) || 0),
    0,
  );
  return {
    compensationItems: items,
    compensation: {
      settleType: items[0]?.name || '',
      settleAddress: '',
      amount,
      remark: items[0]?.remark || '',
    },
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
      <ElTable :data="rows" border size="small" row-key="id">
        <ElTableColumn type="index" label="#" width="48" />
        <ElTableColumn
          v-for="col in sectionFields(section)"
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
      <div
        v-if="rows.length"
        class="mt-2 text-right text-sm font-medium text-gray-600"
      >
        合计金额：¥
        {{
          totalAmount.toLocaleString('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        }}
      </div>
    </SectionCard>

    <ElDrawer
      v-model="drawerOpen"
      :title="drawerIndex < 0 ? '新增补偿项' : '编辑补偿项'"
      size="420px"
      destroy-on-close
    >
      <ElForm v-if="section" label-width="100px">
        <ElFormItem
          v-for="col in sectionFields(section)"
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
