import { describe, expect, it } from 'vitest';

import { traceNodeStatus } from './trace-status';

/** 两条分支都有待办时的默认入参 */
function branch(
  overrides: Partial<Parameters<typeof traceNodeStatus>[0]> = {},
) {
  return traceNodeStatus({
    nodeId: 'left',
    nodeType: 'approve',
    instanceStatus: 'running',
    currentNodeId: 'right',
    pending: true,
    visited: false,
    incomingCount: 1,
    ...overrides,
  });
}

describe('trace node status', () => {
  it('marks every pending branch as in progress', () => {
    expect(branch().label).toBe('办理中');
    expect(
      branch({ nodeId: 'right', currentNodeId: 'right', visited: true }).label,
    ).toBe('办理中');
  });

  it('marks a finished branch done and an untouched branch idle', () => {
    expect(branch({ pending: false, visited: true }).label).toBe('已完成');
    expect(branch({ pending: false, visited: false }).label).toBe('未到达');
  });

  it('keeps a waiting join out of the done color', () => {
    expect(
      branch({
        nodeId: 'join',
        nodeType: 'parallel',
        currentNodeId: 'left',
        pending: false,
        visited: true,
        incomingCount: 2,
        arrivedCount: 1,
      }).label,
    ).toBe('等待汇聚');
  });

  it('marks the join done after every incoming edge has arrived', () => {
    expect(
      branch({
        nodeId: 'join',
        nodeType: 'parallel',
        pending: false,
        visited: true,
        incomingCount: 2,
      }).label,
    ).toBe('已完成');
  });

  it('does not treat a fork as a waiting join', () => {
    expect(
      branch({
        nodeId: 'fork',
        nodeType: 'parallel',
        pending: false,
        visited: true,
        incomingCount: 1,
        arrivedCount: 0,
      }).label,
    ).toBe('已完成');
  });

  it('keeps a subflow blue while the parent is waiting on it', () => {
    expect(
      branch({
        nodeId: 'child',
        nodeType: 'subflow',
        currentNodeId: 'child',
        pending: false,
        visited: true,
      }).label,
    ).toBe('办理中');
  });

  it('stops highlighting the current node after the instance ends', () => {
    expect(
      branch({
        instanceStatus: 'completed',
        currentNodeId: 'end',
        nodeId: 'end',
        nodeType: 'end',
        pending: false,
        visited: true,
      }).label,
    ).toBe('已完成');
  });
});
