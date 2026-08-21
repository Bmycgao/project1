/**
 * FormCreate 生成规则（与设计器 getRule / 渲染器 :rule 对齐）
 */
export type FcRule = Record<string, any>;

/** 场景级：每个详情块一份 rule */
export type FcRuleMap = Record<string, FcRule[]>;

/** 渲染/设计器共用的表单 option */
export interface FcFormOption {
  submitBtn?: boolean | Record<string, unknown>;
  resetBtn?: boolean | Record<string, unknown>;
  form?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 判断是否为可用的 FormCreate rule
 * @param raw 原始值
 */
export function isFcRule(raw: unknown): raw is FcRule[] {
  return Array.isArray(raw) && raw.length > 0;
}

/**
 * 深拷贝 rule，避免设计器改到默认常量
 * @param rule 源
 */
export function cloneFcRule(rule: FcRule[]): FcRule[] {
  try {
    return JSON.parse(JSON.stringify(rule));
  } catch {
    return rule.map((item) => ({ ...item }));
  }
}

/**
 * 运行时默认 option：不展示提交/重置，由详情页模块保存
 */
export function buildFcFormOption(): FcFormOption {
  return {
    submitBtn: false,
    resetBtn: false,
    form: {
      labelWidth: '120px',
      labelPosition: 'right',
      size: 'default',
    },
  };
}
