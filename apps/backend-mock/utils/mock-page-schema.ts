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
  /** 显示顺序，越小越靠前 */
  order?: number;
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
   * scene=场景视图（引用列模板；可覆盖 columns 显隐/顺序）
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
    order?: number;
    span?: number;
    label?: string;
    desc?: string;
    widgetKind?: 'form' | 'table';
    custom?: boolean;
    authCode?: string;
  }[];
  /**
   * 模块内部配置（场景）：5 块 basic / houses / compensation / rewards / population
   */
  moduleInner?: {
    basic?: ModuleInnerSchema;
    houses?: ModuleInnerSchema;
    compensation?: ModuleInnerSchema;
    rewards?: ModuleInnerSchema;
    population?: ModuleInnerSchema;
    rightHolders?: ModuleInnerSchema;
    signing?: ModuleInnerSchema;
    material?: ModuleInnerSchema;
    signMaterial?: ModuleInnerSchema;
    certifyMaterial?: ModuleInnerSchema;
    [key: string]: ModuleInnerSchema | undefined;
  };
}

/** 模块内部配置片段 */
interface ModuleInnerSchema {
  sections: {
    key: string;
    label: string;
    subtitle?: string;
    enabled: boolean;
    order: number;
    fields: {
      key: string;
      label: string;
      enabled: boolean;
      order: number;
      minWidth?: number;
      accessField?: string;
      controlType?: string;
      span?: number;
      options?: { label: string; value: string }[];
      required?: boolean;
      placeholder?: string;
      custom?: boolean;
    }[];
    removedFieldKeys?: string[];
  }[];
}

/** 生成场景默认模块挂载（含顺序与整行占比） */
function buildModules(
  enabledKeys: string[],
): NonNullable<PageSchema['modules']> {
  const all = [
    'basic',
    'houses',
    'compensation',
    'rewards',
    'population',
  ];
  const set = new Set(enabledKeys);
  return all.map((key, index) => ({
    key,
    enabled: set.has(key),
    order: (index + 1) * 10,
    span: 24,
  }));
}

/** 基础信息：协议头表单种子 */
function buildBasicInnerFull(): ModuleInnerSchema {
  const statusOptions = [
    { label: '告知单', value: '告知单' },
    { label: '待复核', value: '待复核' },
    { label: '待生效', value: '待生效' },
    { label: '已签约', value: '已签约' },
    { label: '组长已复核', value: '组长已复核' },
  ];
  return {
    sections: [
      {
        key: 'header',
        label: '协议信息',
        subtitle: '编号 / 名称 / 部门等头字段',
        enabled: true,
        order: 10,
        fields: [
          { key: 'agreementNo', label: '协议编号', enabled: true, order: 10, controlType: 'input', span: 8, required: true },
          { key: 'agreementName', label: '协议名称', enabled: true, order: 20, controlType: 'input', span: 8, required: true },
          { key: 'department', label: '所属部门', enabled: true, order: 30, controlType: 'input', span: 8 },
          { key: 'acquirer', label: '征收人', enabled: true, order: 40, controlType: 'input', span: 8 },
          { key: 'compensatee', label: '被征收人', enabled: true, order: 50, controlType: 'input', span: 8 },
          { key: 'amount', label: '协议金额', enabled: true, order: 60, controlType: 'input', span: 8, accessField: 'amount' },
          { key: 'signDate', label: '签约日期', enabled: true, order: 70, controlType: 'date', span: 8, accessField: 'signDate', placeholder: '选择日期' },
          { key: 'statusValue', label: '状态', enabled: true, order: 80, controlType: 'radio', span: 8, options: statusOptions },
          { key: 'remark', label: '备注', enabled: true, order: 90, controlType: 'textarea', span: 24 },
        ],
      },
    ],
  };
}

