import { describe, expect, it } from 'vitest';
import { createNode } from '../../../../../shared/workflow';
import {
  NODE_WIDTH,
  edgeGeometry,
  edgeLabelBox,
  edgeLabelWidth,
} from './model';

/** 取路径终点 */
function endPoint(path: string) {
  const match = path.match(/([\d.-]+)\s+([\d.-]+)\s*$/);
  return { x: Number(match?.[1]), y: Number(match?.[2]) };
}

/** 箭头前最后一段直线的长度，用来确认线从箭头底边正中进入 */
function finalRun(path: string) {
  const match = path.match(/([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)\s*$/);
  if (!match) return 0;
  return Math.hypot(
    Number(match[3]) - Number(match[1]),
    Number(match[4]) - Number(match[2]),
  );
}

describe('workflow edge geometry', () => {
  it('lands the arrow on the target edge when the gap is short', () => {
    const source = createNode('task', 0, 100, 1);
    const target = createNode('approve', NODE_WIDTH + 48, 100, 2);
    const geo = edgeGeometry(
      {
        id: 'e',
        source: source.id,
        target: target.id,
        type: 'pass',
        label: '通过',
        condition: '',
        isDefault: false,
      },
      [source, target],
    );
    const left = target.x - NODE_WIDTH / 2;
    expect(geo).toBeTruthy();
    expect(endPoint(geo!.path)).toEqual({ x: left, y: target.y });
    expect(finalRun(geo!.path)).toBeGreaterThanOrEqual(16);
    expect(geo!.labelAbove).toBe(true);
  });

  it('keeps the label on a wide connector and lands on the node edge', () => {
    const source = createNode('start', 0, 100, 1);
    const target = createNode('task', NODE_WIDTH + 220, 100, 2);
    const geo = edgeGeometry(
      {
        id: 'e',
        source: source.id,
        target: target.id,
        type: 'pass',
        label: '通过',
        condition: '',
        isDefault: false,
      },
      [source, target],
    );
    const left = target.x - NODE_WIDTH / 2;
    expect(geo!.labelAbove).toBe(false);
    expect(endPoint(geo!.path)).toEqual({ x: left, y: target.y });
    expect(finalRun(geo!.path)).toBe(16);
  });

  it('places a reject label on the bottom of the curve, below the nodes', () => {
    const chief = createNode('approve', 600, 210, 1);
    const leader = createNode('approve', 1100, 65, 2);
    const geo = edgeGeometry(
      {
        id: 'e',
        source: leader.id,
        target: chief.id,
        type: 'reject',
        label: '驳回',
        condition: '',
        isDefault: false,
      },
      [leader, chief],
    );
    expect(geo!.y).toBeGreaterThan(chief.y + 72);
    expect(finalRun(geo!.path)).toBe(16);
  });

  it('keeps a straight run into the port when the nodes are not level', () => {
    const source = createNode('condition', 850, 210, 1);
    const target = createNode('approve', 1100, 65, 2);
    const geo = edgeGeometry(
      {
        id: 'e',
        source: source.id,
        target: target.id,
        type: 'pass',
        label: '通过',
        condition: '',
        isDefault: false,
      },
      [source, target],
    );
    const left = target.x - NODE_WIDTH / 2;
    expect(endPoint(geo!.path)).toEqual({ x: left, y: target.y });
    expect(finalRun(geo!.path)).toBeGreaterThan(16);
    const box = edgeLabelBox(geo!, 'BuChangJinE >= 1000000');
    expect(geo!.labelSide).toBe('left');
    expect(box.x + box.width).toBeLessThan(geo!.x);
  });

  it('keeps the full condition text wider than a short label', () => {
    expect(edgeLabelWidth('BuChangJinE >= 1000000')).toBeGreaterThan(
      edgeLabelWidth('通过'),
    );
    expect(edgeLabelWidth('BuChangJinE >= 1000000')).toBeGreaterThan(104);
  });
});
