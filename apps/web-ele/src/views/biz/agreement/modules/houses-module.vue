<script lang="ts" setup>
import type { Ref } from 'vue';

import type {
  ModuleInnerConfig,
  ModuleInnerFieldItem,
  ModuleInnerSection,
} from '../module-inner-config';
/**
 * 房屋信息：浏览态只读表；有权限时「新增/编辑」走右侧抽屉，避免表内横滚直改
 */
import type { AgreementDetail, HouseRow } from '../types';

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
  normalizeHousesModuleInner,
  resolveEnabledFields,
  resolveEnabledSections,
} from '../module-inner-config';
import { useAgreeFieldAccess } from '../use-field-access';

const props = defineProps<{
  /** 是否允许新增/编辑/删除（由详情壳按场景权限传入） */
  canEdit?: boolean;
  detail: AgreementDetail | null;
}>();
const emit = defineEmits<{ dirty: [] }>();

const { fieldVisible, fieldFormat } = useAgreeFieldAccess();

const injectedInner = inject<Ref<ModuleInnerConfig | null>>(
  'agreeModuleInnerHouses',
  ref(null),
);

const innerConfig = computed(() =>
  normalizeHousesModuleInner(injectedInner.value),
);

const section = computed(() => {
  const secs = resolveEnabledSections(innerConfig.value);
  return secs.find((s) => s.key === 'houses') || secs[0] || null;
});

const rows = ref<HouseRow[]>([]);
const dirty = ref(false);

/** 抽屉 */
const drawerOpen = ref(false);
const drawerIndex = ref(-1);
const draft = reactive<Record<string, unknown>>({});

watch(
  () => props.detail,
  (val) => {
    rows.value = val ? cloneJson(val.houses) : [];
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

/**
 * 某子块可见字段（含权限过滤）
 * @param sec 子块
 */
function sectionFields(sec: ModuleInnerSection) {
  return resolveEnabledFields(sec).filter((f) => columnVisible(f));
}

/**
 * 表格列：去掉勾选占位列；用 computed 避免 template v-for 导致 ElTableColumn 注册失败
 */
const tableColumns = computed(() => {
  if (!section.value) return [];
  return sectionFields(section.value).filter((f) => f.key !== '_selection');
});

function isSelectCol(field: ModuleInnerFieldItem) {
  const cell = field.cellType || field.controlType;
  return cell === 'select' || cell === 'yesno';
}

function cellValue(row: HouseRow, key: string) {
  return (row as unknown as Record<string, unknown>)[key];
}

/**
 * 单元格展示文案（浏览态）
 * @param row 表格行（ElTable DefaultRow）
 * @param col 列
 */
function displayCell(row: unknown, col: ModuleInnerFieldItem) {
  const rec = (row ?? {}) as HouseRow;
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

/** 空行模板 */
function emptyRow(): HouseRow {
  return {
    id: `hs-${Date.now()}`,
    address: '',
    certNo: '',
    propertyType: '',
    buildArea: '',
    expropriatedArea: '',
    houseType: '',
    structure: '',
    yearBuilt: '',
    floor: '',
    evalValue: '',
  };
}

/**
 * 打开抽屉：新增或编辑
 * @param index -1 新增；否则编辑该行
 */
function openDrawer(index: number) {
  if (!props.canEdit) return;
  const current = index < 0 ? emptyRow() : rows.value[index];
  if (!current) return;
  drawerIndex.value = index;
  replaceDraft(cloneJson(current) as unknown as Record<string, unknown>);
  drawerOpen.value = true;
}

/** 关闭抽屉不保存草稿到表格 */
function closeDrawer() {
  drawerOpen.value = false;
  drawerIndex.value = -1;
}

/** 抽屉确认写入行 */
function confirmDrawer() {
  if (!section.value) return;
  const required = sectionFields(section.value).filter((f) => f.required);
  for (const col of required) {
    if (!String(draft[col.key] ?? '').trim()) {
      ElMessage.warning(`请填写「${col.label}」`);
      return;
    }
  }
  const row = {
    ...emptyRow(),
    ...(cloneJson(draft) as unknown as Record<string, unknown>),
  } as unknown as HouseRow;
  if (!row.id) row.id = `hs-${Date.now()}`;
  if (drawerIndex.value < 0) {
    rows.value.push(row);
  } else {
    rows.value[drawerIndex.value] = row;
  }
  markDirty();
  closeDrawer();
}

function removeRow(index: number) {
  if (!props.canEdit) return;
  if (section.value?.tableOptions?.allowRemove === false) return;
  const minRows = section.value?.tableOptions?.minRows ?? 1;
  if (rows.value.length <= minRows) {
    ElMessage.warning(`至少保留 ${minRows} 套房屋`);
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
  return { houses: cloneJson(rows.value) };
}

const evalTotalText = computed(() => {
  const sum = rows.value.reduce(
    (acc, r) => acc + (Number(r.evalValue) || 0),
    0,
  );
  return sum.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});

function isDirty() {
  return dirty.value;
}

defineExpose({ validate, getValues, isDirty });
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
        <!-- 必须直接 v-for 在 ElTableColumn 上，包 template 会导致列不渲染 -->
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
      <div
        v-if="rows.length"
        class="mt-2 text-right text-sm font-medium text-red-500"
      >
        评估总价值：¥ {{ evalTotalText }}
      </div>
    </SectionCard>
    <div v-else class="py-8 text-center text-xs text-gray-400">
      当前场景未挂载房屋列，请在页面配置中启用
    </div>

    <ElDrawer
      v-model="drawerOpen"
      :title="drawerIndex < 0 ? '新增房屋' : '编辑房屋'"
      size="420px"
      destroy-on-close
    >
      <ElForm v-if="section" label-width="100px" class="pr-2">
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
