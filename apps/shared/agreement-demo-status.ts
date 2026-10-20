/** 协议案例的展示字典；这些值不定义流程阶段，也不决定正文是否可编辑。 */
const DEMO_STATUSES = [
  ['草稿', 'info'],
  ['告知单', 'info'],
  ['待复核', 'warning'],
  ['待生效', 'warning'],
  ['已签约', 'success'],
  ['组长已复核', 'warning'],
  ['项目经理已审核', 'warning'],
  ['签约已确认', 'success'],
] as const;

export interface AgreementStatusOption {
  label: string;
  value: string;
}

export function buildAgreementDemoStatusOptions(): AgreementStatusOption[] {
  return DEMO_STATUSES.map(([value]) => ({ label: value, value }));
}

/** 补上缺失值以展示历史资料，保留配置的标签、顺序及附加属性，不改写原值。 */
export function appendAgreementStatusOptions<T extends AgreementStatusOption>(
  options: T[],
  values: readonly string[],
): (AgreementStatusOption | T)[] {
  const result: (AgreementStatusOption | T)[] = options.map((item) => ({
    ...item,
  }));
  const present = new Set(result.map((item) => item.value));
  for (const value of values) {
    if (!value || present.has(value)) continue;
    result.push({ label: value, value });
    present.add(value);
  }
  return result;
}

/** 显式配置的场景范围仍有效；未限定的列表使用完整演示字典并兼容历史值。 */
export function agreementStatusFilterOptions(
  statusIn?: string[],
  historicalValues: string[] = [],
): string[] {
  if (statusIn?.length) return [...new Set(statusIn)];
  return appendAgreementStatusOptions(
    buildAgreementDemoStatusOptions(),
    historicalValues,
  ).map((item) => item.value);
}

export function agreementStatusTagType(value: string) {
  return DEMO_STATUSES.find(([status]) => status === value)?.[1] ?? 'info';
}
