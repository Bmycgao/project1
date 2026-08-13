/**
 * 配置化列表：页面字段 Schema + 演示数据
 * 协议场景用 PS_AGREE_*；实体列表可由「页面配置」新建后挂到动态列表页
 */
import { readPersistJson, writePersistJson } from './mock-persist';

/** 列渲染类型 */
export type PageColumnType = 'text' | 'status' | 'tag';

/** 单个列表字段配置 */
export interface PageColumnSchema {
  /** 字段名（对应数据 key） */
  field: string;
  /** 列标题 */
  title: string;
  /** 是否在表格中显示 */
  visible: boolean;
  /** 列宽，可选 */
  width?: number;
  /** 最小列宽，可选 */
  minWidth?: number;
  /** 单元格类型 */
  cellType?: PageColumnType;
}

/** 查询表单字段 */
export interface PageQuerySchema {
  field: string;
  title: string;
  /** Input | Select */
  component: 'Input' | 'Select';
  /** Select 选项（status 等） */
  options?: { label: string; value: string | number }[];
}

/** 一整页列表配置 */
export interface PageSchema {
  id: string;
  /** 配置名称（内部） */
  name: string;
  /** 列表标题 */
  title: string;
  /** 备注说明 */
  remark?: string;
  status: 0 | 1;
  columns: PageColumnSchema[];
  queryFields: PageQuerySchema[];
  /** 演示数据条数种子 */
  mockCount?: number;
  /**
   * entity=独立实体列表；
   * template=列模板（只定义列）；
   * scene=场景视图（引用列模板，带 scene/按钮说明）
   */
  schemaKind?: 'entity' | 'scene' | 'template';
  /** scene 引用的列模板 ID */
  columnTemplateId?: string;
  /** 列表场景码，请求业务 list 时带上 */
  scene?: string;
  /** 工具栏按钮（场景配置，可带差异化 bind） */
  buttons?: {
    code: string;
    label: string;
    type?: string;
    group?: string;
    bind?: {
      api?: string;
      method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
      confirmText?: string;
      successMsg?: string;
      redirect?: string;
      showWhenStatusIn?: string[];
    };
  }[];
  /** 场景允许的状态值（数据范围；未知 scene 时按此过滤） */
  statusIn?: string[];
  /** 字段显隐/可编辑规则（列模板上配置，scene 合并时继承） */
  fieldRules?: {
    field: string;
    hidden?: boolean;
    visibleCodes?: string[];
    editableCodes?: string[];
    remark?: string;
    displayFormat?: {
      type?: 'date' | 'money' | 'text';
      datePattern?: 'YYYY-MM-DD' | 'YYYY年MM月DD日';
      thousandSeparator?: boolean;
      decimals?: number;
      prefix?: string;
    };
  }[];
  /**
   * 详情业务模块挂载（场景配置）
   * key 对齐协议 Agree:Module:*；enabled=false 表示本场景不挂载
   */
  modules?: {
    key: string;
    enabled: boolean;
    /** 显示顺序，越小越靠前 */
    order?: number;
    /** 栅格占比 8/12/16/24 */
    span?: number;
  }[];
}

/** 生成场景默认模块挂载（含顺序与整行占比） */
function buildModules(
  enabledKeys: string[],
): NonNullable<PageSchema['modules']> {
  const all = [
    'basic',
    'signing',
    'signMaterial',
    'certifyMaterial',
    'compensation',
  ];
  const set = new Set(enabledKeys);
  return all.map((key, index) => ({
    key,
    enabled: set.has(key),
    order: (index + 1) * 10,
    span: 24,
  }));
}

/**
 * 内置页面配置：以协议场景为主
 * 实体类 schema 可由「页面配置」新增；不再内置客户/物料演示
 */
