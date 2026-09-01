import type { AgreementDetail } from '../types';
import type { AgreePrintData, AgreePrintMoneyRow } from './types';

/**
 * 数字转中文大写金额（协议打印用，覆盖常见整数与两位小数）
 * @param value 金额
 */
function toAmountCn(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '零元整';
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const bigUnits = ['', '万', '亿'];
  const neg = num < 0 ? '负' : '';
  const abs = Math.abs(num);
  const intPart = Math.floor(abs);
  const fen = Math.round((abs - intPart) * 100);

  /** 四位一组转中文 */
  const sectionToCn = (n: number): string => {
    if (n === 0) return '';
    let str = '';
    let zero = false;
    for (let i = 0; i < 4; i++) {
      const d = Math.floor(n / 10 ** (3 - i)) % 10;
      if (d === 0) {
        zero = str.length > 0;
      } else {
        if (zero) str += '零';
        str += (digits[d] ?? '') + (units[3 - i] ?? '');
        zero = false;
      }
    }
    return str;
  };

  let intStr = '';
  if (intPart === 0) {
    intStr = '零';
  } else {
    const parts: number[] = [];
    let rest = intPart;
    while (rest > 0) {
      parts.push(rest % 10_000);
      rest = Math.floor(rest / 10_000);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part === undefined) continue;
      const sec = sectionToCn(part);
      if (sec) {
        intStr += sec + bigUnits[i];
      } else if (i > 0 && intStr && !intStr.endsWith('零')) {
        intStr += '零';
      }
    }
  }

  let result = `${neg}${intStr}元`;
  if (fen === 0) {
    result += '整';
  } else {
    const jiao = Math.floor(fen / 10);
    const fenDigit = fen % 10;
    if (jiao) result += `${digits[jiao]}角`;
    if (fenDigit) result += `${digits[fenDigit]}分`;
  }
  return result;
}

/** 安全取展示值 */
function text(v: unknown, fallback = '—'): string {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

/** 累加行金额 */
function sumAmount(
  rows: null | undefined | { amount?: number | string }[],
): number {
  if (!rows?.length) return 0;
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

/**
 * 将协议详情组装为 hiprint 打印数据 JSON
 * @param detail 协议详情
 */
export function buildAgreePrintData(detail: AgreementDetail): AgreePrintData {
  const basic = detail.basic || ({} as AgreementDetail['basic']);
  const householdName = text(basic.compensatee, '—');
  const houses = (detail.houses || []).map((h, i) => ({
    householdName,
    index: i + 1,
    address: text(h.address),
    certNo: text(h.certNo),
    houseType: text(h.houseType || h.propertyType),
    buildArea: h.buildArea ?? '—',
    expropriatedArea: h.expropriatedArea ?? '—',
    evalValue: h.evalValue ?? '—',
  }));

  const compensationItems: AgreePrintMoneyRow[] = (
    detail.compensationItems || []
  ).map((row, i) => ({
    index: i + 1,
    name: text(row.name),
    calcType: text(row.calcType),
    quantity: row.quantity ?? '—',
    unitPrice: row.unitPrice ?? '—',
    amount: row.amount ?? 0,
    remark: text(row.remark, ''),
  }));

  const rewardItems: AgreePrintMoneyRow[] = (detail.rewardItems || []).map(
    (row, i) => ({
      index: i + 1,
      name: text(row.name),
      amount: row.amount ?? 0,
      remark: text(row.remark || row.condition, ''),
    }),
  );

  const compensationTotal = sumAmount(detail.compensationItems);
  const rewardTotal = sumAmount(detail.rewardItems);
  const amount =
    basic.amount !== undefined && basic.amount !== ''
      ? basic.amount
      : compensationTotal + rewardTotal;

  const agreementNo = text(detail.agreementNo || basic.agreementNo, '');
  const compensatee = text(basic.compensatee);
  const totalBuildArea = houses.reduce(
    (s, h) => s + (Number(h.buildArea) || 0),
    0,
  );
  const totalEvalValue = houses.reduce(
    (s, h) => s + (Number(h.evalValue) || 0),
    0,
  );
  const amountNum = Number(amount) || 0;

  return {
    agreementNo,
    agreementName: text(basic.agreementName, '征收补偿协议'),
    compensatee,
    acquirer: text(basic.acquirer),
    department: text(basic.department),
    signDate: text(basic.signDate),
    statusValue: text(detail.statusValue || basic.statusValue),
    amount,
    amountCn: toAmountCn(amount),
    remark: text(basic.remark, ''),
    houses,
    compensationItems,
    rewardItems,
    compensationTotal,
    rewardTotal,
    hasRewards: rewardItems.length > 0,
    isHighAmount: amountNum > 500_000,
    qrcodeContent: `AGREE:${agreementNo}|${compensatee}`,
    barcodeContent: agreementNo,
    houseCount: houses.length,
    totalBuildArea,
    totalEvalValue,
    printMeta: `${text(basic.agreementName, '协议')}|${agreementNo}|${compensatee}`,
  };
}