/** 权利人表格种子 */
function buildRightHoldersInnerFull(): ModuleInnerSchema {
  return {
    sections: [
      {
        key: 'rightHolders',
        label: '权利人信息',
        subtitle: '可新增多位权利人',
        enabled: true,
        order: 10,
        fields: [
          { key: 'agreementNo', label: '协议编号', enabled: true, order: 10, minWidth: 120 },
          { key: 'name', label: '姓名', enabled: true, order: 20, minWidth: 100 },
          {
            key: 'idNo',
            label: '身份证号/营业执照号',
            enabled: true,
            order: 30,
            minWidth: 180,
            accessField: 'idNo',
          },
          {
            key: 'phone',
            label: '联系电话',
            enabled: true,
            order: 40,
            minWidth: 120,
            accessField: 'phone',
          },
        ],
      },
    ],
  };
}

/** 房屋表格种子 */
function buildHousesInnerFull(): ModuleInnerSchema {
  return {
    sections: [
      {
        key: 'houses',
        label: '房屋信息',
        subtitle: '勾选或维护涉签约房屋',
        enabled: true,
        order: 10,
        fields: [
          { key: '_selection', label: '勾选', enabled: true, order: 5, minWidth: 48 },
          { key: 'address', label: '房屋地址', enabled: true, order: 10, minWidth: 180 },
          { key: 'buildArea', label: '建筑面积', enabled: true, order: 20, minWidth: 100 },
          { key: 'expropriatedArea', label: '征收面积', enabled: true, order: 30, minWidth: 100 },
          { key: 'houseType', label: '房屋类型', enabled: true, order: 40, minWidth: 100 },
          { key: 'structure', label: '结构', enabled: true, order: 50, minWidth: 90 },
          { key: 'yearBuilt', label: '建成年份', enabled: true, order: 60, minWidth: 90 },
          { key: 'floor', label: '楼层', enabled: true, order: 70, minWidth: 80 },
          { key: 'certNo', label: '产权证号', enabled: true, order: 80, minWidth: 160 },
          { key: 'evalValue', label: '评估价值', enabled: true, order: 90, minWidth: 120 },
          { key: 'propertyType', label: '产权类型', enabled: true, order: 100, minWidth: 140 },
        ],
      },
    ],
  };
}

/** 签约信息内部字段种子（全量） */
function buildSigningInnerFull(): ModuleInnerSchema {
  const yesNo = [
    { label: '是', value: '是' },
    { label: '否', value: '否' },
  ];
  return {
    sections: [
      {
        key: 'signing',
        label: '签约信息',
        subtitle: '按房屋维度维护签约要素',
        enabled: true,
        order: 10,
        fields: [
          {
            key: 'houseAddress',
            label: '房屋地址',
            enabled: true,
            order: 10,
            controlType: 'input',
            span: 24,
            required: true,
          },
          {
            key: 'compensateMethod',
            label: '补偿方式',
            enabled: true,
            order: 20,
            controlType: 'select',
            span: 12,
            required: true,
            options: [
              { label: '产权调换', value: '产权调换' },
              { label: '货币补偿', value: '货币补偿' },
              { label: '货币+调换', value: '货币+调换' },
            ],
          },
          {
            key: 'decorateEval',
            label: '装修装饰评估',
            enabled: true,
            order: 30,
            controlType: 'yesno',
            span: 12,
            options: yesNo,
          },
          {
            key: 'hasMortgage',
            label: '是否存在抵押',
            enabled: true,
            order: 40,
            controlType: 'yesno',
            span: 12,
            options: yesNo,
          },
          {
            key: 'mortgagee',
            label: '抵押权人',
            enabled: true,
            order: 50,
            controlType: 'input',
            span: 12,
          },
          {
            key: 'debtAmount',
            label: '担保主债权金额',
            enabled: true,
            order: 60,
            controlType: 'input',
            span: 12,
            accessField: 'debtAmount',
          },
          {
            key: 'signDate',
            label: '签约日期',
            enabled: true,
            order: 70,
    controlType: 'date',
            span: 12,
            accessField: 'signDate',
            placeholder: '选择日期',
          },
          {
            key: 'hasSeal',
            label: '是否存在查封',
            enabled: true,
            order: 80,
            controlType: 'yesno',
            span: 12,
            options: yesNo,
          },
          {
            key: 'sealCourt',
            label: '查封法院',
            enabled: true,
            order: 90,
            controlType: 'input',
            span: 24,
          },
        ],
      },
      {
        key: 'contact',
        label: '通讯信息',
        subtitle: '用于送达与紧急联系',
        enabled: true,
        order: 20,
        fields: [
          {
            key: 'address',
            label: '通讯地址',
            enabled: true,
            order: 10,
            controlType: 'input',
            span: 24,
          },
          {
            key: 'contact',
            label: '联系人',
            enabled: true,
            order: 20,
            controlType: 'input',
            span: 12,
          },
          {
            key: 'phone',
            label: '联系电话',
            enabled: true,
            order: 30,
            controlType: 'input',
            span: 12,
            accessField: 'phone',
          },
          {
            key: 'emergency',
            label: '紧急联系人',
            enabled: true,
            order: 40,
            controlType: 'input',
            span: 12,
          },
        ],
      },
    ],
  };
}

