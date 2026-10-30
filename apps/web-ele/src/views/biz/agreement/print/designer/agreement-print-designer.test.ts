import { createApp, h, KeepAlive, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { listPrintElements } from '../template/print-element-meta';
import Designer from './agreement-print-designer.vue';

const { createDocumentPrint, ensureHiprint, fixture, inspectorFocus } =
  vi.hoisted(() => ({
    createDocumentPrint: vi.fn(),
    ensureHiprint: vi.fn(),
    inspectorFocus: vi.fn(),
    fixture: {
      panels: [
        {
          width: 210,
          height: 297,
          printElements: [
            {
              printElementType: { type: 'text' },
              options: {
                title: '协议编号',
                field: 'agreementNo',
                top: 20,
                left: 20,
                width: 120,
                height: 20,
              },
            },
          ],
        },
      ],
    },
  }));

vi.mock('#/api', () => ({
  getPrintTemplate: vi.fn(),
  updatePrintTemplate: vi.fn(),
}));
vi.mock('../engine/ensure-hiprint', () => ({ ensureHiprint }));
vi.mock('../engine/document-print', () => ({ createDocumentPrint }));
vi.mock('../template/template-store', () => ({
  loadAgreePrintTemplate: () => JSON.parse(JSON.stringify(fixture)),
  saveAgreePrintTemplate: vi.fn(),
}));
// 保留真实设计器状态与事件链，画布测量、复杂检视器在各自测试中验证。
vi.mock('./document-canvas.vue', () => ({
  default: {
    props: ['templateJson'],
    emits: [
      'update:templateJson',
      'update:selectedKey',
      'tableHeaderCellSelect',
      'tableFooterCellSelect',
    ],
    render(this: any) {
      return h('div', [
        h(
          'button',
          {
            'data-header': '',
            onClick: () =>
              this.$emit('tableHeaderCellSelect', {
                key: '0:1',
                fromLeaf: 0,
                toLeaf: 0,
                field: 'name',
                mergeId: '',
                clientX: 0,
                clientY: 0,
                shiftKey: false,
              }),
          },
          '点表头',
        ),
        h(
          'button',
          {
            'data-footer': '',
            onClick: () =>
              this.$emit('tableFooterCellSelect', {
                key: '0:1',
                rowIndex: 0,
                cellIndex: 0,
              }),
          },
          '点表尾',
        ),
        h(
          'button',
          {
            'data-select': '',
            onClick: () => this.$emit('update:selectedKey', '0:0'),
          },
          '选中文本',
        ),
        h('input', {
          'data-draft': '',
          onBlur: (event: FocusEvent) => {
            const next = JSON.parse(JSON.stringify(this.templateJson));
            next.panels[0].printElements[0].options.title = (
              event.target as HTMLInputElement
            ).value;
            this.$emit('update:templateJson', next);
          },
        }),
      ]);
    },
  },
}));
vi.mock('./canvas-stage.vue', () => ({ default: { render: () => null } }));
vi.mock('./print-inspector.vue', () => ({
  default: {
    props: ['selectedKey'],
    methods: {
      openTableEditor(this: any) {
        inspectorFocus('header', this.selectedKey);
      },
      focusFooterCell(this: any) {
        inspectorFocus('footer', this.selectedKey);
      },
    },
    render: () => null,
  },
}));
vi.mock('./print-data-panel.vue', () => ({
  default: {
    emits: ['pick'],
    render(this: any) {
      const field = { field: 'compensatee', text: '被征收人', group: 'text' };
      return h('div', [
        h(
          'button',
          {
            'data-table-field': '',
            onClick: () =>
              this.$emit(
                'pick',
                { field: 'houses', text: '房屋明细', group: 'table' },
                'add',
              ),
          },
          '房屋明细',
        ),
        h(
          'button',
          {
            'data-add-field': '',
            onClick: () => this.$emit('pick', field, 'add'),
          },
          '添加被征收人',
        ),
        h(
          'button',
          {
            'data-bind-field': '',
            onClick: () => this.$emit('pick', field, 'bind'),
          },
          '绑定被征收人',
        ),
      ]);
    },
  },
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  ensureHiprint.mockReset();
  createDocumentPrint.mockReset();
  inspectorFocus.mockReset();
});

async function mountDesigner() {
  const host = document.createElement('div');
  document.body.append(host);
  const instance = ref<any>();
  const active = ref(true);
  const dirty = vi.fn();
  const save = vi.fn();
  const app = createApp({
    render: () =>
      h(KeepAlive, null, {
        default: () =>
          active.value
            ? h(Designer, {
                ref: instance,
                delegateSave: true,
                onDirtyChange: dirty,
                onSaveRequested: save,
              })
            : null,
      }),
  });
  app.directive('loading', {});
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  await nextTick();
  await nextTick();
  return { host, instance, active, dirty, save };
}

function key(key: string, ctrlKey = false) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      ctrlKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function flushPreview() {
  for (let i = 0; i < 12; i++) await nextTick();
}

function dialogButton(label: string) {
  return requireDefined(
    [
      ...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ].find((button) => button.textContent?.trim() === label),
  );
}

function renderedPrintInstance(print = vi.fn()) {
  return {
    print,
    getHtml: () => ({
      appendTo: (host: HTMLElement) => {
        host.innerHTML =
          '<div class="hiprint-printPaper">样张第一页</div><div class="hiprint-printPaper">样张第二页</div>';
      },
    }),
  };
}

describe('打印模板编辑流程', () => {
  it('试打复用当前未保存版式与自定义数据的预览，不保存、不重新生成', async () => {
    const print = vi.fn();
    const rendered = renderedPrintInstance(print);
    ensureHiprint.mockResolvedValue({ PrintTemplate: vi.fn() });
    createDocumentPrint.mockResolvedValue(rendered);
    const { host, instance, save } = await mountDesigner();
    const input = requireDefined(
      host.querySelector<HTMLInputElement>('[data-draft]'),
    );
    input.value = '未保存样张标题';
    input.dispatchEvent(new FocusEvent('blur'));
    await nextTick();
    requireDefined(
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.trim() === '编辑预览数据',
      ),
    ).click();
    await flushPreview();
    dialogButton('编辑 JSON').click();
    await nextTick();
    const json = requireDefined(
      document.querySelector<HTMLTextAreaElement>(
        '[aria-label="预览数据 JSON"]',
      ),
    );
    const customData = JSON.parse(json.value);
    customData.agreementNo = 'UNSAVED-SAMPLE';
    json.value = JSON.stringify(customData);
    json.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    dialogButton('应用到预览').click();
    await flushPreview();
    await instance.value.preview();
    await flushPreview();
    expect(document.body.textContent).toContain('打印预览 · 共 2 页');
    expect(document.body.textContent).toContain('自定义数据，仅供检查排版');
    const [template, data] = requireDefined(createDocumentPrint.mock.calls[0]);
    expect(template.panels[0].printElements[0].options.title).toBe(
      '未保存样张标题',
    );
    expect(data.agreementNo).toBe('UNSAVED-SAMPLE');
    expect(dialogButton('打印样张').disabled).toBe(false);
    dialogButton('打印样张').click();
    await flushPreview();
    expect(print).toHaveBeenCalledWith(
      data,
      {},
      expect.objectContaining({ callback: expect.any(Function) }),
    );
    expect(requireDefined(print.mock.calls[0])[0]).toBe(data);
    expect(createDocumentPrint).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();

    // 在预览中更换数据：新分页未生成前不能用旧数据试打。
    let finishUpdatedPreview!: (
      value: ReturnType<typeof renderedPrintInstance>,
    ) => void;
    createDocumentPrint.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpdatedPreview = resolve;
        }),
    );
    dialogButton('编辑预览数据').click();
    await flushPreview();
    const updatedJson = requireDefined(
      document.querySelector<HTMLTextAreaElement>(
        '[aria-label="预览数据 JSON"]',
      ),
    );
    customData.agreementNo = 'UPDATED-SAMPLE';
    updatedJson.value = JSON.stringify(customData);
    updatedJson.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    dialogButton('应用到预览').click();
    await flushPreview();
    expect(dialogButton('打印样张').disabled).toBe(true);
    const updated = renderedPrintInstance();
    finishUpdatedPreview(updated);
    await flushPreview();
    dialogButton('打印样张').click();
    await flushPreview();
    expect(updated.print).toHaveBeenCalledOnce();
    expect(requireDefined(updated.print.mock.calls[0])[0].agreementNo).toBe(
      'UPDATED-SAMPLE',
    );
    expect(print).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it('生成中和生成失败禁止试打；重试后可打印，阻止重复提交并从打印失败恢复', async () => {
    let finishRender!: (
      value: ReturnType<typeof renderedPrintInstance>,
    ) => void;
    ensureHiprint.mockResolvedValue({ PrintTemplate: vi.fn() });
    createDocumentPrint.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRender = resolve;
        }),
    );
    const { instance } = await mountDesigner();
    const pending = instance.value.preview();
    await flushPreview();
    expect(dialogButton('打印样张').disabled).toBe(true);
    const print = vi.fn();
    let failPrint!: (error: Error) => void;
    print.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failPrint = reject;
        }),
    );
    finishRender(renderedPrintInstance(print));
    await pending;
    await flushPreview();
    const printButton = dialogButton('打印样张');
    printButton.click();
    printButton.click();
    await flushPreview();
    expect(print).toHaveBeenCalledOnce();
    expect(dialogButton('编辑预览数据').disabled).toBe(true);
    failPrint(new Error('模拟打印窗口打开失败'));
    await flushPreview();
    expect(document.body.textContent).toContain('模拟打印窗口打开失败');
    expect(dialogButton('打印样张').disabled).toBe(false);
    expect(dialogButton('编辑预览数据').disabled).toBe(false);
    dialogButton('打印样张').click();
    await flushPreview();
    expect(print).toHaveBeenCalledTimes(2);
    ensureHiprint.mockRejectedValueOnce(new Error('模拟重新生成失败'));
    await instance.value.preview();
    await flushPreview();
    expect(dialogButton('打印样张').disabled).toBe(true);
    expect(print).toHaveBeenCalledTimes(2);
    const latest = renderedPrintInstance();
    createDocumentPrint.mockResolvedValueOnce(latest);
    dialogButton('重新生成预览').click();
    await flushPreview();
    dialogButton('打印样张').click();
    await flushPreview();
    expect(latest.print).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledTimes(2);
  });
  it('载入起始版式先选择，取消不修改；应用空白后可撤销回原设计', async () => {
    const { instance, dirty } = await mountDesigner();
    const original = instance.value.getTemplateJson();
    const click = async (label: string) => {
      requireDefined(
        [
          ...document.querySelectorAll<HTMLElement>(
            'button, [role="menuitem"]',
          ),
        ].find((element) => element.textContent?.trim() === label),
      ).click();
      await nextTick();
      await nextTick();
    };
    await click('页面设置与更多');
    await click('载入起始版式');
    expect(instance.value.getTemplateJson()).toEqual(original);
    requireDefined(
      document.querySelector<HTMLInputElement>(
        'input[type="radio"][value="blank"]',
      ),
    ).click();
    await click('取消');
    expect(instance.value.getTemplateJson()).toEqual(original);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await click('页面设置与更多');
    await click('载入起始版式');
    requireDefined(
      document.querySelector<HTMLInputElement>(
        'input[type="radio"][value="blank"]',
      ),
    ).click();
    await click('应用版式');
    expect(instance.value.getTemplateJson().panels[0].printElements).toEqual(
      [],
    );
    expect(dirty).toHaveBeenLastCalledWith(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    key('z', true);
    await nextTick();
    expect(instance.value.getTemplateJson()).toEqual(original);
  });
  it('窄窗口切换字段库和属性面板时保持一个浮动面板，保留当前选择', async () => {
    const { host, instance } = await mountDesigner();
    const body = requireDefined(
      host.querySelector<HTMLElement>('.agree-designer__body'),
    );
    Object.defineProperty(body, 'clientWidth', { value: 800 });
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-select]'),
    ).click();
    await nextTick();
    const selectedTemplate = instance.value.getTemplateJson();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[title="查找数据字段"]'),
    ).click();
    await nextTick();
    expect(body.classList.contains('is-right-collapsed')).toBe(true);
    expect(body.classList.contains('is-left-collapsed')).toBe(false);
    const close = requireDefined(
      host.querySelector<HTMLButtonElement>('[aria-label="收起内容面板"]'),
    );
    expect(close.closest('.agree-designer__left-scroll')).toBeNull();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[title="定位画布元素"]'),
    ).click();
    await nextTick();
    expect(body.classList.contains('is-right-collapsed')).toBe(false);
    expect(body.classList.contains('is-left-collapsed')).toBe(true);
    expect(instance.value.getTemplateJson()).toEqual(selectedTemplate);
  });
  it('首次从文本点击表头或表尾时，等检视器目标更新后打开正确的表格', async () => {
    const { host, instance } = await mountDesigner();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-table-field]'),
    ).click();
    await nextTick();
    const tableKey = requireDefined(
      listPrintElements(instance.value.getTemplateJson())[1],
    ).key;
    for (const [selector, kind] of [
      ['[data-header]', 'header'],
      ['[data-footer]', 'footer'],
    ]) {
      requireDefined(
        host.querySelector<HTMLButtonElement>('[data-select]'),
      ).click();
      await nextTick();
      requireDefined(
        host.querySelector<HTMLButtonElement>(requireDefined(selector)),
      ).click();
      await nextTick();
      await nextTick();
      expect(inspectorFocus).toHaveBeenLastCalledWith(kind, tableKey);
    }
  });
  it('选中文本后添加字段仍然新建，显式绑定只替换目标且可撤销', async () => {
    const { host, instance } = await mountDesigner();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-select]'),
    ).click();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-add-field]'),
    ).click();
    await nextTick();
    let elements = instance.value.getTemplateJson().panels[0].printElements;
    expect(elements).toHaveLength(2);
    expect(elements[0].options.field).toBe('agreementNo');
    expect(elements[1].options.field).toBe('compensatee');
    key('z', true);
    await nextTick();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-select]'),
    ).click();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-bind-field]'),
    ).click();
    await nextTick();
    elements = instance.value.getTemplateJson().panels[0].printElements;
    expect(elements).toHaveLength(1);
    expect(elements[0].options.field).toBe('compensatee');
    key('z', true);
    await nextTick();
    expect(
      instance.value.getTemplateJson().panels[0].printElements[0].options.field,
    ).toBe('agreementNo');
  });

  it('没有文本目标时显式绑定不会意外新增元素', async () => {
    const { host, instance } = await mountDesigner();
    const original = instance.value.getTemplateJson();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-bind-field]'),
    ).click();
    await nextTick();
    expect(instance.value.getTemplateJson()).toEqual(original);
  });
  it('打印脱敏可撤销重做、保存，载入起始版式仍保留规则', async () => {
    const { host, instance, save } = await mountDesigner();
    const click = async (label: string) => {
      const button = [
        ...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]'),
      ].find((el) => el.textContent?.trim() === label);
      expect(button).toBeTruthy();
      requireDefined(button).click();
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 10));
    };
    expect(host.textContent).toContain('打印脱敏');
    await click('打印脱敏');
    requireDefined(
      document.querySelector<HTMLElement>('[role="switch"]'),
    ).click();
    await nextTick();
    await click('应用到模板');
    expect(instance.value.getTemplateJson().agreePrintMaskRules).toEqual([
      { field: 'compensatee', mode: 'all' },
    ]);
    // 等待对话框关闭动画完成，随后快捷键才交还画布。
    await new Promise((resolve) => setTimeout(resolve, 400));
    key('z', true);
    await nextTick();
    expect(
      instance.value.getTemplateJson().agreePrintMaskRules,
    ).toBeUndefined();
    key('y', true);
    await nextTick();
    key('s', true);
    await nextTick();
    expect(save.mock.calls.at(-1)?.[0].agreePrintMaskRules).toEqual([
      { field: 'compensatee', mode: 'all' },
    ]);
    const savedDesign = instance.value.getTemplateJson();
    await click('页面设置与更多');
    await click('载入起始版式');
    await click('应用版式');
    expect(instance.value.getTemplateJson().panels).toHaveLength(2);
    expect(instance.value.getTemplateJson().agreePrintMaskRules).toEqual(
      savedDesign.agreePrintMaskRules,
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    key('z', true);
    await nextTick();
    expect(instance.value.getTemplateJson()).toEqual(savedDesign);
  });
  it('在输入框中按保存快捷键，会先应用尚未失焦的编辑', async () => {
    const { host, save } = await mountDesigner();
    const input = requireDefined(
      host.querySelector<HTMLInputElement>('[data-draft]'),
    );
    input.focus();
    input.value = '正在输入的标题';
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await nextTick();
    expect(save).toHaveBeenCalledOnce();
    expect(
      requireDefined(save.mock.calls[0])[0].panels[0].printElements[0].options
        .title,
    ).toBe('正在输入的标题');
  });

  it('新增明细不会覆盖已选中文本，撤销及重做反映保存基线', async () => {
    const { host, instance, dirty } = await mountDesigner();
    const original = instance.value.getTemplateJson();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-select]'),
    ).click();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-table-field]'),
    ).click();
    await nextTick();
    const added = instance.value.getTemplateJson();
    expect(added.panels[0].printElements).toHaveLength(2);
    expect(added.panels[0].printElements[0].options.field).toBe('agreementNo');
    expect(added.panels[0].printElements[1].options.field).toBe('houses');
    expect(dirty).toHaveBeenLastCalledWith(true);
    key('z', true);
    await nextTick();
    expect(instance.value.getTemplateJson()).toEqual(original);
    expect(dirty).toHaveBeenLastCalledWith(false);
    key('y', true);
    await nextTick();
    instance.value.markClean(added);
    await nextTick();
    key('z', true);
    await nextTick();
    expect(dirty).toHaveBeenLastCalledWith(true);
    key('y', true);
    await nextTick();
    expect(dirty).toHaveBeenLastCalledWith(false);
  });

  it('弹窗打开及编辑页缓存隐藏后，快捷键不会删除画布或提交保存', async () => {
    const { host, instance, active, save } = await mountDesigner();
    requireDefined(
      host.querySelector<HTMLButtonElement>('[data-select]'),
    ).click();
    const original = instance.value.getTemplateJson();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    vi.spyOn(dialog, 'getClientRects').mockReturnValue({
      length: 1,
    } as DOMRectList);
    key('Delete');
    key('s', true);
    expect(instance.value.getTemplateJson()).toEqual(original);
    expect(save).not.toHaveBeenCalled();
    dialog.remove();
    active.value = false;
    await nextTick();
    key('s', true);
    expect(save).not.toHaveBeenCalled();
    active.value = true;
    await nextTick();
    key('s', true);
    expect(save).toHaveBeenCalledOnce();
  });

  it('关闭预览后忽略迟到的失败，再次预览可重试', async () => {
    const { instance } = await mountDesigner();
    let fail!: (error: Error) => void;
    ensureHiprint.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = instance.value.preview();
    await nextTick();
    expect(document.body.textContent).toContain('正在生成打印预览');
    requireDefined(
      requireDefined(
        requireDefined(
          document.querySelector('.agree-designer__preview'),
        ).closest('[role="dialog"]'),
      ).querySelector<HTMLButtonElement>('.el-dialog__headerbtn'),
    ).click();
    await nextTick();
    fail(new Error('已关闭请求'));
    await pending;
    expect(document.body.textContent).not.toContain('预览失败：已关闭请求');
    ensureHiprint.mockRejectedValueOnce(new Error('测试预览失败'));
    await instance.value.preview();
    await nextTick();
    expect(document.body.textContent).toContain('重新生成预览');
    expect(document.body.textContent).toContain('测试预览失败');
  });
});
