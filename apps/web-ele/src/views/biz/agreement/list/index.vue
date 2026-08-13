<script lang="ts" setup>
/**
 * 协议通用列表：
 * - 优先读菜单 meta.schemaId → 页面配置（按钮 / scene / 列）
 * - 无配置时回退本地 scenes.ts
 * - 数据：GET /biz/agreement/list?scene=xxx
 */
import type { AgreeToolbarButton } from '../actions';
import type { AgreeListRuntime } from '../resolve-runtime';
import type { AgreementListItem } from '../types';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElInput,
  ElLink,
  ElMessage,
  ElOption,
  ElSelect,
  ElSpace,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import { getAgreementList } from '#/api';

import {
  filterButtonsByAccessCodes,
  filterButtonsByShowWhen,
  isAgreeActionRegistered,
  runAgreeAction,
} from '../actions';
import { filterColumnsByFieldRules } from '../field-access';
import { loadAgreeListRuntime } from '../resolve-runtime';

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();

const schemaLoading = ref(false);
const loading = ref(false);
const keyword = ref('');
const statusFilter = ref('');
const selected = ref<AgreementListItem[]>([]);
const tableData = ref<AgreementListItem[]>([]);
/** 运行时配置（来自页面配置或本地场景） */
const runtime = ref<AgreeListRuntime | null>(null);

const metaKey = computed(() => {
  const m = route.meta as Record<string, any>;
  return `${m?.schemaId || ''}|${m?.sceneId || ''}|${route.fullPath}`;
});

/** 场景按钮 ∩ 权限码 ∩ showWhen（按勾选行状态） */
const permittedButtons = computed(() => {
  const byAccess = filterButtonsByAccessCodes(
    runtime.value?.buttons || [],
    accessStore.accessCodes,
  );
  return filterButtonsByShowWhen(byAccess, selected.value);
});

const mainButtons = computed(() =>
  permittedButtons.value.filter((b) => (b.group || 'main') === 'main'),
);
const moreButtons = computed(() =>
  permittedButtons.value.filter((b) => b.group === 'more'),
);

const pageTitle = computed(() => runtime.value?.title || '协议列表');

/** 列配置 ∩ 字段权限码 */
const tableColumns = computed(() =>
  filterColumnsByFieldRules(
    runtime.value?.columns || [],
    runtime.value?.fieldRules,
    accessStore.accessCodes,
  ),
);

const statusOptions = computed(() => {
  if (runtime.value?.statusIn?.length) return runtime.value.statusIn;
  return ['告知单', '待复核', '组长已复核', '签约已确认', '草稿'];
});

/**
 * 状态 Tag 样式
 * @param status 状态文案
 */
function statusType(status: string) {
  if (status.includes('确认') || status.includes('通过')) return 'success';
  if (status.includes('复核') || status.includes('审核') || status.includes('待'))
    return 'warning';
  if (status.includes('锁定')) return 'danger';
  return 'info';
}

/** 加载页面配置 / 本地场景 */
async function loadRuntime() {
  schemaLoading.value = true;
  try {
    runtime.value = await loadAgreeListRuntime(
      route.meta as Record<string, any>,
    );
  } finally {
    schemaLoading.value = false;
  }
}

/** 加载列表（同一接口 + scene） */
async function loadList() {
  if (!runtime.value?.scene) {
    ElMessage.error('缺少场景码，请检查菜单是否挂了页面配置');
    tableData.value = [];
    return;
  }
  loading.value = true;
  try {
    const res = await getAgreementList({
      scene: runtime.value.scene,
      keyword: keyword.value || undefined,
      statusValue: statusFilter.value || undefined,
      page: 1,
      pageSize: 100,
    });
    tableData.value = res?.items || [];
  } catch {
    const { MOCK_AGREEMENT_LIST } = await import('../mock-data');
    let list = [...MOCK_AGREEMENT_LIST];
    if (runtime.value.statusIn) {
      list = list.filter((r) =>
        runtime.value!.statusIn!.includes(r.statusValue),
      );
    }
    const kw = keyword.value.trim();
    if (kw) {
      list = list.filter((r) =>
        [r.agreementNo, r.compensatee, r.houseAddress].some((v) =>
          String(v).includes(kw),
        ),
      );
    }
    if (statusFilter.value) {
      list = list.filter((r) => r.statusValue === statusFilter.value);
    }
    tableData.value = list;
    ElMessage.warning('列表接口暂不可用，已使用本地场景过滤数据');
  } finally {
    loading.value = false;
  }
}

/**
 * 进入详情（带上来源菜单 path，供侧栏高亮）
 * @param row 行数据
 */
function goDetail(row: AgreementListItem) {
  router.push({
    name: 'BizAgreementDetail',
    params: { agreementNo: row.agreementNo },
    query: {
      id: row.id,
      compensatee: row.compensatee,
      houseAddress: row.houseAddress,
      mode: runtime.value?.detailMode || 'view',
      scene: runtime.value?.scene,
      schemaId: runtime.value?.schemaId || '',
      from: runtime.value?.title,
      // 当前列表菜单路径，详情页据此高亮侧栏（优先于写死的 activePath）
      activePath: route.path,
    },
  });
}

function onSelectionChange(rows: AgreementListItem[]) {
  selected.value = rows;
}

/**
 * 构建动作上下文
 * @param btn 当前点击的按钮（带 bind）
 */
function buildActionCtx(btn?: AgreeToolbarButton) {
  return {
    scene: runtime.value?.scene || '',
    selected: selected.value,
    tableData: tableData.value,
    reload: loadList,
    openDetail: goDetail,
    router,
    accessCodes: accessStore.accessCodes,
    buttonBind: btn?.bind,
  };
}