/** 默认场景 moduleInner（5 块） */
function buildModuleInnerFull() {
  return {
    basic: buildBasicInnerFull(),
    houses: buildHousesInnerFull(),
    compensation: buildCompensationInnerFull(),
    rewards: buildRewardsInnerFull(),
    population: buildPopulationInnerFull(),
  };
}

/** 补偿安置：表格种子 */
function buildCompensationInnerFull(): ModuleInnerSchema {
  return {
    sections: [
      {
        key: 'compensation',
        label: '补偿安置',
        subtitle: '补偿项目明细',
        enabled: true,
        order: 10,
        fields: [
          { key: 'name', label: '补偿项目', enabled: true, order: 10, minWidth: 140, required: true },
          { key: 'calcType', label: '计算方式', enabled: true, order: 20, minWidth: 120 },
          { key: 'quantity', label: '数量', enabled: true, order: 30, minWidth: 80 },
          { key: 'unitPrice', label: '单价', enabled: true, order: 40, minWidth: 100 },
          { key: 'amount', label: '金额', enabled: true, order: 50, minWidth: 120, accessField: 'amount' },
          { key: 'remark', label: '备注', enabled: true, order: 60, minWidth: 140 },
        ],
      },
    ],
  };
}

/** 奖励补贴：表格种子 */
function buildRewardsInnerFull(): ModuleInnerSchema {
  return {
    sections: [
      {
        key: 'rewards',
        label: '奖励补贴',
        subtitle: '奖励与补贴项目',
        enabled: true,
        order: 10,
        fields: [
          { key: 'name', label: '奖励项目', enabled: true, order: 10, minWidth: 140, required: true },
          { key: 'condition', label: '发放条件', enabled: true, order: 20, minWidth: 160 },
          { key: 'amount', label: '金额', enabled: true, order: 30, minWidth: 120, accessField: 'amount' },
          { key: 'remark', label: '备注', enabled: true, order: 40, minWidth: 140 },
        ],
      },
    ],
  };
}

/** 协议人口：表单种子 */
function buildPopulationInnerFull(): ModuleInnerSchema {
  return {
    sections: [
      {
        key: 'population',
        label: '协议人口信息',
        subtitle: '户主与家庭人口',
        enabled: true,
        order: 10,
        fields: [
          { key: 'headName', label: '户主姓名', enabled: true, order: 10, controlType: 'input', span: 8, required: true },
          { key: 'idNo', label: '身份证号', enabled: true, order: 20, controlType: 'input', span: 8, accessField: 'idNo' },
          { key: 'familySize', label: '家庭人口', enabled: true, order: 30, controlType: 'input', span: 8, required: true },
          { key: 'phone', label: '联系电话', enabled: true, order: 40, controlType: 'input', span: 8, accessField: 'phone' },
          { key: 'hukouAddress', label: '户籍地址', enabled: true, order: 50, controlType: 'input', span: 16 },
          { key: 'remark', label: '备注', enabled: true, order: 60, controlType: 'textarea', span: 24 },
        ],
      },
    ],
  };
}

