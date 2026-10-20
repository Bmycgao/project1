<script setup lang="ts">
import { ref } from 'vue';
import NodeForm from '../../src/views/workflow/node-form.vue';
import type {
  RuntimeField,
  RuntimeForm,
} from '../../../shared/workflow-runtime';
const form = ref<InstanceType<typeof NodeForm>>();
const model = ref<Record<string, unknown>>({ time: '09:30:00', items: [1] });
const locked = ref(false);
const status = ref('尚未校验');
const fields: RuntimeField[] = [
  {
    key: 'time',
    label: '核查时间',
    type: 'time',
    required: true,
    readonly: false,
    hidden: false,
  },
  {
    key: 'items',
    label: '核查材料',
    type: 'choiceList',
    required: true,
    readonly: false,
    hidden: false,
  },
];
const schema: NonNullable<RuntimeForm['supplement']> = {
  renderer: 'form-create-v1',
  schemaId: 'browser-fixture',
  rules: [
    {
      type: 'timePicker',
      field: 'time',
      title: '核查时间',
      $required: true,
      col: { span: 24 },
    },
    {
      type: 'elTransfer',
      field: 'items',
      title: '核查材料',
      $required: true,
      props: {
        titles: ['可选材料', '已选材料'],
        data: [
          { key: 1, label: '原件' },
          { key: '2', label: '复印件' },
        ],
      },
    },
  ],
};
async function validate() {
  status.value = (await form.value?.validate()) ? '校验通过' : '校验未通过';
}
function refill() {
  model.value = { time: '12:15:00', items: [] };
}
</script>
<template>
  <main>
    <h1>节点表单组件验收</h1>
    <p>独立测试页，仅在内存中操作示例值。</p>
    <NodeForm
      ref="form"
      v-model="model"
      :schema="schema"
      :fields="fields"
      :disabled="locked"
    />
    <button @click="validate">校验表单</button>
    <button @click="refill">回填空材料</button>
    <button @click="locked = !locked">
      {{ locked ? '恢复编辑' : '模拟只读' }}
    </button>
    <p role="status">{{ status }}</p>
    <pre>{{ JSON.stringify(model, null, 2) }}</pre>
  </main>
</template>
