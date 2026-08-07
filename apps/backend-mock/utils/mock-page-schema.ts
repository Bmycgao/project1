/**
 * 配置化列表：页面字段 Schema + 演示数据
 * 非开发人员通过「页面配置」改列/查询项，菜单挂到通用动态列表页即可
 */

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
  /** 工具栏按钮（场景配置） */
  buttons?: {
    code: string;
    label: string;
    type?: string;
    group?: string;
  }[];
  /** 场景允许的状态值（数据范围；未知 scene 时按此过滤） */
  statusIn?: string[];
}

/** 内置演示配置：同一动态列表页 + 不同字段方案 */
export const MOCK_PAGE_SCHEMAS: PageSchema[] = [
  {
    id: 'PS1001',
    name: 'customer_list',
    title: '客户列表',
    remark: '普通列表示例：自己配置有哪些表格列',
    status: 1,
    mockCount: 48,
    columns: [
      { field: 'code', title: '客户编号', visible: true, width: 120 },
      { field: 'name', title: '客户名称', visible: true, width: 160 },
      { field: 'level', title: '等级', visible: true, width: 100, cellType: 'tag' },
      { field: 'status', title: '状态', visible: true, width: 100, cellType: 'status' },
      { field: 'contact', title: '联系人', visible: true, width: 120 },
      { field: 'phone', title: '手机号', visible: true, width: 140 },
      { field: 'remark', title: '备注', visible: true, minWidth: 160 },
      { field: 'createTime', title: '创建时间', visible: true, width: 180 },
    ],
    queryFields: [
      { field: 'name', title: '客户名称', component: 'Input' },
      {
        field: 'status',
        title: '状态',
        component: 'Select',
        options: [
          { label: '启用', value: 1 },
          { label: '禁用', value: 0 },
        ],
      },
    ],
  },
  {
    id: 'PS1002',
    name: 'material_list',
    title: '物料列表',
    remark: '普通列表示例：另一套字段，同一动态列表页渲染',
    status: 1,
    mockCount: 60,
    columns: [
      { field: 'code', title: '物料编码', visible: true, width: 130 },
      { field: 'name', title: '物料名称', visible: true, width: 160 },
      { field: 'spec', title: '规格', visible: true, width: 120 },
      { field: 'unit', title: '单位', visible: true, width: 80 },
      { field: 'stock', title: '库存', visible: true, width: 100 },
      { field: 'status', title: '状态', visible: true, width: 100, cellType: 'status' },
      { field: 'remark', title: '备注', visible: false },
      { field: 'createTime', title: '创建时间', visible: true, width: 180 },
    ],
    queryFields: [
      { field: 'code', title: '物料编码', component: 'Input' },
      { field: 'name', title: '物料名称', component: 'Input' },
      {
        field: 'status',
        title: '状态',
        component: 'Select',
        options: [
          { label: '启用', value: 1 },
          { label: '禁用', value: 0 },
        ],
      },
    ],
  },
  {
    id: 'PS1100',
    name: 'mortgage_entry',
    title: '抵押信息录入',
    remark: '普通列表示例：抵押业务列表字段',
    status: 1,
    mockCount: 12,
    columns: [
      { field: 'agreementNo', title: '协议编号', visible: true, width: 140 },
      { field: 'compensatee', title: '被补偿人', visible: true, width: 120 },
      {
        field: 'houseAddress',
        title: '房屋地址',
        visible: true,
        minWidth: 220,
      },
      {
        field: 'statusValue',
        title: '状态值',
        visible: true,
        width: 110,
        cellType: 'tag',
      },
      {
        field: 'signType',
        title: '签约类型',
        visible: true,
        width: 120,
        cellType: 'tag',
      },
      {
        field: 'isSigned',
        title: '是否签约',
        visible: true,
        width: 110,
        cellType: 'tag',
      },
      { field: 'batchGroup', title: '批次分组', visible: true, width: 120 },
    ],
    queryFields: [
      { field: 'agreementNo', title: '协议编号', component: 'Input' },
      { field: 'compensatee', title: '被补偿人', component: 'Input' },
      {
        field: 'isSigned',
        title: '是否签约',
        component: 'Select',
        options: [
          { label: '已签约', value: '已签约' },
          { label: '未签约', value: '未签约' },
        ],
      },
      { field: 'batchGroup', title: '批次分组', component: 'Input' },
    ],
  },
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
      { code: 'submitReview', label: '提交复核', group: 'main' },
      { code: 'conditionalSign', label: '附条件签约', group: 'more' },
      { code: 'rejectRecord', label: '驳回记录', group: 'more' },
      { code: 'rejectPrev', label: '驳回前期', group: 'more' },
      { code: 'preview1', label: '附件一预览', group: 'more' },
      { code: 'preview2', label: '附件二预览', group: 'more' },
    ],
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
      { code: 'approve', label: '审核通过', type: 'primary', group: 'main' },
      { code: 'reject', label: '驳回', group: 'main' },
      { code: 'rejectRecord', label: '驳回记录', group: 'main' },
      { code: 'preview1', label: '附件一预览', group: 'more' },
      { code: 'preview2', label: '附件二预览', group: 'more' },
      { code: 'ticket1', label: '房票附件一', group: 'more' },
      { code: 'ticket2', label: '房票附件二', group: 'more' },
    ],
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
    buttons: [{ code: 'edit', label: '修改', group: 'main' }],
  },
];

/** 运行时可变的 schema 列表（增删改直接改这份） */
export let pageSchemaStore: PageSchema[] = structuredClone(MOCK_PAGE_SCHEMAS);

