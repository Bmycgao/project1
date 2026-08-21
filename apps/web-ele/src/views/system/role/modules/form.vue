<script lang="ts" setup>
import type { PermResourceKind } from '../permission-tabs';

/**
 * 角色表单：基本信息 + 四类资源分 Tab 授权（菜单/按钮/字段/模块）
 * 按钮/字段/模块按菜单分组展示，支持关键字筛选；保存仍写入统一的 permissions: id[]
 */
import type { SystemRoleApi } from '#/api/system/role';

import { computed, nextTick, ref, watch } from 'vue';

import { Tree, useVbenDrawer } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  ElAlert,
  ElEmpty,
  ElInput,
  ElTabPane,
  ElTabs,
  ElTag,
} from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import { getMenuList } from '#/api/system/menu';
import { createRole, updateRole } from '#/api/system/role';
import { $t } from '#/locales';

import { useFormSchema } from '../data';
import {
  buildGroupedResourceTree,
  buildMenuResourceTree,
  collectPermIdsByKind,
  mergePermSelection,
  pickPermSelection,
} from '../permission-tabs';

const emits = defineEmits<{ success: [] }>();

const formData = ref<SystemRoleApi.SystemRole>();
const id = ref<string>();
/** 全量菜单树（含按钮） */
const permissions = ref<any[]>([]);
const loadingPermissions = ref(false);
/** 当前授权 Tab */
const activePermTab = ref<PermResourceKind>('menu');
/** 统一已选权限 ID（四 Tab 共用） */
const selectedPermIds = ref<Array<number | string>>([]);
/** 按钮/字段/模块关键字筛选 */
const resourceKeyword = ref('');

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
});

/** 菜单资源树 */
const menuTree = computed(() => buildMenuResourceTree(permissions.value));

/**
 * 构建当前 Tab 的分组资源树
 * @param kind 按钮/字段/模块
 */
function groupedTree(kind: Exclude<PermResourceKind, 'menu'>) {
  return buildGroupedResourceTree(
    permissions.value,
    kind,
    resourceKeyword.value,
  );
}

/** 按钮资源（按菜单分组） */
const buttonTree = computed(() => groupedTree('button'));
/** 字段资源（按菜单分组） */
const fieldTree = computed(() => groupedTree('field'));
/** 模块资源（按菜单分组） */
const moduleTree = computed(() => groupedTree('module'));

const menuIds = computed(() => collectPermIdsByKind(permissions.value, 'menu'));
const buttonIds = computed(() =>
  collectPermIdsByKind(permissions.value, 'button'),
);
const fieldIds = computed(() =>
  collectPermIdsByKind(permissions.value, 'field'),
);
const moduleIds = computed(() =>
  collectPermIdsByKind(permissions.value, 'module'),
);

/** 各 Tab 当前勾选（从总集投影） */
const menuChecked = computed(() =>
  pickPermSelection(selectedPermIds.value, menuIds.value),
);
const buttonChecked = computed(() =>
  pickPermSelection(selectedPermIds.value, buttonIds.value),
);
const fieldChecked = computed(() =>
  pickPermSelection(selectedPermIds.value, fieldIds.value),
);
const moduleChecked = computed(() =>
  pickPermSelection(selectedPermIds.value, moduleIds.value),
);

/**
 * 同步总选中到表单 permissions 字段
 */
function syncFormPermissions() {
  formApi.setFieldValue('permissions', [...selectedPermIds.value]);
}

/**
 * 某类 Tab 勾选变化
 * @param kind 资源类型
 * @param kindIds 该类全部 id
 * @param checked 该类勾选结果
 */
function onKindCheck(
  kind: PermResourceKind,
  kindIds: Set<string>,
  checked: Array<number | string> | number | string | undefined,
) {
  const list = Array.isArray(checked)
    ? checked
    : checked === undefined || checked === null
      ? []
      : [checked];
  selectedPermIds.value = mergePermSelection(
    selectedPermIds.value,
    kindIds,
    list,
  );
  syncFormPermissions();
  void kind;
}

/** 切换 Tab 时清空筛选，避免跨 Tab 残留关键字 */
watch(activePermTab, () => {
  resourceKeyword.value = '';
});

/** 加载菜单树作为授权数据源 */
async function loadPermissions() {
  loadingPermissions.value = true;
  try {
    permissions.value = await getMenuList();
  } finally {
    loadingPermissions.value = false;
  }
}