/** 材料清单列种子 */
function buildMaterialInnerFull(): ModuleInnerSchema {
  const fields = [
    {
      key: 'category',
      label: '材料类别',
      enabled: true,
      order: 10,
      minWidth: 140,
      required: true,
    },
    {
      key: 'required',
      label: '是否必备',
      enabled: true,
      order: 20,
      minWidth: 100,
      controlType: 'yesno',
      options: [
        { label: '是', value: '是' },
        { label: '否', value: '否' },
      ],
    },
    {
      key: 'fileName',
      label: '附件',
      enabled: true,
      order: 30,
      minWidth: 140,
      placeholder: '演示：填写文件名',
    },
    {
      key: 'remark',
      label: '备注',
      enabled: true,
      order: 40,
      minWidth: 140,
    },
  ];
  return {
    sections: [
      {
        key: 'signMaterials',
        label: '签约材料',
        subtitle: '签约所需材料清单',
        enabled: true,
        order: 10,
        fields: structuredClone(fields),
      },
      {
        key: 'certifyMaterials',
        label: '认定材料',
        subtitle: '资格认定相关材料',
        enabled: true,
        order: 20,
        fields: structuredClone(fields),
      },
    ],
  };
}

/** 查看场景：少挂两列，演示「全量 100、本页只配 80」 */
function buildBasicInnerViewSubset() {
  const full = buildBasicInnerFull();
  return {
    sections: full.sections.map((sec) => ({
      ...sec,
      fields: sec.fields.map((f) => {
        if (f.key === 'department' || f.key === 'acquirer') {
          return { ...f, enabled: false };
        }
        return f;
      }),
    })),
  };
}

function buildHousesInnerViewSubset() {
  const full = buildHousesInnerFull();
  return {
    sections: full.sections.map((sec) => ({
      ...sec,
      fields: sec.fields.map((f) => {
        if (f.key === 'propertyType' || f.key === '_selection') {
          return { ...f, enabled: false };
        }
        return f;
      }),
    })),
  };
}

/** 查看场景签约：卸下部分字段做演示 */
function buildSigningInnerViewSubset() {
  const full = buildSigningInnerFull();
  return {
    sections: full.sections.map((sec) => ({
      ...sec,
      fields: sec.fields.map((f) => {
        if (f.key === 'mortgagee' || f.key === 'sealCourt' || f.key === 'emergency') {
          return { ...f, enabled: false };
        }
        return f;
      }),
    })),
  };
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
      {
        field: 'agreementNo',
        title: '协议编号',
        visible: true,
        minWidth: 130,
        order: 10,
      },
      {
        field: 'compensatee',
        title: '被补偿人',
        visible: true,
        minWidth: 100,
        order: 20,
      },
      {
        field: 'houseAddress',
        title: '房屋地址',
        visible: true,
        minWidth: 200,
        order: 30,
      },
      {
        field: 'statusValue',
        title: '状态值',
        visible: true,
        minWidth: 120,
        cellType: 'tag',
        order: 40,
      },
      {
        field: 'signType',
        title: '签约类型',
        visible: true,
        minWidth: 110,
        order: 50,
      },
      {
        field: 'isSigned',
        title: '是否签约',
        visible: true,
        minWidth: 100,
        cellType: 'tag',
        order: 60,
      },
      {
        field: 'batchGroup',
        title: '批次分组',
        visible: true,
        minWidth: 110,
        order: 70,
      },
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
    /** 录入：详情挂载 5 块 */
    modules: buildModules([
      'basic',
      'houses',
      'compensation',
      'rewards',
      'population',
    ]),
    moduleInner: buildModuleInnerFull(),
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
    /** 律师审核：详情挂载 5 块 */
    modules: buildModules([
      'basic',
      'houses',
      'compensation',
      'rewards',
      'population',
    ]),
    moduleInner: buildModuleInnerFull(),
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
    /** 预览：5 块全部挂载 */
    modules: buildModules(['basic', 'houses', 'compensation', 'rewards', 'population']),
    moduleInner: buildModuleInnerFull(),
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
    /** 查看：基础 / 房屋 / 人口 */
    modules: buildModules(['basic', 'houses', 'population']).map((m) => ({
      ...m,
      span: 24,
    })),
    moduleInner: {
      basic: buildBasicInnerViewSubset(),
      houses: buildHousesInnerViewSubset(),
      compensation: buildCompensationInnerFull(),
      rewards: buildRewardsInnerFull(),
      population: buildPopulationInnerFull(),
    },
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
  ensureModuleInnerFromSeed();
  migrateAgreeFiveModules();
  migrateLegacyBasicTables();
  migrateLegacyMaterialModules();
  // 旧落盘 fieldRules 缺 displayFormat / signDate 时补齐
  ensureFieldFormatsFromSeed();
  // 旧落盘列缺 order 时按种子/下标补齐
  ensureColumnOrderFromSeed();
}

