import { describe, expect, it } from 'vitest';

import {
  buildAgreeModuleMounts,
  normalizeAgreeModuleMounts,
  resolveAgreeModulesForPage,
  resolveMountedModuleKeys,
} from './module-access';

describe('详情视图配置', () => {
  it('旧配置沿用基础信息在内容区，其余模块在标签区', () => {
    const items = resolveAgreeModulesForPage(buildAgreeModuleMounts(), [
      'Agree:*',
    ]);
    expect(items.find((m) => m.key === 'basic')?.region).toBe('content');
    expect(
      items.filter((m) => m.key !== 'basic').every((m) => m.region === 'tabs'),
    ).toBe(true);
  });
  it('基础信息可以移到标签区，自定义模块可以在内容区排在首位', () => {
    const mounts = buildAgreeModuleMounts().map((m) => ({
      ...m,
      enabled: m.key === 'basic',
      region: 'tabs' as const,
      label: '协议概览',
    }));
    const items = resolveAgreeModulesForPage(
      [
        ...mounts,
        {
          key: 'custom_form_assessment',
          enabled: true,
          region: 'content',
          order: 0,
          span: 12,
          label: '评估资料',
          widgetKind: 'form',
        },
      ],
      ['Agree:*'],
    );
    expect(items.map((m) => [m.key, m.region, m.label, m.span])).toEqual([
      ['custom_form_assessment', 'content', '评估资料', 12],
      ['basic', 'tabs', '协议概览', 24],
    ]);
  });
  it('显式全部隐藏不能重新展示基础信息', () => {
    const mounts = buildAgreeModuleMounts().map((m) => ({
      ...m,
      enabled: false,
    }));
    expect(resolveAgreeModulesForPage(mounts, ['Agree:*'])).toEqual([]);
    expect(resolveMountedModuleKeys(mounts)).toEqual([]);
  });
  it('布局不能放宽模块权限，配置往返保留标识和位置', () => {
    const mounts = buildAgreeModuleMounts().map((m) => ({
      ...m,
      region: 'content' as const,
      span: 12,
    }));
    const restored = normalizeAgreeModuleMounts(
      JSON.parse(JSON.stringify(mounts)),
    );
    expect(restored.map((m) => m.key)).toEqual(mounts.map((m) => m.key));
    const visible = resolveAgreeModulesForPage(restored, [
      'Agree:Module:houses',
    ]);
    expect(visible.map((m) => [m.key, m.region, m.span])).toEqual([
      ['houses', 'content', 12],
    ]);
  });
});
