<script lang="ts" setup>
/**
 * 菜单新增/编辑：方案 A
 * - 组件下拉：动态列表 / 协议场景列表
 * - 动态列表 → 选实体页面配置
 * - 协议列表 → 选协议场景，提交时自动写入 meta.sceneId
 */
import type { SystemMenuApi } from '#/api/system/menu';

import { computed, nextTick, ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';

import { useVbenForm } from '#/adapter/form';
import { getPageSchemaList } from '#/api/system';
import { createMenu, updateMenu } from '#/api/system/menu';
import { $t } from '#/locales';

import {
  getMenuComponentOptions,
  isAgreeListComponent,
  isDynamicListComponent,
  useFormSchema,
} from '../data';

/** created=true 时列表页应刷新动态侧栏 */
const emits = defineEmits<{
  success: [payload?: { created?: boolean }];
}>();

const formData = ref<SystemMenuApi.SystemMenu>();
const id = ref<string>();
/** 抽屉传入的上级 id（新增下级时带入，防止表单未回填丢失） */
const parentId = ref<string | number>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
});

/**
 * 提交前整理 meta：协议场景写入 schemaId + sceneId；动态列表清掉 scene 相关
 * @param values 表单值
 */
async function normalizeMenuPayload(values: Record<string, any>) {
  const component = String(values.component || '').trim();
  const meta = { ...(values.meta || {}) };

  if (isAgreeListComponent(component)) {
    const sceneSchemaId = meta.sceneSchemaId || meta.schemaId;
    if (sceneSchemaId) {
      meta.schemaId = sceneSchemaId;
      const list = await getPageSchemaList();
      const sceneSchema = (list || []).find(
        (item) => String(item.id) === String(sceneSchemaId),
      );
      if (sceneSchema?.scene) {
        meta.sceneId = sceneSchema.scene;
      }
    }
    // 表单临时字段不落库
    delete meta.sceneSchemaId;
  } else if (isDynamicListComponent(component)) {
    delete meta.sceneId;
    delete meta.sceneSchemaId;
  } else {
    delete meta.sceneSchemaId;
  }

  return {
    ...values,
    component: component || undefined,
    meta,
    pid: values.pid ?? parentId.value,
  };
}

/**
 * 编辑回填时：若 component 不在预设选项中，临时追加，避免下拉空白
 * @param component 已有组件路径
 */
function ensureComponentOption(component?: string) {
  const path = String(component || '').trim();
  if (!path) return;
  const options = getMenuComponentOptions();
  if (options.some((o) => o.value === path)) return;
  formApi.updateSchema([
    {
      fieldName: 'component',
      componentProps: {
        allowClear: true,
        class: 'w-full',
        options: [...options, { label: `自定义：${path}`, value: path }],
        placeholder: '请选择列表模板页',
      },
    },
  ]);
}

const [Drawer, drawerApi] = useVbenDrawer({
  /** 提交菜单创建/更新 */
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = await formApi.getValues();
    const payload = await normalizeMenuPayload(values);

    // 协议列表必须选场景
    if (
      isAgreeListComponent(payload.component) &&
      !payload.meta?.schemaId
    ) {
      const { ElMessage } = await import('element-plus');
      ElMessage.warning('请选择协议场景（决定按钮与数据范围）');
      return;
    }    const isCreate = !id.value;
    drawerApi.lock();
    try {
      if (id.value) {
        await updateMenu(id.value, payload as any);
      } else {
        await createMenu(payload as any);
      }
      emits('success', { created: isCreate });
      drawerApi.close();
    } catch {
      drawerApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) {
      parentId.value = undefined;
      return;
    }
    const data = drawerApi.getData<SystemMenuApi.SystemMenu>();
    formApi.reset();
    formData.value = data;
    id.value = data?.id;
    parentId.value = data?.pid;
    await nextTick();
    if (data) {
      ensureComponentOption(data.component);
      // 编辑协议菜单时：用 schemaId 回填场景下拉
      const patch = { ...data } as Record<string, any>;
      if (
        isAgreeListComponent(data.component) &&
        data.meta?.schemaId
      ) {
        patch.meta = {
          ...data.meta,
          sceneSchemaId: data.meta.schemaId,
        };
      }
      formApi.setValues(patch);
    }
  },
});

const getDrawerTitle = computed(() =>
  formData.value?.id
    ? $t('common.edit', [$t('system.menu.name')])
    : $t('common.create', [$t('system.menu.name')]),
);
</script>

<template>
  <Drawer :title="getDrawerTitle">
    <Form />
  </Drawer>
</template>
