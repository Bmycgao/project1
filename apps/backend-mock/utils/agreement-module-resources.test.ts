import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  customModuleCodesForPermissionIds,
  listCustomAgreementModuleResources,
  rolePermissionResourceTree,
} from './agreement-module-resources';

const data = vi.hoisted(() => ({
  saved: [] as Array<{ key: string; label: string }>,
  pages: [] as any[],
}));

vi.mock('./mock-page-schema', () => ({ pageSchemaStore: data.pages }));
vi.mock('./mock-persist', () => ({
  readPersistJson: () => data.saved,
  writePersistJson: (_name: string, value: typeof data.saved) => {
    data.saved = value;
  },
}));

describe('自定义协议模块授权资源', () => {
  beforeEach(() => {
    data.saved = [];
    data.pages.length = 0;
  });

  it('跨页面复用同一个 key 只产生一个稳定资源，删除挂载仍可授权旧实例', () => {
    data.pages.push(
      { modules: [{ key: 'custom_form_water', label: '水电费' }] },
      { modules: [{ key: 'custom_form_water', label: '水电费' }] },
    );
    expect(listCustomAgreementModuleResources()).toEqual([
      { key: 'custom_form_water', label: '水电费' },
    ]);
    data.pages.length = 0;
    expect(listCustomAgreementModuleResources()).toHaveLength(1);
    expect(
      customModuleCodesForPermissionIds(
        new Set(['agree-module:custom_form_water']),
      ),
    ).toEqual(['Agree:Module:custom_form_water']);
  });

  it('角色模块树展示新资源，角色权限码由所选资源生成', () => {
    data.pages.push({
      modules: [{ key: 'custom_form_assessment', label: '评估信息' }],
    });
    const menu = [
      {
        id: 799,
        name: 'BizAgreementDetail',
        children: [{ id: 79_901, authCode: 'Agree:Module:basic' }],
      },
    ];
    const tree = rolePermissionResourceTree(menu);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[1]).toMatchObject({
      id: 'agree-module:custom_form_assessment',
      authCode: 'Agree:Module:custom_form_assessment',
      meta: { title: '评估信息' },
    });
    expect(menu[0]?.children).toHaveLength(1);
  });
});