/**
 * 工具栏点击：统一走动作注册表 + 页面绑定
 * @param btn 已解析的按钮
 */
async function onToolbar(btn: AgreeToolbarButton) {
  if (!isAgreeActionRegistered(btn.code)) {
    ElMessage.warning(`动作「${btn.label}」未开通（未在动作库注册）`);
    return;
  }
  if (btn.disabled) {
    ElMessage.warning(`「${btn.label}」仅可见，无操作权限`);
    return;
  }
  await runAgreeAction(btn.code, buildActionCtx(btn));
}

/**
 * 下拉菜单 command
 * @param cmd 命令
 */
async function onMoreCommand(cmd: AgreeToolbarButton | string) {
  const code = typeof cmd === 'string' ? cmd : cmd.code;
  const btn =
    typeof cmd === 'string'
      ? (runtime.value?.buttons || []).find((b) => b.code === code)
      : cmd;
  if (!btn) {
    ElMessage.warning(`未知动作：${code}`);
    return;
  }
  await onToolbar(btn);
}

function onSearch() {
  loadList();
}

function onReset() {
  keyword.value = '';
  statusFilter.value = '';
  loadList();
}

/** meta 变化时：先加载配置再拉数 */
watch(
  metaKey,
  async () => {
    keyword.value = '';
    statusFilter.value = '';
    selected.value = [];
    await loadRuntime();
    await loadList();
  },
  { immediate: true },
);
</script>

<template>
  <Page auto-content-height :title="pageTitle">
    <div
      class="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-gray-200/80 bg-white p-4"
    >
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <div class="mb-1 text-xs text-gray-500">关键字</div>
          <ElInput
            v-model="keyword"
            clearable
            placeholder="协议编号 / 被补偿人 / 地址"
            class="w-64"
            @keyup.enter="onSearch"
          />
        </div>
        <div>
          <div class="mb-1 text-xs text-gray-500">状态</div>
          <ElSelect
            v-model="statusFilter"
            clearable
            placeholder="全部"
            class="w-40"
          >
            <ElOption
              v-for="s in statusOptions"
              :key="s"
              :label="s"
              :value="s"
            />
          </ElSelect>
        </div>
      </div>
      <ElSpace>
        <ElButton type="primary" @click="onSearch">查询</ElButton>
        <ElButton @click="onReset">重置</ElButton>
      </ElSpace>
    </div>

    <div
      v-loading="schemaLoading"
      class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200/80 bg-white px-4 py-3"
    >
      <ElSpace wrap>
        <ElButton
          v-for="btn in mainButtons"
          :key="btn.code"
          :type="btn.type === 'default' ? undefined : btn.type"
          :plain="btn.plain"
          :disabled="
            btn.disabled || !isAgreeActionRegistered(btn.code)
          "
          :title="
            btn.disabled
              ? '仅可见，无操作权限（Agree:View:*）'
              : undefined
          "
          @click="onToolbar(btn)"
        >
          {{ btn.label }}
          <span
            v-if="btn.disabled"
            class="ml-1 text-xs opacity-70"
          >
            (只读)
          </span>
        </ElButton>
        <ElDropdown v-if="moreButtons.length" @command="onMoreCommand">
          <ElButton>
            更多操作
            <span class="ml-1 text-xs">▼</span>
          </ElButton>
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem
                v-for="btn in moreButtons"
                :key="btn.code"
                :command="btn"
                :disabled="
                  btn.disabled || !isAgreeActionRegistered(btn.code)
                "
              >
                {{ btn.label }}
                <span
                  v-if="btn.disabled"
                  class="ml-1 text-xs text-gray-400"
                >
                  （只读）
                </span>
                <span
                  v-else-if="!isAgreeActionRegistered(btn.code)"
                  class="ml-1 text-xs text-gray-400"
                >
                  （未开通）
                </span>
              </ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <span
          v-if="!schemaLoading && !mainButtons.length && !moreButtons.length"
          class="text-xs text-amber-600"
        >
          当前场景无可用按钮（页面未勾选，或账号无对应权限码）
        </span>
      </ElSpace>
      <span class="text-xs text-gray-400">
        已选 {{ selected.length }} · 共 {{ tableData.length }} 条
      </span>
    </div>

    <div
      v-loading="loading || schemaLoading"
      class="overflow-hidden rounded-lg border border-gray-200/80 bg-white"
    >
      <ElTable
        :data="tableData"
        row-key="id"
        @selection-change="onSelectionChange"
      >
        <ElTableColumn type="selection" width="48" />
        <ElTableColumn
          v-for="col in tableColumns"
          :key="col.field"
          :prop="col.field"
          :label="col.title"
          :width="col.width"
          :min-width="col.minWidth || 100"
        >
          <template v-if="col.field === 'agreementNo'" #default="{ row }">
            <ElLink
              type="primary"
              :underline="'never'"
              @click="goDetail(row)"
            >
              {{ row.agreementNo }}
            </ElLink>
          </template>
          <template v-else-if="col.field === 'statusValue'" #default="{ row }">
            <ElTag size="small" :type="statusType(row.statusValue)">
              {{ row.statusValue }}
            </ElTag>
          </template>
          <template v-else-if="col.field === 'isSigned'" #default="{ row }">
            <ElTag
              size="small"
              effect="plain"
              :type="row.isSigned === '已签约' ? 'success' : 'info'"
            >
              {{ row.isSigned }}
            </ElTag>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>
  </Page>
</template>
