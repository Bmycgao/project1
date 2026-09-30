<script setup lang="ts">
import type { AgreeModuleLayoutItem } from '../access/module-access';
import type { AgreementDetail } from '../types';

import { computed, ref } from 'vue';

import BasicModule from '../modules/basic-module.vue';
import CompensationModule from '../modules/compensation-module.vue';
import CustomFormModule from '../modules/custom-form-module.vue';
import CustomTableModule from '../modules/custom-table-module.vue';
import HousesModule from '../modules/houses-module.vue';
import PopulationModule from '../modules/population-module.vue';
import RewardsModule from '../modules/rewards-module.vue';

const props = defineProps<{
  detail: AgreementDetail;
  editable: boolean;
  item: AgreeModuleLayoutItem;
}>();
const emit = defineEmits<{ dirty: [] }>();
const registry = {
  basic: BasicModule,
  houses: HousesModule,
  population: PopulationModule,
  compensation: CompensationModule,
  rewards: RewardsModule,
};
const component = computed(
  () =>
    registry[props.item.key as keyof typeof registry] ||
    (props.item.widgetKind === 'table' ? CustomTableModule : CustomFormModule),
);
const api = ref<{ getValues: () => any; validate: () => Promise<boolean> }>();
defineExpose({
  getValues: () => api.value?.getValues(),
  validate: async () => (await api.value?.validate()) ?? false,
});
</script>
<template>
  <component
    :is="component"
    ref="api"
    :detail="detail"
    :module-key="item.key"
    :label="item.label"
    :editable="editable"
    :can-edit="editable"
    @dirty="emit('dirty')"
  />
</template>
