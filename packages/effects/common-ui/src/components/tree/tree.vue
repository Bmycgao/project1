<script setup lang="ts">
import type { TreeProps } from '@vben-core/shadcn-ui';

import { Inbox } from '@vben/icons';
import { $t } from '@vben/locales';

import { treePropsDefaults, VbenTree } from '@vben-core/shadcn-ui';

const props = withDefaults(defineProps<TreeProps>(), treePropsDefaults());

/** 透传选中 / 展开事件（多根节点时 attrs 不会自动落到 VbenTree） */
const emit = defineEmits<{
  expand: [value: any];
  select: [value: any];
}>();
</script>

<template>
  <VbenTree
    v-if="props.treeData?.length > 0"
    v-bind="props"
    @expand="(v) => emit('expand', v)"
    @select="(v) => emit('select', v)"
  >
    <template v-for="(_, key) in $slots" :key="key" #[key]="slotProps">
      <slot :name="key" v-bind="slotProps"> </slot>
    </template>
  </VbenTree>
  <div
    v-else
    class="flex-col-center cursor-pointer rounded-lg border p-10 text-sm font-medium text-muted-foreground"
  >
    <Inbox class="size-10" />
    <div class="mt-1">{{ $t('common.noData') }}</div>
  </div>
</template>
