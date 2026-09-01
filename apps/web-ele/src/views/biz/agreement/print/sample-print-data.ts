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
