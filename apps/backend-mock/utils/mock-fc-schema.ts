/**
 * FormCreate 表单/表格模板库（独立于 page-schema）
 * 页面配置通过 fcBindings 引用模板 id
 */
import { readPersistJson, writePersistJson } from './mock-persist';

/** 单条 FormCreate 模板 */
export interface FcSchema {
  id: string;
  /** 模板名称 */
  name: string;
  /** 表单 or 表格表单 */
  kind: 'form' | 'table';
  remark?: string;
  status: 0 | 1;
  /** FormCreate getRule 结构 */
  rule: Record<string, any>[];
  /** 渲染 option，可选 */
  option?: Record<string, unknown>;
  updatedAt?: string;
}

const PERSIST_FILE = 'fc-schema.json';

/** 内置 5 块默认模板 id */
export const FC_SCHEMA_IDS = {
  basic: 'FC_BASIC',
  population: 'FC_POPULATION',
  houses: 'FC_HOUSES',
  compensation: 'FC_COMPENSATION',
  rewards: 'FC_REWARDS',
} as const;

/** 内置块默认绑定 */
export const DEFAULT_FC_BINDINGS: Record<string, string> = {
  basic: FC_SCHEMA_IDS.basic,
  population: FC_SCHEMA_IDS.population,
  houses: FC_SCHEMA_IDS.houses,
  compensation: FC_SCHEMA_IDS.compensation,
  rewards: FC_SCHEMA_IDS.rewards,
};

/**
 * 种子 rule（与前端 default-rules 对齐，mock 侧独立一份避免跨包引用）
 */
function buildSeedRules(): Record<string, Record<string, any>[]> {
  const statusOptions = [
    { label: '告知单', value: '告知单' },
    { label: '待复核', value: '待复核' },
    { label: '待生效', value: '待生效' },
    { label: '已签约', value: '已签约' },
    { label: '组长已复核', value: '组长已复核' },
  ];
  const field = (opts: {
    field: string;
    options?: { label: string; value: string }[];
    required?: boolean;
    span?: number;
    title: string;
    type?: string;
  }) => ({
    type: opts.type || 'input',
    field: opts.field,
    title: opts.title,
    col: { span: opts.span ?? 8 },
    props: { placeholder: `请输入${opts.title}` },
    ...(opts.required ? { $required: true } : {}),
    ...(opts.options ? { options: opts.options } : {}),
  });
  const tableCol = (opts: {
    field: string;
    label: string;
    required?: boolean;
    width?: string;
  }) => ({
    label: opts.label,
    required: !!opts.required,
    align: 'left',
    style: { width: opts.width || '140px', color: '' },
    rule: [
      {
        type: 'input',
        field: opts.field,
        title: opts.label,
        props: { placeholder: `请输入${opts.label}` },
        ...(opts.required ? { $required: true } : {}),
      },
    ],
  });
  const tableForm = (
    fieldKey: string,
    title: string,
    columns: ReturnType<typeof tableCol>[],
  ) => [
    {
      type: 'tableForm',
      field: fieldKey,
      title,
      info: '',
      props: {
        addable: true,
        deletable: true,
        showIndex: true,
        columns,
      },
      children: [],
    },
  ];

  return {
    [FC_SCHEMA_IDS.basic]: [
      field({ field: 'agreementNo', title: '协议编号', required: true }),
      field({ field: 'agreementName', title: '协议名称', required: true }),
      field({ field: 'department', title: '所属部门' }),
      field({ field: 'acquirer', title: '征收人' }),
      field({ field: 'compensatee', title: '被征收人' }),
      field({ field: 'amount', title: '协议金额' }),
      field({ type: 'datePicker', field: 'signDate', title: '签约日期' }),
      field({
        type: 'radio',
        field: 'statusValue',
        title: '状态',
        span: 16,
        options: statusOptions,
      }),
      field({
        type: 'textarea',
        field: 'remark',
        title: '备注',
        span: 24,
      }),
    ],
    [FC_SCHEMA_IDS.population]: [
      field({ field: 'headName', title: '户主姓名', required: true }),
      field({ field: 'idNo', title: '身份证号' }),
      field({ field: 'familySize', title: '家庭人口' }),
      field({ field: 'phone', title: '联系电话' }),
      field({ field: 'hukouAddress', title: '户籍地址', span: 16 }),
      field({ type: 'textarea', field: 'remark', title: '备注', span: 24 }),
    ],
    [FC_SCHEMA_IDS.houses]: tableForm('houses', '房屋信息', [
      tableCol({
        label: '房屋地址',
        field: 'address',
        width: '180px',
        required: true,
      }),
      tableCol({ label: '权证号', field: 'certNo' }),
      tableCol({ label: '产权性质', field: 'propertyType' }),
      tableCol({ label: '建筑面积', field: 'buildArea', width: '110px' }),
      tableCol({
        label: '征收面积',
        field: 'expropriatedArea',
        width: '110px',
      }),
      tableCol({ label: '房屋类型', field: 'houseType' }),
      tableCol({ label: '结构', field: 'structure', width: '100px' }),
      tableCol({ label: '评估价值', field: 'evalValue', width: '120px' }),
    ]),
    [FC_SCHEMA_IDS.compensation]: tableForm('compensationItems', '补偿安置', [
      tableCol({ label: '补偿项目', field: 'name', required: true }),
      tableCol({ label: '计算方式', field: 'calcType' }),
      tableCol({ label: '数量', field: 'quantity', width: '90px' }),
      tableCol({ label: '单价', field: 'unitPrice', width: '110px' }),
      tableCol({ label: '金额', field: 'amount', width: '120px' }),
      tableCol({ label: '备注', field: 'remark', width: '160px' }),
    ]),
    [FC_SCHEMA_IDS.rewards]: tableForm('rewardItems', '奖励补贴', [
      tableCol({ label: '奖励项目', field: 'name', required: true }),
      tableCol({ label: '条件', field: 'condition' }),
      tableCol({ label: '金额', field: 'amount', width: '120px' }),
      tableCol({ label: '备注', field: 'remark', width: '160px' }),
    ]),
  };
}

