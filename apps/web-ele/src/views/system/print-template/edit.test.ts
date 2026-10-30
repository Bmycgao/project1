import { createApp, h, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { requireDefined } from '../../../../../shared/require-defined';
import Edit from './edit.vue';

const {
  createPrintTemplate,
  getPrintTemplate,
  updatePrintTemplate,
  designer,
  routeState,
} = vi.hoisted(() => ({
  createPrintTemplate: vi.fn(),
  routeState: { id: 'test-template' },
  getPrintTemplate: vi.fn(),
  updatePrintTemplate: vi.fn(),
  designer: {
    json: {} as Record<string, any>,
    ready: true,
    emit: null as any,
    markClean: vi.fn(),
  },
}));

vi.mock('#/api', () => ({
  getPrintTemplate,
  updatePrintTemplate,
  createPrintTemplate,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: routeState }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock('@vben/common-ui', () => ({
  Page: {
    render(this: any) {
      return h('main', this.$slots.default?.());
    },
  },
}));
vi.mock(
  '../../biz/agreement/print/designer/agreement-print-designer.vue',
  async () => {
    const { defineComponent, onMounted } = await import('vue');
    return {
      default: defineComponent({
        emits: ['readyChange', 'dirtyChange', 'saveRequested'],
        setup(_props, { emit, expose }) {
          designer.emit = emit;
          designer.markClean.mockImplementation((saved) => {
            emit(
              'dirtyChange',
              JSON.stringify(designer.json) !== JSON.stringify(saved),
            );
          });
          expose({
            getTemplateJson: () => JSON.parse(JSON.stringify(designer.json)),
            markClean: designer.markClean,
            preview: vi.fn(),
          });
          onMounted(() => emit('readyChange', designer.ready));
          return () => h('div', '画布');
        },
      }),
    };
  },
);

const cleanups: Array<() => void> = [];
beforeEach(() => {
  routeState.id = 'test-template';
  createPrintTemplate.mockReset().mockResolvedValue({ id: 'new-created' });
  designer.json = { panels: [{ printElements: [] }] };
  designer.ready = true;
  designer.markClean.mockReset();
  getPrintTemplate.mockResolvedValue({
    id: 'test-template',
    name: '测试模板',
    templateCode: 'Test',
    status: 1,
  });
  updatePrintTemplate.mockReset();
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

async function flush() {
  await nextTick();
  await nextTick();
  await nextTick();
}

async function mountEditor() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(Edit);
  app.directive('loading', {});
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await flush();
  return host;
}

function saveButton(host: HTMLElement) {
  return requireDefined(
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.textContent?.trim() === '保存',
    ),
  );
}

it('设计器加载完成前禁用保存及预览', async () => {
  designer.ready = false;
  const host = await mountEditor();
  expect(saveButton(host).disabled).toBe(true);
  expect(
    requireDefined(
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (el) => el.textContent?.trim() === '预览',
      ),
    ).disabled,
  ).toBe(true);
  designer.emit('readyChange', true);
  await flush();
  expect(saveButton(host).disabled).toBe(false);
});

it('保存中只提交一次，保存期间的新修改继续保持未保存', async () => {
  let resolveSave!: () => void;
  updatePrintTemplate.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
  );
  const host = await mountEditor();
  const submitted = JSON.parse(JSON.stringify(designer.json));
  const save = saveButton(host);
  save.click();
  designer.emit('saveRequested', submitted);
  expect(updatePrintTemplate).toHaveBeenCalledOnce();
  designer.json = {
    panels: [{ printElements: [{ options: { title: '新修改' } }] }],
  };
  designer.emit('dirtyChange', true);
  resolveSave();
  await flush();
  expect(designer.markClean).toHaveBeenCalledWith(submitted);
  expect(host.querySelector('[role="status"]')?.textContent).toBe('未保存');
});

it('保存失败有明确状态，重试成功后恢复已保存', async () => {
  updatePrintTemplate
    .mockRejectedValueOnce(new Error('保存测试失败'))
    .mockResolvedValueOnce({});
  const host = await mountEditor();
  saveButton(host).click();
  await flush();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('保存失败');
  saveButton(host).click();
  await flush();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('已保存');
  expect(updatePrintTemplate).toHaveBeenCalledTimes(2);
});

it('新建时明确选择空白起点，创建请求不混入业务演示内容', async () => {
  routeState.id = 'new';
  const host = await mountEditor();
  const inputs = [
    ...document.querySelectorAll<HTMLInputElement>('.print-editor-meta input'),
  ];
  for (const [index, value] of ['空白测试', 'BlankTest'].entries()) {
    requireDefined(inputs[index]).value = value;
    requireDefined(inputs[index]).dispatchEvent(
      new Event('input', { bubbles: true }),
    );
  }
  const radio = requireDefined(
    document.querySelector<HTMLInputElement>(
      'input[type="radio"][value="blank"]',
    ),
  );
  radio.click();
  await flush();
  requireDefined(
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === '创建并设计',
    ),
  ).click();
  await flush();
  expect(createPrintTemplate).toHaveBeenCalledWith(
    expect.objectContaining({
      name: '空白测试',
      templateCode: 'BlankTest',
      templateJson: expect.objectContaining({
        agreeTemplatePreset: 'blank',
        panels: [expect.objectContaining({ printElements: [] })],
      }),
    }),
  );
});