export const MOCK_PAGE_SCHEMAS: PageSchema[] = [
  /** —— 协议：列模板 + 多场景（按钮/数据不同，列相同） —— */
  {
    id: 'PS_AGREE_COLS',
    name: 'agree_column_template',
    title: '协议列表列模板',
    remark: '共用表头：协议编号、被补偿人、地址等列；录入/审核/预览都沿用这套',
    status: 1,
    schemaKind: 'template',
    columns: [
      { field: 'agreementNo', title: '协议编号', visible: true, minWidth: 130 },
      { field: 'compensatee', title: '被补偿人', visible: true, minWidth: 100 },
      { field: 'houseAddress', title: '房屋地址', visible: true, minWidth: 200 },
      {
        field: 'statusValue',
        title: '状态值',
        visible: true,
        minWidth: 120,
        cellType: 'tag',
      },
      { field: 'signType', title: '签约类型', visible: true, minWidth: 110 },
      {
        field: 'isSigned',
        title: '是否签约',
        visible: true,
        minWidth: 100,
        cellType: 'tag',
      },
      { field: 'batchGroup', title: '批次分组', visible: true, minWidth: 110 },
    ],
    queryFields: [
      { field: 'keyword', title: '关键字', component: 'Input' },
    ],
    /** 字段权限演示：无对应 Agree:Field:* 则列表/详情隐藏或只读 */
    fieldRules: [
      {
        field: 'batchGroup',
        visibleCodes: ['Agree:Field:batchGroup'],
        remark: '列表-批次分组',
      },
      {
        field: 'phone',
        visibleCodes: ['Agree:Field:phone'],
        editableCodes: ['Agree:Field:phone'],
        remark: '电话',
      },
      {
        field: 'idNo',
        visibleCodes: ['Agree:Field:idNo'],
        editableCodes: ['Agree:Field:idNo'],
        remark: '证件号',
      },
      {
        field: 'amount',
        visibleCodes: ['Agree:Field:amount'],
        editableCodes: ['Agree:Field:amount'],
        remark: '补偿金额',
        displayFormat: {
          type: 'money',
          thousandSeparator: true,
          decimals: 2,
          prefix: '¥',
        },
      },
      {
        field: 'debtAmount',
        visibleCodes: ['Agree:Field:debtAmount'],
        editableCodes: ['Agree:Field:debtAmount'],
        remark: '债权金额',
        displayFormat: {
          type: 'money',
          thousandSeparator: true,
          decimals: 2,
          prefix: '¥',
        },
      },
      {
        field: 'signDate',
        remark: '签约日期',
        displayFormat: {
          type: 'date',
          datePattern: 'YYYY年MM月DD日',
        },
      },
    ],
  },
  {
    id: 'PS_AGREE_ENTRY',
    name: 'agree_entry',
    title: '协议信息录入',
    remark: '给录入岗：新增/修改/提交复核等；只看告知单、待复核、草稿',
    status: 1,
    schemaKind: 'scene',
    columnTemplateId: 'PS_AGREE_COLS',
    scene: 'entry',
    columns: [],
    queryFields: [
      { field: 'keyword', title: '关键字', component: 'Input' },
    ],
    statusIn: ['告知单', '待复核', '草稿'],
    buttons: [
      { code: 'add', label: '新增', type: 'primary', group: 'main' },
      { code: 'delete', label: '删除', type: 'danger', group: 'main' },
      { code: 'edit', label: '修改', group: 'main' },
      {
        code: 'submitReview',
        label: '提交复核',
        group: 'main',
        /** 差异化：仅告知单/草稿可提交；走批量提交接口 */
        bind: {
          api: '/biz/agreement/batch-submit',
          method: 'POST',
          confirmText: '确认将勾选协议提交复核？',
          successMsg: '已提交复核',
          showWhenStatusIn: ['告知单', '草稿'],
        },
      },
      { code: 'export', label: '导出', group: 'main' },
      { code: 'conditionalSign', label: '附条件签约', group: 'more' },
      { code: 'rejectRecord', label: '驳回记录', group: 'more' },
      { code: 'rejectPrev', label: '驳回前期', group: 'more' },
      { code: 'preview1', label: '附件一预览', group: 'more' },
      { code: 'preview2', label: '附件二预览', group: 'more' },
    ],
    /** 录入：详情挂载全部区域 */
    modules: buildModules([
      'basic',
      'signing',
      'signMaterial',
      'certifyMaterial',
      'compensation',
    ]),
  },
  {
    id: 'PS_AGREE_LAWYER',
    name: 'agree_lawyer_audit',
    title: '小组律师审核',
    remark: '给律师审核岗：通过/驳回/附件预览；只看「组长已复核」的数据',
    status: 1,
    schemaKind: 'scene',
    columnTemplateId: 'PS_AGREE_COLS',
    scene: 'lawyer_audit',
    columns: [],
    queryFields: [
      { field: 'keyword', title: '关键字', component: 'Input' },
    ],
    statusIn: ['组长已复核'],
    buttons: [
      {
        code: 'approve',
        label: '审核通过',
        type: 'primary',
        group: 'main',
        bind: {
          api: '/biz/agreement/approve',
          method: 'POST',
          confirmText: '确认审核通过所选协议？',
          successMsg: '已审核通过',
          showWhenStatusIn: ['组长已复核'],
        },
      },
      {
        code: 'reject',
        label: '驳回',
        group: 'main',
        bind: {
          api: '/biz/agreement/reject',
          method: 'POST',
          confirmText: '确认驳回所选协议？',
          successMsg: '已驳回',
          showWhenStatusIn: ['组长已复核'],
        },
      },
      { code: 'rejectRecord', label: '驳回记录', group: 'main' },
      { code: 'preview1', label: '附件一预览', group: 'more' },
      { code: 'preview2', label: '附件二预览', group: 'more' },
      { code: 'ticket1', label: '房票附件一', group: 'more' },
      { code: 'ticket2', label: '房票附件二', group: 'more' },
    ],
    /** 律师审核：详情挂载全部区域 */
    modules: buildModules([
      'basic',
      'signing',
      'signMaterial',
      'certifyMaterial',
      'compensation',
    ]),
  },
  {
    id: 'PS_AGREE_PREVIEW',
    name: 'agree_preview',
    title: '协议信息预览',
    remark: '给查询岗：预览/预保存等；数据范围较宽',
    status: 1,
    schemaKind: 'scene',
    columnTemplateId: 'PS_AGREE_COLS',
    scene: 'preview',
    columns: [],
    queryFields: [
      { field: 'keyword', title: '关键字', component: 'Input' },
    ],
    buttons: [
      { code: 'preSave', label: '协议预保存', group: 'main' },
      { code: 'companyAgree', label: '公司协议', group: 'main' },
      { code: 'unlicensedAgree', label: '无证协议', group: 'main' },
      { code: 'previewSupply', label: '补充协议预览', group: 'more' },
      { code: 'previewChange', label: '变更协议预览', group: 'more' },
      { code: 'previewAgree', label: '协议预览', group: 'more' },
    ],
    /** 预览：基础/签约半宽并排，补偿整行 */
    modules: buildModules(['basic', 'signing', 'compensation']).map((m) => ({
      ...m,
      span: m.key === 'compensation' ? 24 : 12,
    })),
  },
  {
    id: 'PS_AGREE_VIEW',
    name: 'agree_view',
    title: '查看',
    remark: '给查询岗：按钮很少（如修改）；数据范围较宽',
    status: 1,
    schemaKind: 'scene',
    columnTemplateId: 'PS_AGREE_COLS',
    scene: 'view',
    columns: [],
    queryFields: [
      { field: 'keyword', title: '关键字', component: 'Input' },
    ],
    buttons: [
      { code: 'edit', label: '修改', group: 'main' },
      { code: 'export', label: '导出', group: 'main' },
    ],
    /** 查看：仅基础 + 签约；半宽并排演示占比 */
    modules: buildModules(['basic', 'signing']).map((m) => ({
      ...m,
      span: 12,
    })),
  },
];