/**
 * 给已落盘场景补 moduleInner 各块（缺则用种子）
 */
function ensureModuleInnerFromSeed() {
  let changed = false;
  const keys = [
    'basic',
    'houses',
    'compensation',
    'rewards',
    'population',
  ] as const;
  for (const seed of MOCK_PAGE_SCHEMAS) {
    if (seed.schemaKind !== 'scene' || !seed.moduleInner) continue;
    const idx = pageSchemaStore.findIndex(
      (s) => String(s.id) === String(seed.id),
    );
    if (idx < 0) continue;
    const current = pageSchemaStore[idx]!;
    const nextInner = {
      ...(current.moduleInner || {}),
    } as NonNullable<PageSchema['moduleInner']>;
    let rowChanged = false;
    for (const key of keys) {
      const seedBlock = seed.moduleInner[key];
      const curBlock = current.moduleInner?.[key];
      if (!seedBlock) continue;
      // 整块缺失：用种子
      if (!curBlock?.sections?.length) {
        nextInner[key] = structuredClone(seedBlock);
        rowChanged = true;
        continue;
      }
      // 种子里新增的内置子块：按 key 合并，不覆盖已有子块配置
      const curKeys = new Set(curBlock.sections.map((s) => s.key));
      const missing = seedBlock.sections.filter((s) => !curKeys.has(s.key));
      if (missing.length) {
        nextInner[key] = {
          ...curBlock,
          sections: [
            ...curBlock.sections,
            ...structuredClone(missing),
          ],
        };
        rowChanged = true;
      }
    }
    if (rowChanged) {
      pageSchemaStore[idx] = {
        ...current,
        moduleInner: nextInner,
      };
      changed = true;
    }
  }
  if (changed) persistPageSchemaStore();
}

/**
 * 详情收成 5 块：基础表单 + 房屋表 + 补偿表 + 奖励表 + 人口表单
 * 旧 rightHolders 挂载映射到 population；补偿若仍是表单种子则换成表格
 */
