import type { AgreePrintHtml5DragSession } from '../template/print-element-meta';

import { onBeforeUnmount, ref } from 'vue';

export type PalettePayload = NonNullable<AgreePrintHtml5DragSession>;
export type PalettePoint = { clientX: number; clientY: number };

/** 添加和移动共用的指针会话；越过阈值才开始拖动，松手只提交一次。 */
export function usePalettePointerDrag<Payload = PalettePayload>(callbacks: {
  begin?: (point: PalettePoint, payload: Payload) => void;
  cancel: () => void;
  drop: (point: PalettePoint, payload: Payload) => void;
  move: (point: PalettePoint, payload: Payload) => void;
}) {
  const preview = ref<null | { label: string; x: number; y: number }>(null);
  let active: null | {
    id: number;
    label: string;
    payload: Payload;
    x: number;
    y: number;
  } = null;
  let suppress = false;

  function finish() {
    if (preview.value) {
      suppress = true;
    }
    active = null;
    preview.value = null;
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', release, true);
    document.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', keydown, true);
    callbacks.cancel();
  }
  function move(event: PointerEvent) {
    if (!active || event.pointerId !== active.id) return;
    if (
      !preview.value &&
      Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5
    )
      return;
    event.preventDefault();
    if (!preview.value)
      callbacks.begin?.(
        { clientX: active.x, clientY: active.y },
        active.payload,
      );
    preview.value = {
      label: active.label,
      x: event.clientX + 14,
      y: event.clientY + 14,
    };
    callbacks.move(event, active.payload);
  }
  function release(event: PointerEvent) {
    if (!active || event.pointerId !== active.id) return;
    try {
      if (preview.value) callbacks.drop(event, active.payload);
    } finally {
      finish();
    }
  }
  function cancel() {
    finish();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finish();
  }
  function start(event: PointerEvent, payload: Payload, label: string) {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (active) finish();
    suppress = false;
    event.preventDefault();
    active = {
      id: event.pointerId,
      payload,
      label,
      x: event.clientX,
      y: event.clientY,
    };
    document.addEventListener('pointermove', move, {
      passive: false,
      capture: true,
    });
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', keydown, true);
  }
  function suppressClick(event: MouseEvent) {
    if (!suppress) return;
    event.preventDefault();
    event.stopPropagation();
    suppress = false;
  }
  function nextGesture() {
    if (!active) suppress = false;
  }
  document.addEventListener('pointerdown', nextGesture, true);
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', nextGesture, true);
    finish();
  });
  return { preview, start, suppressClick };
}
