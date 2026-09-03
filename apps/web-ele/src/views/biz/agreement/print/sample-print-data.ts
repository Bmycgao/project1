import type { HouseRow } from '../types';
import type { AgreePrintData } from './types';

import { buildAgreementDetail } from '../mock-data';
import { buildAgreePrintData } from './build-print-data';

/**
 * 设计器 / 规则测试用样例协议详情（含双房屋、奖励项）
 */
export function buildDesignerSampleDetail() {
  const detail = buildAgreementDetail('PRINT-DEMO');
  const extraHouses: HouseRow[] = [
    {
      id: 'ph1',
      address: '1号楼101',
      certNo: 'C001',
      propertyType: '住宅',
      houseType: '住宅',
      buildArea: 86,
      expropriatedArea: 86,
      evalValue: 500_000,
    },
    {
      id: 'ph2',
      address: '1号楼102',
      certNo: 'C002',
      propertyType: '住宅',
      houseType: '住宅',
      buildArea: 45,
      expropriatedArea: 45,
      evalValue: 260_000,
    },
  ];
  if ((detail.houses?.length || 0) < 2) {
    detail.houses = extraHouses;
  }
  if (!detail.rewardItems?.length) {
    detail.rewardItems = [
      {
        id: 'r1',
        name: '签约奖励',
        amount: 50_000,
        condition: '按时签约',
        remark: '按时签约',
      },
    ];
  }
  detail.statusValue = detail.statusValue || '组长已复核';
  return detail;
}

/**
 * 设计器样例 printData
 */
export function buildDesignerSamplePrintData(): AgreePrintData {
  return buildAgreePrintData(buildDesignerSampleDetail());
}

export type ParsePrintDataResult =
  | { data: AgreePrintData; ok: true }
  | { message: string; ok: false };

/**
 * 解析数据源 JSON：与样例浅合并，缺的 key 用 fallback 补
 * @param raw 粘贴文本
 * @param fallback 缺省（通常是当前样例或协议转出来的 printData）
 */
export function parseAgreePrintDataJson(
  raw: string,
  fallback: AgreePrintData,
): ParsePrintDataResult {
  const text = String(raw || '').trim();
  if (!text) return { ok: false, message: '请粘贴数据源 JSON' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'JSON 格式不正确' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      message:
        '数据源须是一个对象，例如 { "compensatee": "张三", "houses": [] }',
    };
  }
  const bag = parsed as Record<string, unknown>;
  if (Array.isArray(bag.panels)) {
    return {
      ok: false,
      message:
        '这是模板 JSON（含 panels）。请用工具栏「编辑 JSON」，这里只贴打印数据',
    };
  }
  const data = { ...fallback, ...bag } as AgreePrintData;
  if ('houses' in bag && !Array.isArray(bag.houses)) {
    data.houses = fallback.houses;
  }
  if ('compensationItems' in bag && !Array.isArray(bag.compensationItems)) {
    data.compensationItems = fallback.compensationItems;
  }
  if ('rewardItems' in bag && !Array.isArray(bag.rewardItems)) {
    data.rewardItems = fallback.rewardItems;
  }
  if (!('hasRewards' in bag) && Array.isArray(data.rewardItems)) {
    data.hasRewards = data.rewardItems.length > 0;
  }
  return { ok: true, data };
}
