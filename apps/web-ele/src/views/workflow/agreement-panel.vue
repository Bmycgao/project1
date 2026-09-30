<script setup lang="ts">
import type { WorkflowDetailView } from '../../../../shared/workflow-runtime';

import type { AgreementDetail } from '#/views/biz/agreement/types';

import { computed, provide, ref } from 'vue';

import { DEFAULT_AGREE_FIELD_RULES } from '#/views/biz/agreement/access/field-access';
import {
  buildAgreeModuleMounts,
  resolveAgreeModulesForPage,
} from '#/views/biz/agreement/access/module-access';
import {
  AGREE_FIELD_RULES_KEY,
  useProvideAgreeDetailEditable,
} from '#/views/biz/agreement/access/use-field-access';
import DetailLayout from '#/views/biz/agreement/components/detail-layout.vue';
import DetailModule from '#/views/biz/agreement/components/detail-module.vue';
import {
  buildDefaultBasicModuleInner,
  buildDefaultCompensationModuleInner,
  buildDefaultHousesModuleInner,
  buildDefaultPopulationModuleInner,
  buildDefaultRewardsModuleInner,
} from '#/views/biz/agreement/config/module-inner-config';

import { projectWorkflowAgreement } from '../../../../shared/workflow-detail';
import { agreeRulesFromWorkflowAccess } from './agree-rules';

const props = defineProps<{
  detail: AgreementDetail;
  detailView?: WorkflowDetailView;
  editable: boolean;
  fieldAccess?: Record<string, 'edit' | 'hidden' | 'readonly'>;
}>();
const emit = defineEmits<{ dirty: [] }>();
const pageEditable = computed(() => props.editable);
useProvideAgreeDetailEditable(pageEditable);
provide(
  AGREE_FIELD_RULES_KEY,
  computed(() =>
    props.detailView
      ? []
      : [
          ...agreeRulesFromWorkflowAccess(props.fieldAccess),
          ...DEFAULT_AGREE_FIELD_RULES,
        ],
  ),
);
provide('agreeModuleInnerBasic', ref(buildDefaultBasicModuleInner()));
provide('agreeModuleInnerHouses', ref(buildDefaultHousesModuleInner()));
provide(
  'agreeModuleInnerCompensation',
  ref(buildDefaultCompensationModuleInner()),
);
provide('agreeModuleInnerRewards', ref(buildDefaultRewardsModuleInner()));
provide('agreeModuleInnerPopulation', ref(buildDefaultPopulationModuleInner()));
provide('agreeModuleInnerCustom', ref({}));
provide(
  'agreeFcRules',
  computed(() =>
    Object.fromEntries(
      (props.detailView?.modules || []).map((m) => [m.key, m.rules]),
    ),
  ),
);
const modules = computed(() =>
  props.detailView
    ? props.detailView.modules.map((m) => ({
        ...m,
        authCode: m.authCode || '',
        desc: '',
      }))
    : resolveAgreeModulesForPage(buildAgreeModuleMounts(), ['Agree:*']),
);
const apis = new Map<string, InstanceType<typeof DetailModule>>();
const layout = ref<InstanceType<typeof DetailLayout>>();
function bindApi(key: string, value: any) {
  if (value) apis.set(key, value);
  else apis.delete(key);
}
function canEdit(key: string) {
  return (
    props.editable &&
    (!props.detailView ||
      props.detailView.modules.some((m) => m.key === key && !m.readonly))
  );
}
async function validate() {
  for (const module of modules.value) {
    if (!canEdit(module.key)) continue;
    if (!(await apis.get(module.key)?.validate())) {
      await layout.value?.focusModule(module.key);
      return false;
    }
  }
  return true;
}
async function collect(): Promise<Record<string, any>> {
  const draft: Record<string, any> = props.detailView
    ? {}
    : { ...props.detail };
  for (const module of modules.value) {
    if (!canEdit(module.key)) continue;
    const values = await apis.get(module.key)?.getValues();
    if (!values) continue;
    const { extraForms, extraTables, ...parts } = values;
    Object.assign(draft, parts);
    if (extraForms) draft.extraForms = { ...draft.extraForms, ...extraForms };
    if (extraTables)
      draft.extraTables = { ...draft.extraTables, ...extraTables };
  }
  return props.detailView
    ? projectWorkflowAgreement(draft, props.detailView, true)
    : draft;
}
defineExpose({ validate, collect });
</script>
<template>
  <DetailLayout ref="layout" :modules="modules">
    <template #actions="{ item }">
<span class="text-xs text-gray-400">{{
        canEdit(item.key) ? '本节点可编辑' : '只读'
      }}</span>
</template>
    <template #default="{ item }">
      <DetailModule
        :ref="(el) => bindApi(item.key, el)"
        :item="item"
        :detail="detail"
        :editable="canEdit(item.key)"
        @dirty="emit('dirty')"
      />
    </template>
  </DetailLayout>
</template>
