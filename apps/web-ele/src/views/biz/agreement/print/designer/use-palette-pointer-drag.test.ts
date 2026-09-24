import { createApp, h } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AGREE_PRINT_TOOLBOX_DND } from '../template/print-element-meta';
import { usePalettePointerDrag } from './use-palette-pointer-drag';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
function mount() {
  const callbacks = { move: vi.fn(), drop: vi.fn(), cancel: vi.fn() };
  let drag!: ReturnType<typeof usePalettePointerDrag>;
  const click = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      drag = usePalettePointerDrag(callbacks);
      return () =>
        h('div', { onClickCapture: drag.suppressClick }, [
          h('button', { onClick: click }, '添加'),
        ]);
    },
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  const button = host.querySelector('button')!;
  const payload = {
    kind: AGREE_PRINT_TOOLBOX_DND,
    tid: 'staticTitle',
  } as const;
  function pointer(type: string, x: number, y = 10, id = 1) {
    const e = new MouseEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(e, 'pointerId', { value: id });
    return e as PointerEvent;
  }
  drag.start(pointer('pointerdown', 10), payload, '标题');
  return { callbacks, drag, button, click, payload, pointer };
}
describe('palette pointer drag', () => {
  it('keeps small movements as a click and does not insert on pointerup', () => {
    const m = mount();
    document.dispatchEvent(m.pointer('pointermove', 12));
    document.dispatchEvent(m.pointer('pointerup', 12));
    m.button.click();
    expect(m.callbacks.drop).not.toHaveBeenCalled();
    expect(m.click).toHaveBeenCalledOnce();
  });
  it('previews then inserts once and suppresses the following click', () => {
    const m = mount();
    document.dispatchEvent(m.pointer('pointermove', 50));
    document.dispatchEvent(m.pointer('pointermove', 100));
    expect(m.drag.preview.value?.label).toBe('标题');
    expect(m.callbacks.drop).not.toHaveBeenCalled();
    document.dispatchEvent(m.pointer('pointerup', 100));
    m.button.click();
    expect(m.callbacks.drop).toHaveBeenCalledOnce();
    expect(m.callbacks.drop.mock.calls[0]?.[1]).toEqual(m.payload);
    expect(m.click).not.toHaveBeenCalled();
    expect(m.drag.preview.value).toBeNull();
  });
  it.each(['Escape', 'pointercancel', 'blur'])(
    'cancels on %s without adding',
    (kind) => {
      const m = mount();
      document.dispatchEvent(m.pointer('pointermove', 50));
      (kind === 'pointercancel' ? document : window).dispatchEvent(
        kind === 'Escape'
          ? new KeyboardEvent('keydown', { key: 'Escape' })
          : new Event(kind),
      );
      document.dispatchEvent(m.pointer('pointerup', 100));
      expect(m.callbacks.drop).not.toHaveBeenCalled();
      expect(m.drag.preview.value).toBeNull();
    },
  );
  it('keeps tracking when a child stops bubbling and allows the next gesture after cancellation', () => {
    const m = mount();
    m.button.addEventListener('pointermove', (event) =>
      event.stopPropagation(),
    );
    m.button.dispatchEvent(m.pointer('pointermove', 80));
    expect(m.callbacks.move).toHaveBeenCalledOnce();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(m.callbacks.drop).not.toHaveBeenCalled();
    m.button.dispatchEvent(m.pointer('pointerdown', 10));
    m.drag.start(m.pointer('pointerdown', 10), m.payload, '标题');
    m.button.dispatchEvent(m.pointer('pointermove', 100));
    m.button.dispatchEvent(m.pointer('pointerup', 100));
    expect(m.callbacks.drop).toHaveBeenCalledOnce();
    m.button.click();
    expect(m.click).not.toHaveBeenCalled();
    m.button.dispatchEvent(m.pointer('pointerdown', 10));
    m.button.click();
    expect(m.click).toHaveBeenCalledOnce();
  });
});
