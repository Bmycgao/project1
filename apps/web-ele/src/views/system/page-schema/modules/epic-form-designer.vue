<script lang="ts" setup>
/**
 * Epic 表单设计器弹层：编辑基础信息等表单的 pageSchema
 * 保存时通过 @save / 底部按钮写出 JSON
 */
import type { EpicPageSchema } from '../../../biz/agreement/epic/types';

import { nextTick, ref, watch } from 'vue';

import { ElButton, ElDrawer, ElMessage } from 'element-plus';
import { EDesigner } from 'epic-designer';

import { buildDefaultBasicEpicPageSchema } from '../../../biz/agreement/epic/basic-page-schema';
import {
  cloneEpicPageSchema,
  isEpicPageSchema,
} from '../../../biz/agreement/epic/types';

const props = withDefaults(
  defineProps<{
    /** 抽屉标题 */
    title?: string;
  }>(),
  { title: 'Epic 表单设计 · 基础信息' },
);
const open = defineModel<boolean>('open', { default: false });
const schemaModel = defineModel<EpicPageSchema | null>('schema', {
  default: null,
});

const designerRef = ref<null | {
  getData: () => EpicPageSchema;
  setData: (schema: EpicPageSchema) => void;
}>(null);

/** 设计器初始 schema（打开时注入） */
const defaultSchema = ref<EpicPageSchema>(buildDefaultBasicEpicPageSchema());

watch(open, async (visible) => {
  if (!visible) return;
  const source = isEpicPageSchema(schemaModel.value)
    ? cloneEpicPageSchema(schemaModel.value)
    : buildDefaultBasicEpicPageSchema();
  defaultSchema.value = source;
  await nextTick();
  designerRef.value?.setData?.(cloneEpicPageSchema(source));
});

/**
 * 设计器点保存
 * @param data 当前 pageSchema
 */
function onDesignerSave(data: unknown) {
  if (!isEpicPageSchema(data)) {
    ElMessage.warning('尚未获取到有效表单结构');
    return;
  }
  schemaModel.value = cloneEpicPageSchema(data);
  ElMessage.success('表单结构已写入本场景（请再点页面配置「确认」落库）');
  open.value = false;
}

/** 底部确认：主动取 getData */
function confirmFromFooter() {
  const data = designerRef.value?.getData?.();
  if (!isEpicPageSchema(data)) {
    ElMessage.warning('尚未获取到有效表单结构');
    return;
  }
  onDesignerSave(data);
}

function onCancel() {
  open.value = false;
}
</script>

<template>
  <ElDrawer
    v-model="open"
    :title="title"
    size="96%"
    destroy-on-close
    append-to-body
    class="epic-form-designer-drawer"
  >
    <div class="epic-designer-wrap">
      <EDesigner
        v-if="open"
        ref="designerRef"
        form-mode
        :title="title"
        :default-schema="defaultSchema as never"
        @save="onDesignerSave"
      />
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <ElButton @click="onCancel">取消</ElButton>
        <ElButton type="primary" @click="confirmFromFooter">
          保存到本场景
        </ElButton>
      </div>
    </template>
  </ElDrawer>
</template>

<style scoped>
.epic-designer-wrap {
  height: calc(100vh - 160px);
  min-height: 480px;
  overflow: hidden;
}

.epic-designer-wrap :deep(.ep-designer-main),
.epic-designer-wrap :deep(.epic-designer) {
  height: 100%;
}
</style>
