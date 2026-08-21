/**
 * Epic 页面 Schema 类型与工具（与 epic-designer PageSchema 对齐）
 */
export interface EpicComponentSchema {
  type: string;
  id?: string;
  label?: string;
  field?: string;
  input?: boolean;
  props?: Record<string, unknown>;
  children?: EpicComponentSchema[];
  rules?: unknown[];
  [key: string]: unknown;
}

/** Epic 设计器导出的整页 JSON */
export interface EpicPageSchema {
  schemas: EpicComponentSchema[];
  script?: string;
  canvas?: {
    height?: string;
    mode?: 'desktop' | 'mobile' | 'pad' | 'pc' | 'tablet';
    width?: string;
  };
}

/**
 * 生成组件唯一 id
 * @param prefix 前缀
 */
export function epicId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 判断是否为可用的 Epic 页面 Schema
 * @param raw 原始对象
 */
export function isEpicPageSchema(raw: unknown): raw is EpicPageSchema {
  if (!raw || typeof raw !== 'object') return false;
  const schemas = (raw as EpicPageSchema).schemas;
  return Array.isArray(schemas) && schemas.length > 0;
}

/**
 * 深拷贝 Epic Schema（JSON 克隆，兼容 Vue Proxy，避免 structuredClone 报错）
 * @param schema 源
 */
export function cloneEpicPageSchema(schema: EpicPageSchema): EpicPageSchema {
  try {
    return JSON.parse(JSON.stringify(schema)) as EpicPageSchema;
  } catch {
    return {
      schemas: Array.isArray(schema?.schemas)
        ? schema.schemas.map((item) => ({ ...item }))
        : [],
      script: schema?.script,
      canvas: schema?.canvas ? { ...schema.canvas } : undefined,
    };
  }
}