function migrateAgreeFiveModules() {
  const five = [
    'basic',
    'houses',
    'compensation',
    'rewards',
    'population',
  ] as const;
  let changed = false;
  for (let idx = 0; idx < pageSchemaStore.length; idx++) {
    const current = pageSchemaStore[idx]!;
    if (current.schemaKind !== 'scene') continue;
    const seed = MOCK_PAGE_SCHEMAS.find(
      (s) => String(s.id) === String(current.id),
    );
    const mods = current.modules || [];
    const byKey = new Map(mods.map((m) => [m.key, m]));
    const rh = byKey.get('rightHolders');
    const comp = byKey.get('compensation');
    const dropLegacy = new Set([
      'basic',
      'houses',
      'compensation',
      'rewards',
      'population',
      'rightHolders',
      'signMaterial',
      'certifyMaterial',
      'signing',
      'material',
      'contact',
    ]);
    const nextMods = five.map((key, i) => {
      const existing = byKey.get(key);
      if (existing) {
        return {
          ...existing,
          key,
          enabled: existing.enabled !== false,
          order: typeof existing.order === 'number' ? existing.order : (i + 1) * 10,
          span: existing.span || 24,
        };
      }
      if (key === 'population' && rh) {
        return {
          key,
          enabled: rh.enabled !== false,
          order: rh.order ?? (i + 1) * 10,
          span: rh.span || 24,
        };
      }
      if (key === 'rewards' && comp) {
        return {
          key,
          enabled: comp.enabled !== false,
          order: (comp.order ?? 30) + 5,
          span: 24,
        };
      }
      const seedItem = seed?.modules?.find((s) => s.key === key);
      return seedItem
        ? structuredClone(seedItem)
        : { key, enabled: false, order: (i + 1) * 10, span: 24 };
    });
    /** 配置台新建的业务组件不能被 5 块迁移冲掉 */
    const extraMods = mods.filter((m) => !dropLegacy.has(String(m.key)));
    nextMods.push(...extraMods);
    const nextInner = {
      ...(current.moduleInner || {}),
    } as NonNullable<PageSchema['moduleInner']>;
    if (!nextInner.population?.sections?.length) {
      nextInner.population = structuredClone(
        seed?.moduleInner?.population || buildPopulationInnerFull(),
      );
    }
    if (!nextInner.rewards?.sections?.length) {
      nextInner.rewards = structuredClone(
        seed?.moduleInner?.rewards || buildRewardsInnerFull(),
      );
    }
    const compFields = nextInner.compensation?.sections?.[0]?.fields || [];
    const compKeys = new Set(compFields.map((f) => f.key));
    if (compKeys.has('settleType') && !compKeys.has('name')) {
      nextInner.compensation = structuredClone(buildCompensationInnerFull());
    }
    const modsChanged = JSON.stringify(mods) !== JSON.stringify(nextMods);
    const innerChanged =
      JSON.stringify(current.moduleInner || {}) !== JSON.stringify(nextInner);
    if (!modsChanged && !innerChanged) continue;
    pageSchemaStore[idx] = {
      ...current,
      modules: nextMods,
      moduleInner: nextInner,
    };
    changed = true;
  }
  if (changed) persistPageSchemaStore();
}

/**
 * 旧 basic 里的权利人/房屋表拆到独立 moduleInner，避免和协议头表单混在一起
 */
function migrateLegacyBasicTables() {
  let changed = false;
  for (let idx = 0; idx < pageSchemaStore.length; idx++) {
    const current = pageSchemaStore[idx]!;
    const inner = current.moduleInner;
    const sections = inner?.basic?.sections;
    if (!sections?.length) continue;
    const rh = sections.find((s) => s.key === 'rightHolders');
    const hs = sections.find((s) => s.key === 'houses');
    if (!rh && !hs) continue;
    const nextInner = { ...(inner || {}) } as NonNullable<PageSchema['moduleInner']>;
    if (rh && !nextInner.rightHolders?.sections?.length) {
      nextInner.rightHolders = { sections: [structuredClone(rh)] };
    }
    if (hs && !nextInner.houses?.sections?.length) {
      nextInner.houses = { sections: [structuredClone(hs)] };
    }
    nextInner.basic = {
      ...nextInner.basic,
      sections: sections.filter(
        (s) => s.key !== 'rightHolders' && s.key !== 'houses',
      ),
    };
    if (!nextInner.basic?.sections?.length) {
      nextInner.basic = structuredClone(buildBasicInnerFull());
    }
    pageSchemaStore[idx] = { ...current, moduleInner: nextInner };
    changed = true;
  }
  if (changed) persistPageSchemaStore();
}

/**
 * 旧的「签约材料 / 认定材料」两个挂载项收成一个材料清单
 */
