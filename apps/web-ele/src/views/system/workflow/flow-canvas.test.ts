import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createDocument, createNode } from './model';
import FlowCanvas from './flow-canvas.vue';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
function mountCanvas() {
  const doc = reactive(createDocument());
  doc.nodes = [
    createNode('start', 100, 100, 1),
    createNode('task', 350, 100, 2),
  ];
  doc.viewport = { x: 0, y: 0, zoom: 1 };
  const connect = vi.fn();
  const select = vi.fn();
  const finish = vi.fn();
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp({
    render: () =>
      h(FlowCanvas, {
        document: doc,
        selectedNode: '',
        selectedEdge: '',
        errorNodeIds: [],
        errorEdgeIds: [],
        onSelect: select,
        onConnect: connect,
        onFinish: finish,
        onMove: (id: string, x: number, y: number) => {
          const node = doc.nodes.find((n) => n.id === id)!;
          node.x = x;
          node.y = y;
        },
        onViewport: (viewport: typeof doc.viewport) => {
          doc.viewport = viewport;
        },
      }),
  });
  app.mount(root);
  const svg = root.querySelector('svg')!;
  Object.assign(svg, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => false,
    releasePointerCapture: vi.fn(),
  });
  cleanups.push(() => {
    app.unmount();
    root.remove();
  });
  return { root, svg, doc, connect, select, finish };
}
function pointer(element: Element, type: string, x = 100, y = 100) {
  element.dispatchEvent(
    new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }),
  );
}
describe('flow canvas interaction', () => {
  it('drags a node in graph coordinates and snaps its final position', async () => {
    const { root, svg, doc, finish } = mountCanvas();
    const node = root.querySelector('[data-node-id]')!;
    pointer(node, 'pointerdown');
    pointer(svg, 'pointermove', 174, 137);
    pointer(svg, 'pointerup', 174, 137);
    await nextTick();
    expect(doc.nodes[0]!.x).toBe(170);
    expect(doc.nodes[0]!.y).toBe(140);
    expect(finish).toHaveBeenCalled();
    expect(node.getAttribute('transform')).toBe('translate(170, 140)');
  });
  it('pans the canvas without changing node positions', () => {
    const { svg, doc } = mountCanvas();
    pointer(svg, 'pointerdown', 0, 0);
    pointer(svg, 'pointermove', 55, 70);
    pointer(svg, 'pointerup');
    expect(doc.viewport).toEqual({ x: 55, y: 70, zoom: 1 });
    expect(doc.nodes[0]!.x).toBe(100);
  });
  it('connects an output port to a selected target and cancels link mode', async () => {
    const { root, doc, connect } = mountCanvas();
    pointer(root.querySelector('.port')!, 'pointerdown');
    await nextTick();
    expect(root.textContent).toContain('选择目标节点');
    pointer(root.querySelectorAll('[data-node-id]')[1]!, 'pointerdown');
    await nextTick();
    expect(connect).toHaveBeenCalledWith(doc.nodes[0]!.id, doc.nodes[1]!.id);
    expect(root.textContent).not.toContain('选择目标节点');
  });
  it('zooms around the pointer while maintaining the graph point underneath', () => {
    const { svg, doc } = mountCanvas();
    // happy-dom's WheelEvent does not populate MouseEvent coordinates.
    const event = new MouseEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 120,
    });
    Object.defineProperty(event, 'deltaY', { value: -100 });
    svg.dispatchEvent(event);
    expect(doc.viewport.zoom).toBeCloseTo(1.1);
    expect((200 - doc.viewport.x) / doc.viewport.zoom).toBeCloseTo(200);
    expect((120 - doc.viewport.y) / doc.viewport.zoom).toBeCloseTo(120);
  });
});