/** 单条配置历史快照 */
export interface PageSchemaHistoryItem {
  versionId: string;
  schemaId: string;
  savedAt: string;
  /** 保存前的完整配置 */
  snapshot: PageSchema;
}

const HISTORY_LIMIT = 10;
const PERSIST_FILE = 'page-schema.json';

/** 运行时可变的 schema 列表（增删改直接改这份） */
export let pageSchemaStore: PageSchema[] = structuredClone(MOCK_PAGE_SCHEMAS);

/** schemaId → 历史版本（新在前） */
export let pageSchemaHistory: Record<string, PageSchemaHistoryItem[]> = {};

/** 下一新建 ID 从 PS1101 起 */
let schemaIdSeed = 1101;

/**
 * 从磁盘恢复页面配置与历史（无文件则保持种子）
 */
function hydratePageSchemaFromDisk() {
  const saved = readPersistJson<{
    history?: Record<string, PageSchemaHistoryItem[]>;
    schemaIdSeed?: number;
    schemas?: PageSchema[];
  }>(PERSIST_FILE);
  if (!saved?.schemas?.length) return;
  pageSchemaStore = saved.schemas;
  pageSchemaHistory = saved.history || {};
  if (typeof saved.schemaIdSeed === 'number') {
    schemaIdSeed = saved.schemaIdSeed;
  }
  // 旧落盘缺 modules 时，用种子补齐场景挂载
  ensureSceneModulesFromSeed();
  // 旧落盘 fieldRules 缺 displayFormat / signDate 时补齐
  ensureFieldFormatsFromSeed();
}

/**
 * 给已落盘场景补 modules；已有 modules 缺 order/span 时补默认布局
 */