function migrateLegacyMaterialModules() {
  let changed = false;
  for (let idx = 0; idx < pageSchemaStore.length; idx++) {
    const current = pageSchemaStore[idx]!;
    let rowChanged = false;
    let modules = current.modules ? [...current.modules] : [];
    const sign = modules.find((m) => m.key === 'signMaterial');
    const certify = modules.find((m) => m.key === 'certifyMaterial');
    const hasMaterial = modules.some((m) => m.key === 'material');
    if ((sign || certify) && !hasMaterial) {
      const enabled =
        (sign ? sign.enabled !== false : false) ||
        (certify ? certify.enabled !== false : false);
      modules.push({
        key: 'material',
        enabled,
        order: sign?.order ?? certify?.order ?? 50,
        span: 24,
      });
      rowChanged = true;
    }
    const nextModules = modules.filter(
      (m) => m.key !== 'signMaterial' && m.key !== 'certifyMaterial',
    );
    if (nextModules.length !== modules.length) {
      modules = nextModules;
      rowChanged = true;
    }

    const inner = current.moduleInner;
    const materialSecs = inner?.material?.sections || [];
    const hasNewSecs = materialSecs.some(
      (s) => s.key === 'signMaterials' || s.key === 'certifyMaterials',
    );
    let nextInner = inner;
    if (inner && !hasNewSecs) {
      const signSec =
        inner.signMaterial?.sections?.[0] ||
        materialSecs.find((s) => s.key === 'materials');
      const certifySec =
        inner.certifyMaterial?.sections?.[0] ||
        materialSecs.find((s) => s.key === 'materials');
      const seed = buildMaterialInnerFull();
      nextInner = {
        ...inner,
        material: {
          sections: [
            {
              ...(signSec || seed.sections[0]!),
              key: 'signMaterials',
              label:
                signSec && signSec.label !== '材料清单'
                  ? signSec.label
                  : '签约材料',
              order: 10,
            },
            {
              ...(certifySec || seed.sections[1]!),
              key: 'certifyMaterials',
              label:
                certifySec && certifySec.label !== '材料清单'
                  ? certifySec.label
                  : '认定材料',
              order: 20,
            },
          ],
        },
      };
      rowChanged = true;
    }

    if (rowChanged) {
      pageSchemaStore[idx] = {
        ...current,
        modules: modules.length ? modules : current.modules,
        moduleInner: nextInner,
      };
      changed = true;
    }
  }
  if (changed) persistPageSchemaStore();
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
    // 补齐 order / span，并挂上种子里新增的模块（如房屋/权利人）
    const byKey = new Map(current.modules.map((m) => [m.key, m]));
    let rowChanged = false;
    let next = current.modules.map((m, i) => {
      const seedItem = seed.modules?.find((s) => s.key === m.key);
      const order =
        typeof m.order === 'number'
          ? m.order
          : (seedItem?.order ?? (i + 1) * 10);
      const span =
        typeof m.span === 'number' ? m.span : (seedItem?.span ?? 24);
      if (m.order === order && m.span === span) return m;
      rowChanged = true;
      return { ...m, order, span };
    });
    const basicOrder =
      next.find((m) => m.key === 'basic')?.order ?? 10;
    let bump = 1;
    for (const seedItem of seed.modules || []) {
      if (byKey.has(seedItem.key)) continue;
      next = [
        ...next,
        {
          ...structuredClone(seedItem),
          order: basicOrder + bump,
        },
      ];
      bump += 1;
      rowChanged = true;
    }
    if (rowChanged) {
      pageSchemaStore[idx] = { ...current, modules: next };
      changed = true;
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
 * 给已落盘列配置补齐 order（按种子同名字段或下标）
 */
function ensureColumnOrderFromSeed() {
  let anyChanged = false;
  for (const seed of MOCK_PAGE_SCHEMAS) {
    if (!seed.columns?.length) continue;
    const idx = pageSchemaStore.findIndex(
      (s) => String(s.id) === String(seed.id),
    );
    if (idx < 0) continue;
    const cur = pageSchemaStore[idx]!;
    if (!cur.columns?.length) continue;
    let rowChanged = false;
    const next = cur.columns.map((c, i) => {
      if (typeof c.order === 'number') return c;
      const seedCol = seed.columns.find((s) => s.field === c.field);
      rowChanged = true;
      return {
        ...c,
        order: seedCol?.order ?? (i + 1) * 10,
      };
    });
    if (rowChanged) {
      pageSchemaStore[idx] = { ...cur, columns: next };
      anyChanged = true;
    }
  }
  if (anyChanged) persistPageSchemaStore();
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
 * 按 id 查找页面配置；scene 无自有列时合并列模板
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
    if (tpl) {
      // 场景已保存过列 → 用场景自己的；否则继承列模板
      const columns = node.columns?.length
        ? structuredClone(node.columns)
        : structuredClone(tpl.columns || []);
      return {
        ...node,
        columns,
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
    moduleInner: data.moduleInner,
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
    moduleInner:
      data.moduleInner !== undefined ? data.moduleInner : prev.moduleInner,
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
