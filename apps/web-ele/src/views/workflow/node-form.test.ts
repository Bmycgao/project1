import type {
  RuntimeField,
  RuntimeForm,
} from '../../../../shared/workflow-runtime';

/* oxlint-disable typescript/no-non-null-assertion -- Test fixtures intentionally assert that configured nodes and mounted controls exist. */
import { createApp, h, nextTick, ref } from 'vue';

import FcDesigner from '@form-create/designer';
import ElementPlus from 'element-plus';
import { expect, it } from 'vitest';

import NodeForm from './node-form.vue';

it('uses the installed FormCreate engine for rendering, editing, validation and external refill', async () => {
  const fields = ref<RuntimeField[]>([
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
      label: '材料',
      type: 'choiceList',
      required: true,
      readonly: false,
      hidden: false,
    },
    {
      key: 'rows',
      label: '明细',
      type: 'table',
      required: false,
      readonly: false,
      hidden: false,
      children: [
        {
          key: 'memo',
          label: '说明',
          type: 'text',
          required: false,
          readonly: false,
          hidden: false,
        },
      ],
    },
  ]);
  const schema: NonNullable<RuntimeForm['supplement']> = {
    renderer: 'form-create-v1',
    schemaId: 'test',
    rules: [
      { type: 'timePicker', field: 'time', title: '核查时间', $required: true },
      {
        type: 'elTransfer',
        field: 'items',
        title: '材料',
        $required: true,
        props: {
          data: [
            { key: 1, label: '原件' },
            { key: '2', label: '复印件' },
          ],
        },
      },
      {
        type: 'tableForm',
        field: 'rows',
        title: '明细',
        props: {
          showIndex: false,
          columns: [
            { label: '说明', rule: [{ type: 'input', field: 'memo' }] },
          ],
        },
      },
    ],
  };
  const model = ref<Record<string, unknown>>({
    time: '09:30:00',
    items: [1],
    rows: [{ memo: '已核查' }],
    unrelated: 'keep',
  });
  const form = ref<InstanceType<typeof NodeForm>>();
  const disabled = ref(false);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () =>
      h(NodeForm, {
        ref: form,
        schema,
        fields: fields.value,
        modelValue: model.value,
        disabled: disabled.value,
        'onUpdate:modelValue': (value) => {
          model.value = value;
        },
      }),
  });
  app.use(ElementPlus);
  app.use(FcDesigner);
  app.use(FcDesigner.formCreate);
  app.mount(host);
  async function flush() {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 80));
    await nextTick();
  }
  try {
    await flush();
    const input = host.querySelector<HTMLInputElement>(
      '.el-date-editor input',
    )!;
    expect(input.value).toBe('09:30:00');
    expect(host.querySelectorAll('.el-transfer-panel')).toHaveLength(2);
    expect(
      host.querySelector<HTMLInputElement>('._fc-table-form input')!.value,
    ).toBe('已核查');
    expect(await form.value!.validate()).toBe(true);
    host
      .querySelector<HTMLInputElement>(
        '.el-transfer-panel .el-checkbox-group input',
      )!
      .click();
    await flush();
    host
      .querySelectorAll<HTMLButtonElement>('.el-transfer__buttons button')[1]!
      .click();
    await flush();
    expect(model.value.items).toEqual([1, '2']);
    const inputValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!;
    inputValue.call(input, '10:45:00');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await flush();
    expect(model.value.time).toBe('10:45:00');
    expect(model.value.unrelated).toBe('keep');
    model.value = { ...model.value, time: '12:15:00', items: [] };
    await flush();
    expect(
      host.querySelector<HTMLInputElement>('.el-date-editor input')!.value,
    ).toBe('12:15:00');
    expect(form.value!.getValues().items).toEqual([]);
    expect(await form.value!.validate()).toBe(false);
    // A successful empty save returns null, while the page toggles its busy state.
    // Transfer and table controls must keep rendering and accept later refills.
    disabled.value = true;
    await flush();
    model.value = { ...model.value, items: null, rows: null };
    await flush();
    disabled.value = false;
    await flush();
    expect(host.querySelectorAll('.el-transfer-panel')).toHaveLength(2);
    expect(form.value!.getValues().items).toEqual([]);
    expect(form.value!.getValues().rows).toEqual([]);
    expect(await form.value!.validate()).toBe(false);
    model.value = { ...model.value, rows: [{ memo: '已核查' }] };
    await flush();
    fields.value = fields.value.map((field) => ({ ...field, readonly: true }));
    await flush();
    expect(
      host.querySelector<HTMLInputElement>('.el-date-editor input')!.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>('._fc-table-form input')!.disabled,
    ).toBe(true);
    expect(
      [
        ...host.querySelectorAll<HTMLInputElement>(
          '.el-transfer-panel .el-checkbox-group input',
        ),
      ].every((item) => item.disabled),
    ).toBe(true);
    expect(await form.value!.validate()).toBe(true);
  } finally {
    app.unmount();
    host.remove();
  }
});