function ensureSceneModulesFromSeed() {
  let changed = false;
  for (const seed of MOCK_PAGE_SCHEMAS) {
    if (seed.schemaKind !== 'scene' || !seed.modules?.length) continue;
    const idx = pageSchemaStore.findIndex(
      (s) => String(s.id) === String(seed.id),
    );
    if (idx < 0) continue;
    const current = pageSchemaStore[idx]!;
    if (!current.modules?.length) {
      pageSchemaStore[idx] = {
        ...current,
        modules: structuredClone(seed.modules),
      };
      changed = true;
      continue;
    }
    // 补齐 order / span，不覆盖已有布局值
    const next = current.modules.map((m, i) => {
      const seedItem = seed.modules?.find((s) => s.key === m.key);
      const order =
        typeof m.order === 'number'
          ? m.order
          : (seedItem?.order ?? (i + 1) * 10);
      const span =
        typeof m.span === 'number' ? m.span : (seedItem?.span ?? 24);
      if (m.order === order && m.span === span) return m;
      changed = true;
      return { ...m, order, span };
    });
    if (changed) {
      pageSchemaStore[idx] = { ...current, modules: next };
    }
  }
  if (changed) persistPageSchemaStore();
}

/**
 * 给列模板补齐 displayFormat / 新字段规则（金额、日期演示）
 */
function ensureFieldFormatsFromSeed() {
  const seed = MOCK_PAGE_SCHEMAS.find((s) => s.id === 'PS_AGREE_COLS');
  if (!seed?.fieldRules?.length) return;
  const idx = pageSchemaStore.findIndex((s) => String(s.id) === 'PS_AGREE_COLS');
  if (idx < 0) return;
  const cur = pageSchemaStore[idx]!;
  const curRules = cur.fieldRules || [];
  let changed = false;
  const next = structuredClone(curRules);

  for (const sr of seed.fieldRules) {
    const hit = next.find((r) => r.field === sr.field);
    if (!hit) {
      next.push(structuredClone(sr));
      changed = true;
      continue;
    }
    if (sr.displayFormat && !hit.displayFormat) {
      hit.displayFormat = structuredClone(sr.displayFormat);
      changed = true;
    }
  }

  if (changed) {
    pageSchemaStore[idx] = { ...cur, fieldRules: next };
    persistPageSchemaStore();
  }
}

/**
 * 落盘当前配置与历史
 */
function persistPageSchemaStore() {
  writePersistJson(PERSIST_FILE, {
    schemas: pageSchemaStore,
    history: pageSchemaHistory,
    schemaIdSeed,
  });
}

hydratePageSchemaFromDisk();

const historyTimeFmt = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * 推入一条历史（更新前调用）
 * @param prev 更新前配置
 */
function pushHistory(prev: PageSchema) {
  const schemaId = String(prev.id);
  const list = pageSchemaHistory[schemaId] || [];
  list.unshift({
    versionId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    schemaId,
    savedAt: historyTimeFmt.format(new Date()),
    snapshot: structuredClone(prev),
  });
  pageSchemaHistory[schemaId] = list.slice(0, HISTORY_LIMIT);
}

/**
 * 列出某配置的历史版本
 * @param schemaId 配置 ID
 */
export function listPageSchemaHistory(schemaId: string) {
  return structuredClone(pageSchemaHistory[String(schemaId)] || []);
}

/**
 * 回滚到指定历史版本（当前态先入历史）
 * @param schemaId 配置 ID
 * @param versionId 版本 ID
 */
export function rollbackPageSchema(schemaId: string, versionId: string) {
  const list = pageSchemaHistory[String(schemaId)] || [];
  const hit = list.find((h) => h.versionId === versionId);
  if (!hit) return null;
  const idx = pageSchemaStore.findIndex(
    (item) => String(item.id) === String(schemaId),
  );
  if (idx < 0) return null;
  pushHistory(pageSchemaStore[idx]!);
  pageSchemaStore[idx] = {
    ...structuredClone(hit.snapshot),
    id: schemaId,
  };
  persistPageSchemaStore();
  return pageSchemaStore[idx];
}

/**
 * 按 id 查找页面配置；scene 类型自动合并列模板的 columns
 * @param id 配置 ID
 */
export function findPageSchema(id: string) {
  const node =
    pageSchemaStore.find((item) => String(item.id) === String(id)) || null;
  if (!node) return null;
  if (node.schemaKind === 'scene' && node.columnTemplateId) {
    const tpl = pageSchemaStore.find(
      (item) => String(item.id) === String(node.columnTemplateId),
    );
    if (tpl?.columns?.length) {
      return {
        ...node,
        columns: structuredClone(tpl.columns),
        fieldRules: node.fieldRules?.length
          ? node.fieldRules
          : structuredClone(tpl.fieldRules || []),
        queryFields: node.queryFields?.length
          ? node.queryFields
          : structuredClone(tpl.queryFields || []),
      };
    }
  }
  return node;
}