const [Drawer, drawerApi] = useVbenDrawer({
  class: 'w-[920px]',
  /** 保存角色及菜单授权 */
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    syncFormPermissions();
    const values = await formApi.getValues();
    values.permissions = [...selectedPermIds.value];
    drawerApi.lock();
    try {
      await (id.value
        ? updateRole(id.value, values as any)
        : createRole(values as any));
      emits('success');
      drawerApi.close();
    } catch {
      drawerApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    const data = drawerApi.getData<SystemRoleApi.SystemRole>();
    formApi.reset();
    formData.value = data;
    id.value = data?.id;
    activePermTab.value = 'menu';
    resourceKeyword.value = '';
    if (permissions.value.length === 0) {
      await loadPermissions();
    }
    await nextTick();
    selectedPermIds.value = Array.isArray(data?.permissions)
      ? [...data.permissions]
      : [];
    if (data?.id) {
      await formApi.setValues({
        ...data,
        permissions: [...selectedPermIds.value],
      });
    } else {
      syncFormPermissions();
    }
  },
});

const getDrawerTitle = computed(() =>
  formData.value?.id
    ? $t('common.edit', [$t('system.role.name')])
    : $t('common.create', [$t('system.role.name')]),
);
</script>

<template>
  <Drawer :title="getDrawerTitle">
    <Form>
      <template #permissions>
        <div v-loading="loadingPermissions" class="w-full min-h-48">
          <ElAlert
            class="mb-3"
            type="info"
            :closable="false"
            :title="$t('system.role.permTabsHint')"
          />
          <ElTabs v-model="activePermTab" type="border-card" class="w-full">
            <ElTabPane name="menu">
              <template #label>
                <span class="inline-flex items-center gap-1">
                  {{ $t('system.role.permTabMenu') }}
                  <ElTag size="small" type="info">
                    {{ menuChecked.length }}
                  </ElTag>
                </span>
              </template>
              <!-- 菜单：父子联动，勾「系统管理」即全选其下子菜单 -->
              <Tree
                :tree-data="menuTree"
                multiple
                bordered
                :check-strictly="false"
                :default-expanded-level="2"
                :model-value="menuChecked"
                value-field="id"
                label-field="meta.title"
                icon-field="meta.icon"
                @update:model-value="
                  (v: Array<number | string> | number | string | undefined) =>
                    onKindCheck('menu', menuIds, v)
                "
              >
                <template #node="{ value }">
                  <IconifyIcon
                    v-if="value.meta?.icon"
                    :icon="value.meta.icon"
                    class="mr-1"
                  />
                  {{ $t(value.meta?.title || value.name) }}
                </template>
              </Tree>
            </ElTabPane>

            <ElTabPane name="button">
              <template #label>
                <span class="inline-flex items-center gap-1">
                  {{ $t('system.role.permTabButton') }}
                  <ElTag size="small" type="info">
                    {{ buttonChecked.length }}
                  </ElTag>
                </span>
              </template>
              <p class="mb-2 text-xs text-gray-500">
                {{ $t('system.role.permTabButtonTip') }}
              </p>
              <ElInput
                v-model="resourceKeyword"
                clearable
                class="mb-2"
                :placeholder="$t('system.role.permSearchPlaceholder')"
              />
              <ElEmpty
                v-if="buttonTree.length === 0"
                :description="$t('system.role.permEmptyFilter')"
                :image-size="64"
              />
              <Tree
                v-else
                :tree-data="buttonTree"
                multiple
                bordered
                check-strictly
                :auto-check-parent="false"
                :default-expanded-level="2"
                :model-value="buttonChecked"
                value-field="id"
                label-field="meta.title"
                disabled-field="disabled"
                @update:model-value="
                  (v: Array<number | string> | number | string | undefined) =>
                    onKindCheck('button', buttonIds, v)
                "
              >
                <template #node="{ value }">
                  <div
                    v-if="value.disabled"
                    class="text-foreground/80 flex min-w-0 items-center gap-2 font-medium"
                  >
                    <span class="truncate">{{ value.meta?.title }}</span>
                    <ElTag size="small" type="info">
                      {{ value.meta?.leafCount || 0 }}
                    </ElTag>
                  </div>
                  <div v-else class="flex min-w-0 flex-col leading-tight">
                    <span class="inline-flex items-center gap-1.5">
                      <span>{{ value.meta?.title || value.name }}</span>
                      <ElTag
                        v-if="value.meta?.viewOnly"
                        size="small"
                        type="warning"
                      >
                        {{ $t('system.role.permViewOnly') }}
                      </ElTag>
                    </span>
                    <span
                      v-if="value.meta?.authCode || value.authCode"
                      class="text-muted-foreground font-mono text-[11px]"
                    >
                      {{ value.meta?.authCode || value.authCode }}
                    </span>
                  </div>
                </template>
              </Tree>
            </ElTabPane>

            <ElTabPane name="field">
              <template #label>
                <span class="inline-flex items-center gap-1">
                  {{ $t('system.role.permTabField') }}
                  <ElTag size="small" type="info">
                    {{ fieldChecked.length }}
                  </ElTag>
                </span>
              </template>
              <p class="mb-2 text-xs text-gray-500">
                {{ $t('system.role.permTabFieldTip') }}
              </p>
              <ElInput
                v-model="resourceKeyword"
                clearable
                class="mb-2"
                :placeholder="$t('system.role.permSearchPlaceholder')"
              />
              <ElEmpty
                v-if="fieldTree.length === 0"
                :description="$t('system.role.permEmptyFilter')"
                :image-size="64"
              />
              <Tree
                v-else
                :tree-data="fieldTree"
                multiple
                bordered
                check-strictly
                :auto-check-parent="false"
                :default-expanded-level="2"
                :model-value="fieldChecked"
                value-field="id"
                label-field="meta.title"
                disabled-field="disabled"
                @update:model-value="
                  (v: Array<number | string> | number | string | undefined) =>
                    onKindCheck('field', fieldIds, v)
                "
              >
                <template #node="{ value }">
                  <div
                    v-if="value.disabled"
                    class="text-foreground/80 flex min-w-0 items-center gap-2 font-medium"
                  >
                    <span class="truncate">{{ value.meta?.title }}</span>
                    <ElTag size="small" type="info">
                      {{ value.meta?.leafCount || 0 }}
                    </ElTag>
                  </div>
                  <div v-else class="flex min-w-0 flex-col leading-tight">
                    <span>{{ value.meta?.title || value.name }}</span>
                    <span
                      v-if="value.meta?.authCode || value.authCode"
                      class="text-muted-foreground font-mono text-[11px]"
                    >
                      {{ value.meta?.authCode || value.authCode }}
                    </span>
                  </div>
                </template>
              </Tree>
            </ElTabPane>

            <ElTabPane name="module">
              <template #label>
                <span class="inline-flex items-center gap-1">
                  {{ $t('system.role.permTabModule') }}
                  <ElTag size="small" type="info">
                    {{ moduleChecked.length }}
                  </ElTag>
                </span>
              </template>
              <p class="mb-2 text-xs text-gray-500">
                {{ $t('system.role.permTabModuleTip') }}
              </p>
              <ElInput
                v-model="resourceKeyword"
                clearable
                class="mb-2"
                :placeholder="$t('system.role.permSearchPlaceholder')"
              />
              <ElEmpty
                v-if="moduleTree.length === 0"
                :description="$t('system.role.permEmptyFilter')"
                :image-size="64"
              />
              <Tree
                v-else
                :tree-data="moduleTree"
                multiple
                bordered
                check-strictly
                :auto-check-parent="false"
                :default-expanded-level="2"
                :model-value="moduleChecked"
                value-field="id"
                label-field="meta.title"
                disabled-field="disabled"
                @update:model-value="
                  (v: Array<number | string> | number | string | undefined) =>
                    onKindCheck('module', moduleIds, v)
                "
              >
                <template #node="{ value }">
                  <div
                    v-if="value.disabled"
                    class="text-foreground/80 flex min-w-0 items-center gap-2 font-medium"
                  >
                    <span class="truncate">{{ value.meta?.title }}</span>
                    <ElTag size="small" type="info">
                      {{ value.meta?.leafCount || 0 }}
                    </ElTag>
                  </div>
                  <div v-else class="flex min-w-0 flex-col leading-tight">
                    <span>{{ value.meta?.title || value.name }}</span>
                    <span
                      v-if="value.meta?.authCode || value.authCode"
                      class="text-muted-foreground font-mono text-[11px]"
                    >
                      {{ value.meta?.authCode || value.authCode }}
                    </span>
                  </div>
                </template>
              </Tree>
            </ElTabPane>
          </ElTabs>
        </div>
      </template>
    </Form>
  </Drawer>
</template>
