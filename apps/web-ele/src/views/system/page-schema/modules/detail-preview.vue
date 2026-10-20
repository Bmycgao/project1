<script setup lang="ts">
import type { AgreeFieldRule } from '../../../biz/agreement/access/field-access';
import type { AgreeModuleMount } from '../../../biz/agreement/access/module-access';
import type { ModuleInnerConfig } from '../../../biz/agreement/config/module-inner-config';
import type { FcRuleMap } from '../../../biz/agreement/fc/types';

import { computed, provide, ref } from 'vue';

import { resolveAgreeModulesForPage } from '../../../biz/agreement/access/module-access';
import {
  AGREE_FIELD_RULES_KEY,
  useProvideAgreeDetailEditable,
} from '../../../biz/agreement/access/use-field-access';
import DetailLayout from '../../../biz/agreement/components/detail-layout.vue';
import DetailModule from '../../../biz/agreement/components/detail-module.vue';
import { buildAgreementDetail } from '../../../biz/agreement/data/mock-data';
const props = defineProps<{
  fieldRules?: AgreeFieldRule[];
  inners: Record<string, ModuleInnerConfig>;
  modules: AgreeModuleMount[];
  rules: FcRuleMap;
}>();
const detail = buildAgreementDetail('预览-001');
const modules = computed(() =>
  resolveAgreeModulesForPage(props.modules, ['Agree:*']),
);
provide(
  AGREE_FIELD_RULES_KEY,
  computed(() => props.fieldRules || []),
);
provide(
  'agreeFcRules',
  computed(() => props.rules),
);
for (const [key, name] of Object.entries({
  basic: 'Basic',
  houses: 'Houses',
  compensation: 'Compensation',
  rewards: 'Rewards',
  population: 'Population',
})) {
  provide(
    `agreeModuleInner${name}`,
    computed(() => props.inners[key]),
  );
}
provide(
  'agreeModuleInnerCustom',
  computed(() => props.inners),
);
useProvideAgreeDetailEditable(ref(false));
</script>
<template>
  <div class="mb-4 text-sm text-gray-500">
    示例数据 · 只读预览 · 模块布局与正式详情共用，字段按当前账号权限展示
  </div>
  <DetailLayout :modules="modules">
    <template #default="{ item }">
      <DetailModule :item="item" :detail="detail" :editable="false" />
    </template>
  </DetailLayout>
</template>
