import { describe, expect, it } from 'vitest';

import { findDeptLeaderUserId, leaderUserIdsOf } from './mock-dept';

describe('department leader mapping', () => {
  it('returns the node leader or walks up to a parent', () => {
    expect(findDeptLeaderUserId('D1002')).toBe('3');
    expect(findDeptLeaderUserId('D1001')).toBe('1');
    expect(findDeptLeaderUserId('D1003')).toBe('3');
    expect(findDeptLeaderUserId('D1006')).toBe('1');
  });
  it('skips disabled departments and unknown ids', () => {
    expect(findDeptLeaderUserId('D1010')).toBeUndefined();
    expect(findDeptLeaderUserId('D1011')).toBeUndefined();
    expect(findDeptLeaderUserId('D9999')).toBeUndefined();
  });
  it('deduplicates leaders across selected departments', () => {
    expect(leaderUserIdsOf(['D1002', 'D1003', 'D1004'])).toEqual(['3']);
    expect(leaderUserIdsOf(['D1001', 'D1006']).toSorted()).toEqual(['1']);
  });
});