/**
 * 创建页面配置
 * @param data 表单数据
 */
export function createPageSchema(data: Partial<PageSchema>) {
  const id = `PS${schemaIdSeed++}`;
  const kind = data.schemaKind || 'entity';
  const defaultColumns: PageSchema['columns'] = [
    { field: 'name', title: '名称', visible: true, width: 160 },
    {
      field: 'status',
      title: '状态',
      visible: true,
      width: 100,
      cellType: 'status',
    },
    { field: 'remark', title: '备注', visible: true },
    { field: 'createTime', title: '创建时间', visible: true, width: 180 },
  ];
  const node: PageSchema = {
    id,
    name: data.name || `page_${id}`,
    title: data.title || '未命名列表',
    remark: data.remark || '',
    status: (data.status ?? 1) as 0 | 1,
    schemaKind: kind,
    columnTemplateId: data.columnTemplateId,
    scene: data.scene,
    buttons: data.buttons,
    statusIn: data.statusIn,
    // 场景：列由模板提供，允许空 columns
    columns:
      kind === 'scene'
        ? data.columns || []
        : data.columns?.length
          ? data.columns
          : defaultColumns,
    queryFields: data.queryFields?.length
      ? data.queryFields
      : [{ field: 'name', title: '名称', component: 'Input' }],
    fieldRules: data.fieldRules,
    modules: data.modules,
    mockCount: data.mockCount ?? 40,
  };
  pageSchemaStore.push(node);
  persistPageSchemaStore();
  return node;
}

/**
 * 更新页面配置
 * @param id 配置 ID
 * @param data 表单数据
 */
export function updatePageSchema(id: string, data: Partial<PageSchema>) {
  const idx = pageSchemaStore.findIndex((item) => String(item.id) === String(id));
  if (idx < 0) return null;
  const prev = pageSchemaStore[idx]!;
  pushHistory(prev);
  pageSchemaStore[idx] = {
    ...prev,
    ...data,
    id: prev.id,
    columns: data.columns ?? prev.columns,
    queryFields: data.queryFields ?? prev.queryFields,
    fieldRules:
      data.fieldRules !== undefined ? data.fieldRules : prev.fieldRules,
    modules: data.modules !== undefined ? data.modules : prev.modules,
  };
  persistPageSchemaStore();
  return pageSchemaStore[idx];
}

/**
 * 删除页面配置
 * @param id 配置 ID
 */
export function removePageSchema(id: string) {
  const before = pageSchemaStore.length;
  pageSchemaStore = pageSchemaStore.filter((item) => String(item.id) !== String(id));
  delete pageSchemaHistory[String(id)];
  if (pageSchemaStore.length < before) {
    persistPageSchemaStore();
  }
  return pageSchemaStore.length < before;
}

const formatterCN = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** 按 schema 缓存生成的演示行数据 */
const dataCache = new Map<string, Record<string, any>[]>();

/**
 * 生成/获取某配置下的演示列表数据（按列字段生成通用行，供动态列表页使用）
 * @param schema 页面配置
 */
export function getDynamicRows(schema: PageSchema) {
  const cached = dataCache.get(schema.id);
  if (cached) return cached;

  const count = schema.mockCount ?? 20;
  const rows: Record<string, any>[] = [];
  const visibleFields = (schema.columns || [])
    .filter((c) => c.visible !== false)
    .map((c) => c.field);

  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const row: Record<string, any> = {
      id: `${schema.id}-${n}`,
    };
    for (const field of visibleFields) {
      if (field === 'status') {
        row[field] = i % 5 === 0 ? 0 : 1;
      } else if (field === 'createTime') {
        row[field] = formatterCN.format(
          new Date(2023, i % 12, (i % 27) + 1, 9, 30, 0),
        );
      } else if (field === 'stock') {
        row[field] = Math.floor(Math.random() * 5000);
      } else {
        row[field] = `${field}-${n}`;
      }
    }
    // 查询字段兜底，避免筛选项无 key
    for (const q of schema.queryFields || []) {
      if (row[q.field] === undefined) {
        row[q.field] = `${q.field}-${n}`;
      }
    }
    rows.push(row);
  }

  dataCache.set(schema.id, rows);
  return rows;
}

/**
 * 配置更新后清缓存，使列表数据字段与配置一致
 * @param schemaId 配置 ID
 */
export function invalidateDynamicData(schemaId?: string) {
  if (schemaId) {
    dataCache.delete(schemaId);
  } else {
    dataCache.clear();
  }
}