/** 下一新建 ID 从 PS1101 起，避免与预置 PS1100 冲突 */
let schemaIdSeed = 1101;

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
    mockCount: data.mockCount ?? 40,
  };
  pageSchemaStore.push(node);
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
  pageSchemaStore[idx] = {
    ...prev,
    ...data,
    id: prev.id,
    columns: data.columns ?? prev.columns,
    queryFields: data.queryFields ?? prev.queryFields,
  };
  return pageSchemaStore[idx];
}

/**
 * 删除页面配置
 * @param id 配置 ID
 */
export function removePageSchema(id: string) {
  const before = pageSchemaStore.length;
  pageSchemaStore = pageSchemaStore.filter((item) => String(item.id) !== String(id));
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
 * 生成/获取某配置下的演示列表数据
 * @param schema 页面配置
 */
export function getDynamicRows(schema: PageSchema) {
  const cached = dataCache.get(schema.id);
  if (cached) return cached;

  const count = schema.mockCount ?? 40;
  const rows: Record<string, any>[] = [];

  // 抵押信息录入（PS1100）— 固定几行演示数据
  if (schema.id === 'PS1100') {
    const samples = [
      {
        agreementNo: 'DY20240001',
        compensatee: '张伟',
        houseAddress: '杭州市西湖区文三路 268 号 3 幢 502',
        statusValue: '待审核',
        signType: '货币补偿',
        isSigned: '未签约',
        batchGroup: '2024-一期',
      },
      {
        agreementNo: 'DY20240002',
        compensatee: '李娜',
        houseAddress: '杭州市拱墅区莫干山路 121 号 1 幢 801',
        statusValue: '已通过',
        signType: '产权调换',
        isSigned: '已签约',
        batchGroup: '2024-一期',
      },
      {
        agreementNo: 'DY20240003',
        compensatee: '王强',
        houseAddress: '杭州市余杭区文一西路 1500 号 5 幢 1201',
        statusValue: '已通过',
        signType: '货币+调换',
        isSigned: '已签约',
        batchGroup: '2024-二期',
      },
      {
        agreementNo: 'DY20240004',
        compensatee: '赵敏',
        houseAddress: '杭州市滨江区江南大道 388 号 2 幢 603',
        statusValue: '已驳回',
        signType: '货币补偿',
        isSigned: '未签约',
        batchGroup: '2024-二期',
      },
      {
        agreementNo: 'DY20240005',
        compensatee: '陈浩',
        houseAddress: '杭州市萧山区市心中路 698 号 8 幢 1502',
        statusValue: '已归档',
        signType: '产权调换',
        isSigned: '已签约',
        batchGroup: '2025-一期',
      },
      {
        agreementNo: 'DY20240006',
        compensatee: '刘洋',
        houseAddress: '杭州市上城区解放东路 18 号 6 幢 902',
        statusValue: '待审核',
        signType: '货币补偿',
        isSigned: '未签约',
        batchGroup: '2025-一期',
      },
      {
        agreementNo: 'DY20240007',
        compensatee: '周杰',
        houseAddress: '杭州市临平区迎宾路 66 号 4 幢 301',
        statusValue: '已通过',
        signType: '货币+调换',
        isSigned: '已签约',
        batchGroup: '2025-一期',
      },
      {
        agreementNo: 'DY20240008',
        compensatee: '吴芳',
        houseAddress: '杭州市富阳区桂花西路 88 号 7 幢 1102',
        statusValue: '待审核',
        signType: '产权调换',
        isSigned: '未签约',
        batchGroup: '2025-二期',
      },
      {
        agreementNo: 'DY20240009',
        compensatee: '郑磊',
        houseAddress: '杭州市钱塘区金沙大道 960 号 9 幢 405',
        statusValue: '已通过',
        signType: '货币补偿',
        isSigned: '已签约',
        batchGroup: '2025-二期',
      },
      {
        agreementNo: 'DY20240010',
        compensatee: '孙婷',
        houseAddress: '杭州市临安区衣锦街 298 号 2 幢 701',
        statusValue: '已驳回',
        signType: '货币+调换',
        isSigned: '未签约',
        batchGroup: '2025-二期',
      },
      {
        agreementNo: 'DY20240011',
        compensatee: '马超',
        houseAddress: '杭州市西湖区天目山路 181 号 11 幢 1603',
        statusValue: '已归档',
        signType: '产权调换',
        isSigned: '已签约',
        batchGroup: '2024-一期',
      },
      {
        agreementNo: 'DY20240012',
        compensatee: '黄丽',
        houseAddress: '杭州市拱墅区大关路 55 号 3 幢 1001',
        statusValue: '待审核',
        signType: '货币补偿',
        isSigned: '未签约',
        batchGroup: '2025-一期',
      },
    ];

    samples.forEach((item, i) => {
      rows.push({
        id: `${schema.id}-${i + 1}`,
        ...item,
      });
    });
    dataCache.set(schema.id, rows);
    return rows;
  }

  const levels = ['A', 'B', 'C'];
  const units = ['kg', '个', '箱', '瓶'];

  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const row: Record<string, any> = {
      id: `${schema.id}-${n}`,
      code:
        schema.id === 'PS1002'
          ? `M${String(1000 + n)}`
          : `C${String(1000 + n)}`,
      name:
        schema.id === 'PS1002'
          ? `物料物料-${n}`
          : `客户客户-${n}`,
      level: levels[i % levels.length],
      spec: `${(i % 5) + 1}00g`,
      unit: units[i % units.length],
      stock: Math.floor(Math.random() * 5000),
      contact: `联系人${n}`,
      phone: `138${String(1000_0000 + n).slice(0, 8)}`,
      status: i % 5 === 0 ? 0 : 1,
      remark: i % 3 === 0 ? '重点关注' : '常规数据',
      createTime: formatterCN.format(
        new Date(2023, i % 12, (i % 27) + 1, 9, 30, 0),
      ),
    };
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
