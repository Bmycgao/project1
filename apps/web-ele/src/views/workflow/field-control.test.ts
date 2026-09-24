import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import type { RuntimeField } from '../../../../shared/workflow-runtime';
import FieldControl from './field-control.vue';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
function mount(field: Partial<RuntimeField>, value: unknown) {
  const root = document.createElement('div');
  document.body.append(root);
  const update = vi.fn();
  const app = createApp({
    render: () =>
      h(FieldControl, {
        field: {
          key: 'test',
          label: '测试',
          type: 'text',
          required: false,
          readonly: false,
          hidden: false,
          ...field,
        },
        modelValue: value,
        'onUpdate:modelValue': update,
      }),
  });
  app.mount(root);
  cleanups.push(() => {
    app.unmount();
    root.remove();
  });
  return { root, update };
}
describe('workflow field controls', () => {
  it('renders approval fields as readonly labels without an input', () => {
    const { root } = mount(
      {
        type: 'select',
        readonly: true,
        options: [{ label: '核准', value: 'ok' }],
      },
      'ok',
    );
    expect(root.textContent).toContain('核准');
    expect(root.querySelector('input')).toBeNull();
  });
  it('emits editable text changes', async () => {
    const { root, update } = mount({}, '原值');
    const input = root.querySelector('input')!;
    input.value = '修正资料';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(update).toHaveBeenCalledWith('修正资料');
  });
  it('hides protected table columns and disables row mutation', async () => {
    const { root, update } = mount(
      {
        type: 'table',
        children: [
          {
            key: 'private',
            label: '秘密列',
            type: 'text',
            readonly: false,
            required: false,
            hidden: true,
          },
          {
            key: 'name',
            label: '名称',
            type: 'text',
            readonly: false,
            required: false,
            hidden: false,
          },
        ],
      },
      [{ private: '秘密值', name: '公开值' }],
    );
    await nextTick();
    expect(root.textContent).not.toContain('秘密值');
    expect(root.textContent).not.toContain('秘密列');
    expect(root.textContent).not.toContain('添加明细');
    expect(root.querySelector('input')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
