import type { AgreementDetail } from './agreement-detail-types';

import { describe, expect, it } from 'vitest';

import {
  projectAgreementDetailForCodes,
  restrictAgreementDetailWrite,
} from './agreement-detail-permissions';

describe('协议详情模块数据权限', () => {
  const detail = {
    agreementNo: 'A-1',
    basic: { agreementNo: 'A-1', agreementName: '测试' },
    houses: [{ id: 'H-1', address: '地址' }],
    extraForms: {
      custom_form_assessment: { amount: 100 },
      custom_form_water: { fee: 20 },
    },
    extraTables: {},
  } as unknown as AgreementDetail;

  it('读取只返回被授权的自定义模块数据', () => {
    const result = projectAgreementDetailForCodes(detail, [
      'Agree:Module:basic',
      'Agree:Module:custom_form_water',
    ]);
    expect(result.extraForms).toEqual({ custom_form_water: { fee: 20 } });
    expect(result.houses).toEqual([]);
    expect(result.basic.agreementName).toBe('测试');
  });

  it('整页保存不能改写无权限模块或清空其已有数据', () => {
    const result = restrictAgreementDetailWrite(
      {
        agreementNo: '篡改编号',
        houses: [],
        extraForms: {
          custom_form_assessment: { amount: 0 },
          custom_form_water: { fee: 25 },
        },
      },
      detail,
      ['Agree:Module:custom_form_water'],
    );
    expect(result.houses).toBeUndefined();
    expect(result.agreementNo).toBe('A-1');
    expect(result.extraForms).toEqual({
      custom_form_assessment: { amount: 100 },
      custom_form_water: { fee: 25 },
    });
  });
});
