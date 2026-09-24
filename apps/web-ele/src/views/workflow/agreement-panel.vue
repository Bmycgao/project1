<script lang="ts" setup>
/**
 * 流程办理页协议正文：基础信息 + 房屋/补偿/奖励/人口
 * @param detail 绑定的协议详情
 * @param editable 当前节点是否允许编辑（填报可改，审批只读）
 * @param fieldAccess 节点字段权限，进一步收紧显隐/只读
 */
import type { AgreementDetail } from '#/views/biz/agreement/types';
import type { Ref } from 'vue';
import { computed, provide, ref } from 'vue';
import { ElTabPane, ElTabs } from 'element-plus';
import { DEFAULT_AGREE_FIELD_RULES } from '#/views/biz/agreement/access/field-access';
import {
  AGREE_FIELD_RULES_KEY,
  useProvideAgreeDetailEditable,
} from '#/views/biz/agreement/access/use-field-access';
import {
  buildDefaultBasicModuleInner,
  buildDefaultCompensationModuleInner,
  buildDefaultHousesModuleInner,
  buildDefaultPopulationModuleInner,
  buildDefaultRewardsModuleInner,
} from '#/views/biz/agreement/config/module-inner-config';
import BasicModule from '#/views/biz/agreement/modules/basic-module.vue';
import CompensationModule from '#/views/biz/agreement/modules/compensation-module.vue';
import HousesModule from '#/views/biz/agreement/modules/houses-module.vue';
import PopulationModule from '#/views/biz/agreement/modules/population-module.vue';
import RewardsModule from '#/views/biz/agreement/modules/rewards-module.vue';
import { cloneJson } from '#/views/biz/agreement/clone';
import { agreeRulesFromWorkflowAccess } from './agree-rules';

const props = defineProps<{
  detail: AgreementDetail;
  editable: boolean;
  fieldAccess?: Record<string, 'edit' | 'readonly' | 'hidden'>;
}>();
const emit = defineEmits<{ dirty: [] }>();

const pageEditable = computed(() => props.editable);
useProvideAgreeDetailEditable(pageEditable as unknown as Ref<boolean>);

const fieldRules = computed(() => [
  ...DEFAULT_AGREE_FIELD_RULES,
  ...agreeRulesFromWorkflowAccess(props.fieldAccess),
]);
provide(AGREE_FIELD_RULES_KEY, fieldRules);

const basicInner = ref(buildDefaultBasicModuleInner());
const housesInner = ref(buildDefaultHousesModuleInner());
const compensationInner = ref(buildDefaultCompensationModuleInner());
const rewardsInner = ref(buildDefaultRewardsModuleInner());
const populationInner = ref(buildDefaultPopulationModuleInner());
provide('agreeModuleInnerBasic', basicInner);
provide('agreeFcRules', ref({}));
provide('agreeModuleInnerHouses', housesInner);
provide('agreeModuleInnerCompensation', compensationInner);
provide('agreeModuleInnerRewards', rewardsInner);
provide('agreeModuleInnerPopulation', populationInner);

const basicRef = ref<InstanceType<typeof BasicModule>>();
const housesRef = ref<InstanceType<typeof HousesModule>>();
const compensationRef = ref<InstanceType<typeof CompensationModule>>();
const rewardsRef = ref<InstanceType<typeof RewardsModule>>();
const populationRef = ref<InstanceType<typeof PopulationModule>>();
const tab = ref('houses');

function markDirty() {
  emit('dirty');
}

/** 校验各模块必填 */
async function validate() {
  const parts = [
    basicRef.value,
    housesRef.value,
    compensationRef.value,
    rewardsRef.value,
    populationRef.value,
  ];
  for (const part of parts) {
    if (part && !(await part.validate())) return false;
  }
  return true;
}

/** 收集办理页上的协议整单，供回写 */
async function collect(): Promise<AgreementDetail> {
  const basic = await Promise.resolve(basicRef.value?.getValues());
  const houses = await Promise.resolve(housesRef.value?.getValues());
  const compensation = await Promise.resolve(
    compensationRef.value?.getValues(),
  );
  const rewards = await Promise.resolve(rewardsRef.value?.getValues());
  const population = await Promise.resolve(populationRef.value?.getValues());
  return {
    ...cloneJson(props.detail),
    ...basic,
    ...houses,
    ...compensation,
    ...rewards,
    ...population,
  } as AgreementDetail;
}

defineExpose({ validate, collect });
</script>

<template>
  <div class="agree-panel">
    <section class="agree-block">
      <div class="agree-block-head">基础信息</div>
      <BasicModule
        ref="basicRef"
        :detail="detail"
        :editable="editable"
        @dirty="markDirty"
      />
    </section>
    <ElTabs v-model="tab" class="agree-tabs">
      <ElTabPane label="房屋信息" name="houses">
        <HousesModule
          ref="housesRef"
          :detail="detail"
          :can-edit="editable"
          @dirty="markDirty"
        />
      </ElTabPane>
      <ElTabPane label="补偿安置" name="compensation">
        <CompensationModule
          ref="compensationRef"
          :detail="detail"
          :can-edit="editable"
          @dirty="markDirty"
        />
      </ElTabPane>
      <ElTabPane label="奖励补贴" name="rewards">
        <RewardsModule
          ref="rewardsRef"
          :detail="detail"
          :can-edit="editable"
          @dirty="markDirty"
        />
      </ElTabPane>
      <ElTabPane label="人口信息" name="population">
        <PopulationModule
          ref="populationRef"
          :detail="detail"
          :editable="editable"
          @dirty="markDirty"
        />
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<style scoped>
.agree-block {
  margin-bottom: 16px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.agree-block-head {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  background: var(--el-fill-color-light);
}

.agree-block :deep(.agree-kv-form) {
  padding: 12px 14px;
}

.agree-tabs {
  margin-top: 4px;
}
</style>
