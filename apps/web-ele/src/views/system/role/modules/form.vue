<script lang="ts" setup>
/**
 * 角色表单：基本信息 + 四类资源分 Tab 授权（菜单/按钮/字段/模块）
 * 保存仍写入统一的 permissions: id[]
 */
import type { SystemRoleApi } from '#/api/system/role';

import { computed, nextTick, ref } from 'vue';

import { Tree, useVbenDrawer } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { ElAlert, ElTabPane, ElTabs, ElTag } from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import { getMenuList } from '#/api/system/menu';
import { createRole, updateRole } from '#/api/system/role';
import { $t } from '#/locales';

import { useFormSchema } from '../data';
import {
  buildFlatResourceTree,
  buildMenuResourceTree,
  collectPermIdsByKind,
  mergePermSelection,
  pickPermSelection,
  type PermResourceKind,
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

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
});

/** 菜单资源树 */
const menuTree = computed(() => buildMenuResourceTree(permissions.value));
/** 按钮资源（扁平） */
const buttonTree = computed(() =>
  buildFlatResourceTree(permissions.value, 'button'),
);
/** 字段资源（扁平） */
const fieldTree = computed(() =>
  buildFlatResourceTree(permissions.value, 'field'),
);
/** 模块资源（扁平） */
const moduleTree = computed(() =>
  buildFlatResourceTree(permissions.value, 'module'),
);

const menuIds = computed(() =>
  collectPermIdsByKind(permissions.value, 'menu'),
);
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
  class: 'w-[820px]',
  /** 保存角色及菜单授权 */
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    // 以分 Tab 汇总结果为准写回
    syncFormPermissions();
    const values = await formApi.getValues();
    values.permissions = [...selectedPermIds.value];
    drawerApi.lock();
    try {
      if (id.value) {
        await updateRole(id.value, values as any);
      } else {
        await createRole(values as any);
      }
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
              <Tree
                :tree-data="menuTree"
                multiple
                bordered
                check-strictly
                :default-expanded-level="2"
                :model-value="menuChecked"
                value-field="id"
                label-field="meta.title"
                icon-field="meta.icon"
                @update:model-value="
                  (v) => onKindCheck('menu', menuIds, v as any)
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
              <Tree
                :tree-data="buttonTree"
                multiple
                bordered
                check-strictly
                :default-expanded-level="1"
                :model-value="buttonChecked"
                value-field="id"
                label-field="meta.title"
                @update:model-value="
                  (v) => onKindCheck('button', buttonIds, v as any)
                "
              >
                <template #node="{ value }">
                  {{ value.meta?.title || value.name }}
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
              <Tree
                :tree-data="fieldTree"
                multiple
                bordered
                check-strictly
                :default-expanded-level="1"
                :model-value="fieldChecked"
                value-field="id"
                label-field="meta.title"
                @update:model-value="
                  (v) => onKindCheck('field', fieldIds, v as any)
                "
              >
                <template #node="{ value }">
                  {{ value.meta?.title || value.name }}
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
              <Tree
                :tree-data="moduleTree"
                multiple
                bordered
                check-strictly
                :default-expanded-level="1"
                :model-value="moduleChecked"
                value-field="id"
                label-field="meta.title"
                @update:model-value="
                  (v) => onKindCheck('module', moduleIds, v as any)
                "
              >
                <template #node="{ value }">
                  {{ value.meta?.title || value.name }}
                </template>
              </Tree>
            </ElTabPane>
          </ElTabs>
        </div>
      </template>
    </Form>
  </Drawer>
</template>