const SEED_RULES = buildSeedRules();

const MOCK_FC_SCHEMAS: FcSchema[] = [
  {
    id: FC_SCHEMA_IDS.basic,
    name: '协议基础信息表单',
    kind: 'form',
    status: 1,
    rule: SEED_RULES[FC_SCHEMA_IDS.basic] || [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: FC_SCHEMA_IDS.population,
    name: '协议人口表单',
    kind: 'form',
    status: 1,
    rule: SEED_RULES[FC_SCHEMA_IDS.population] || [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: FC_SCHEMA_IDS.houses,
    name: '房屋信息表格',
    kind: 'table',
    status: 1,
    rule: SEED_RULES[FC_SCHEMA_IDS.houses] || [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: FC_SCHEMA_IDS.compensation,
    name: '补偿安置表格',
    kind: 'table',
    status: 1,
    rule: SEED_RULES[FC_SCHEMA_IDS.compensation] || [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: FC_SCHEMA_IDS.rewards,
    name: '奖励补贴表格',
    kind: 'table',
    status: 1,
    rule: SEED_RULES[FC_SCHEMA_IDS.rewards] || [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/** 运行时可变模板列表 */
export const fcSchemaStore: FcSchema[] = structuredClone(MOCK_FC_SCHEMAS);

/**
 * 原地替换模板列表，避免 export let 重赋值
 * @param next 新列表
 */
function replaceFcSchemaStore(next: FcSchema[]) {
  fcSchemaStore.length = 0;
  fcSchemaStore.push(...next);
}

let fcSchemaIdSeed = 1001;

/**
 * 从磁盘恢复模板库
 */
function hydrateFcSchemaFromDisk() {
  const saved = readPersistJson<{
    fcSchemaIdSeed?: number;
    schemas?: FcSchema[];
  }>(PERSIST_FILE);
  if (!saved?.schemas?.length) return;
  replaceFcSchemaStore(saved.schemas);
  if (typeof saved.fcSchemaIdSeed === 'number') {
    fcSchemaIdSeed = saved.fcSchemaIdSeed;
  }
  ensureBuiltinFcSchemas();
}

/** 落盘缺内置模板时补种 */
function ensureBuiltinFcSchemas() {
  let changed = false;
  for (const seed of MOCK_FC_SCHEMAS) {
    const idx = fcSchemaStore.findIndex((s) => s.id === seed.id);
    if (idx === -1) {
      fcSchemaStore.push(structuredClone(seed));
      changed = true;
    }
  }
  if (changed) persistFcSchemaStore();
}

function persistFcSchemaStore() {
  writePersistJson(PERSIST_FILE, {
    fcSchemaIdSeed,
    schemas: fcSchemaStore,
  });
}

hydrateFcSchemaFromDisk();

/**
 * 按 id 查模板
 * @param id 模板 id
 */
export function findFcSchema(id: string) {
  return fcSchemaStore.find((s) => String(s.id) === String(id)) || null;
}

/**
 * 列表（可选 kind / keyword 过滤）
 */
export function listFcSchemas(query?: {
  keyword?: string;
  kind?: string;
  status?: string;
}) {
  let list = structuredClone(fcSchemaStore);
  if (query?.keyword) {
    const kw = String(query.keyword);
    list = list.filter(
      (s) =>
        s.name.includes(kw) ||
        s.id.includes(kw) ||
        (s.remark || '').includes(kw),
    );
  }
  if (query?.kind === 'form' || query?.kind === 'table') {
    list = list.filter((s) => s.kind === query.kind);
  }
  if (['0', '1'].includes(String(query?.status))) {
    list = list.filter((s) => s.status === Number(query?.status));
  }
  return list;
}

/**
 * 新建模板
 */
export function createFcSchema(
  data: Omit<FcSchema, 'id' | 'updatedAt'> & { id?: string },
) {
  const id = data.id?.trim() || `FC${fcSchemaIdSeed++}`;
  const node: FcSchema = {
    id,
    name: data.name || '未命名模板',
    kind: data.kind === 'table' ? 'table' : 'form',
    remark: data.remark || '',
    status: (data.status ?? 1) as 0 | 1,
    rule: Array.isArray(data.rule) && data.rule.length > 0 ? data.rule : [],
    option: data.option,
    updatedAt: new Date().toISOString(),
  };
  fcSchemaStore.push(node);
  persistFcSchemaStore();
  return node;
}

/**
 * 更新模板
 */
export function updateFcSchema(id: string, data: Partial<FcSchema>) {
  const idx = fcSchemaStore.findIndex((s) => String(s.id) === String(id));
  if (idx === -1) return null;
  const current = fcSchemaStore[idx];
  if (!current) return null;
  fcSchemaStore[idx] = {
    ...current,
    ...data,
    id: current.id,
    rule: data.rule === undefined ? current.rule : data.rule,
    updatedAt: new Date().toISOString(),
  };
  persistFcSchemaStore();
  return fcSchemaStore[idx];
}

/**
 * 删除模板（内置 5 块不可删）
 */
export function removeFcSchema(id: string) {
  const builtin = new Set(Object.values(FC_SCHEMA_IDS));
  if (builtin.has(id as (typeof FC_SCHEMA_IDS)[keyof typeof FC_SCHEMA_IDS])) {
    return false;
  }
  const before = fcSchemaStore.length;
  replaceFcSchemaStore(
    fcSchemaStore.filter((s) => String(s.id) !== String(id)),
  );
  if (fcSchemaStore.length < before) {
    persistFcSchemaStore();
    return true;
  }
  return false;
}

/**
 * 给 page-schema 模块列表生成默认 fcBindings
 * @param moduleKeys 已挂载模块 key
 */
export function buildDefaultFcBindingsForModules(
  moduleKeys: string[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const key of moduleKeys) {
    const bound = DEFAULT_FC_BINDINGS[key];
    if (bound) {
      map[key] = bound;
    }
  }
  return map;
}
