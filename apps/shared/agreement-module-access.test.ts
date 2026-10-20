import { describe, expect, it } from 'vitest';

import { effectiveDetailView } from './workflow-detail';

describe('已发布流程的自定义模块权限', () => {
  const view = {
    title: '详情',
    modules: [
      {
        key: 'custom_form_water',
        label: '水电费',
        authCode: 'Agree:Module:custom', // 旧版本快照
        fields: [],
        rules: [],
      },
    ],
  } as any;
  const node = { type: 'approve', moduleAccess: {} } as any;

  it('旧通用码不放宽权限，按稳定模块 key 授权', () => {
    const actor = (codes: string[]) => ({ id: 'u1', codes }) as any;
    expect(
      effectiveDetailView(view, node, actor(['Agree:Module:basic']), true)
        .modules,
    ).toHaveLength(0);
    expect(
      effectiveDetailView(
        view,
        node,
        actor(['Agree:Module:custom_form_water']),
        true,
      ).modules,
    ).toHaveLength(1);
  });
});
