/**
 * 打印模板库（独立于 page-schema，业务按钮通过 templateCode 引用）
 */
import { readPersistJson, writePersistJson } from './mock-persist';
import {
  BASE_AGREEMENT_PRINT_TEMPLATE,
  clonePrintTemplateWithTitle,
} from './print-template-seed';

/** 单条打印模板 */
export interface PrintTemplate {
  id: string;
  /** 业务引用码，如 PrintFujian1 */
  templateCode: string;
  name: string;
  bizType?: string;
  remark?: string;
  status: 0 | 1;
  /** hiprint getJson 结构 */
  templateJson: Record<string, any>;
  version?: number;
  updatedAt?: string;
}

/** 内置模板 id / code */
export const PRINT_TEMPLATE_IDS = {
  agreement: 'PT_AGREEMENT',
  fujian1: 'PT_FUJIAN1',
  fujian2: 'PT_FUJIAN2',
  ticket1: 'PT_TICKET1',
  ticket2: 'PT_TICKET2',
} as const;

export const PRINT_TEMPLATE_CODES = {
  agreement: 'PrintAgreement',
  fujian1: 'PrintFujian1',
  fujian2: 'PrintFujian2',
  ticket1: 'PrintTicket1',
  ticket2: 'PrintTicket2',
} as const;

const PERSIST_FILE = 'print-template.json';

/** 种子模板 */
const MOCK_PRINT_TEMPLATES: PrintTemplate[] = [
  {
    id: PRINT_TEMPLATE_IDS.agreement,
    templateCode: PRINT_TEMPLATE_CODES.agreement,
    name: '协议正文打印',
    bizType: 'agreement',
    remark: '详情页默认打印模板',
    status: 1,
    version: 1,
    templateJson: structuredClone(BASE_AGREEMENT_PRINT_TEMPLATE),
    updatedAt: new Date().toISOString(),
  },
  {
    id: PRINT_TEMPLATE_IDS.fujian1,
    templateCode: PRINT_TEMPLATE_CODES.fujian1,
    name: '附件一',
    bizType: 'agreement',
    remark: '列表「附件一预览」默认绑定',
    status: 1,
    version: 1,
    templateJson: clonePrintTemplateWithTitle('房屋征收补偿协议（附件一）'),
    updatedAt: new Date().toISOString(),
  },
  {
    id: PRINT_TEMPLATE_IDS.fujian2,
    templateCode: PRINT_TEMPLATE_CODES.fujian2,
    name: '附件二',
    bizType: 'agreement',
    remark: '列表「附件二预览」默认绑定',
    status: 1,
    version: 1,
    templateJson: clonePrintTemplateWithTitle('房屋征收补偿协议（附件二）'),
    updatedAt: new Date().toISOString(),
  },
  {
    id: PRINT_TEMPLATE_IDS.ticket1,
    templateCode: PRINT_TEMPLATE_CODES.ticket1,
    name: '房票附件一',
    bizType: 'agreement',
    remark: '列表「房票附件一」默认绑定',
    status: 1,
    version: 1,
    templateJson: clonePrintTemplateWithTitle('房票安置凭证（附件一）'),
    updatedAt: new Date().toISOString(),
  },
  {
    id: PRINT_TEMPLATE_IDS.ticket2,
    templateCode: PRINT_TEMPLATE_CODES.ticket2,
    name: '房票附件二',
    bizType: 'agreement',
    remark: '列表「房票附件二」默认绑定',
    status: 1,
    version: 1,
    templateJson: clonePrintTemplateWithTitle('房票安置凭证（附件二）'),
    updatedAt: new Date().toISOString(),
  },
];

const printTemplateStore: PrintTemplate[] =
  structuredClone(MOCK_PRINT_TEMPLATES);

function replacePrintTemplateStore(next: PrintTemplate[]) {
  printTemplateStore.length = 0;
  printTemplateStore.push(...next);
}

let printTemplateIdSeed = 2001;

function persistPrintTemplateStore() {
  writePersistJson(PERSIST_FILE, {
    printTemplateIdSeed,
    templates: printTemplateStore,
  });
}

/** 落盘缺内置模板时补种；旧模板缺二维码时补入 */
function ensureBuiltinPrintTemplates() {
  let changed = false;
  for (const seed of MOCK_PRINT_TEMPLATES) {
    const idx = printTemplateStore.findIndex((s) => s.id === seed.id);
    if (idx === -1) {
      printTemplateStore.push(structuredClone(seed));
      changed = true;
      continue;
    }
    const cur = printTemplateStore[idx];
    if (!cur) continue;
    if (!cur.templateJson?.panels?.length) {
      printTemplateStore[idx] = {
        ...cur,
        templateJson: structuredClone(seed.templateJson),
        updatedAt: new Date().toISOString(),
      };
      changed = true;
      continue;
    }
    const patchedQr = patchTemplateQrcode(cur.templateJson, seed.templateJson);
    const patchedBox = patchDesignTableBoxes(patchedQr);
    if (patchedBox !== cur.templateJson) {
      printTemplateStore[idx] = {
        ...cur,
        templateJson: patchedBox,
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    }
  }
  if (changed) persistPrintTemplateStore();
}

/**
 * 旧模板无二维码元素时，从种子补一个
 * @param current 当前 templateJson
 * @param seed 种子 templateJson
 */
function patchTemplateQrcode(
  current: Record<string, any>,
  seed: Record<string, any>,
) {
  const curEls = current?.panels?.[0]?.printElements || [];
  const hasQr = curEls.some(
    (e: any) => String(e?.options?.textType) === 'qrcode',
  );
  if (hasQr) return current;
  const seedQr = (seed?.panels?.[0]?.printElements || []).find(
    (e: any) => String(e?.options?.textType) === 'qrcode',
  );
  if (!seedQr) return current;
  const next = structuredClone(current);
  next.panels[0].printElements = [...curEls, structuredClone(seedQr)];
  return next;
}

/** 仍是旧 54pt 占位框时，拉高设计态表格并下移后续模块 */
const OLD_TABLE_BOX_H = 54;
const HOUSE_TABLE_BOX_H = 96;
const COMP_TABLE_BOX_H = 114;
const REWARD_TABLE_BOX_H = 96;

/**
 * 旧模板三张表都是 54pt 时，套用更大的设计态框高（不覆盖用户已拉高的表）
 * @param current 当前 templateJson
 */
function patchDesignTableBoxes(current: Record<string, any>) {
  const els = current?.panels?.[0]?.printElements;
  if (!Array.isArray(els)) return current;
  const houses = els.find((e: any) => e?.options?.field === 'houses');
  const comp = els.find((e: any) => e?.options?.field === 'compensationItems');
  const rewards = els.find((e: any) => e?.options?.field === 'rewardItems');
  if (!houses?.options || !comp?.options || !rewards?.options) return current;
  if (Number(houses.options.height) !== OLD_TABLE_BOX_H) return current;
  if (Number(comp.options.height) !== OLD_TABLE_BOX_H) return current;
  if (Number(rewards.options.height) !== OLD_TABLE_BOX_H) return current;

  const next = structuredClone(current);
  const list = next.panels[0].printElements as {
    options?: Record<string, any>;
  }[];
  for (const el of list) {
    const o = el.options;
    if (!o) continue;
    if (o.field === 'houses') o.height = HOUSE_TABLE_BOX_H;
    if (o.title === '二、补偿安置') o.top = 272;
    if (o.field === 'compensationItems') {
      o.top = 294;
      o.height = COMP_TABLE_BOX_H;
    }
    if (o.title === '三、奖励补贴') o.top = 438;
    if (o.field === 'rewardItems') {
      o.top = 460;
      o.height = REWARD_TABLE_BOX_H;
    }
    if (o.field === 'amount' && o.title === '协议金额（小写）') o.top = 590;
    if (o.field === 'amountCn') o.top = 614;
    if (String(o.title || '').includes('被征收人签字')) o.top = 650;
    if (String(o.title || '').includes('征收人盖章')) o.top = 650;
  }
  return next;
}

function hydratePrintTemplateFromDisk() {
  const saved = readPersistJson<{
    printTemplateIdSeed?: number;
    templates?: PrintTemplate[];
  }>(PERSIST_FILE);
  if (!saved?.templates?.length) return;
  replacePrintTemplateStore(saved.templates);
  if (typeof saved.printTemplateIdSeed === 'number') {
    printTemplateIdSeed = saved.printTemplateIdSeed;
  }
  ensureBuiltinPrintTemplates();
}

hydratePrintTemplateFromDisk();
ensureBuiltinPrintTemplates();

/**
 * 按 id 查模板
 * @param id 记录 id
 */
export function findPrintTemplate(id: string) {
  return printTemplateStore.find((s) => String(s.id) === String(id)) || null;
}

/**
 * 按 templateCode 查模板（业务预览用）
 * @param code 模板编码
 */
export function findPrintTemplateByCode(code: string) {
  const c = String(code || '').trim();
  if (!c) return null;
  return (
    printTemplateStore.find(
      (s) => String(s.templateCode).toLowerCase() === c.toLowerCase(),
    ) || null
  );
}

/**
 * 列表查询
 * @param query keyword / bizType / status
 */
export function listPrintTemplates(query?: {
  bizType?: string;
  keyword?: string;
  status?: string;
}) {
  let list = structuredClone(printTemplateStore);
  if (query?.keyword) {
    const kw = String(query.keyword);
    list = list.filter(
      (s) =>
        s.name.includes(kw) ||
        s.id.includes(kw) ||
        s.templateCode.includes(kw) ||
        (s.remark || '').includes(kw),
    );
  }
  if (query?.bizType) {
    list = list.filter((s) => s.bizType === query.bizType);
  }
  if (['0', '1'].includes(String(query?.status))) {
    list = list.filter((s) => s.status === Number(query?.status));
  }
  return list;
}

/**
 * 新建打印模板
 * @param data 表单数据
 */
export function createPrintTemplate(
  data: Omit<PrintTemplate, 'id' | 'updatedAt'> & { id?: string },
) {
  const id = data.id?.trim() || `PT${printTemplateIdSeed++}`;
  const code = String(data.templateCode || '').trim();
  if (!code) {
    throw new Error('templateCode 不能为空');
  }
  if (findPrintTemplateByCode(code)) {
    throw new Error(`模板编码 ${code} 已存在`);
  }
  const node: PrintTemplate = {
    id,
    templateCode: code,
    name: data.name || '未命名打印模板',
    bizType: data.bizType || 'agreement',
    remark: data.remark || '',
    status: (data.status ?? 1) as 0 | 1,
    version: data.version ?? 1,
    templateJson:
      data.templateJson?.panels?.length > 0
        ? data.templateJson
        : structuredClone(BASE_AGREEMENT_PRINT_TEMPLATE),
    updatedAt: new Date().toISOString(),
  };
  printTemplateStore.push(node);
  persistPrintTemplateStore();
  return node;
}

/**
 * 更新打印模板
 * @param id 记录 id
 * @param data 部分字段
 */
export function updatePrintTemplate(id: string, data: Partial<PrintTemplate>) {
  const idx = printTemplateStore.findIndex((s) => String(s.id) === String(id));
  if (idx === -1) return null;
  const current = printTemplateStore[idx];
  if (!current) return null;
  const nextCode =
    data.templateCode === undefined
      ? current.templateCode
      : String(data.templateCode).trim();
  if (nextCode && nextCode !== current.templateCode) {
    const dup = findPrintTemplateByCode(nextCode);
    if (dup && dup.id !== current.id) {
      throw new Error(`模板编码 ${nextCode} 已存在`);
    }
  }
  printTemplateStore[idx] = {
    ...current,
    ...data,
    id: current.id,
    templateCode: nextCode || current.templateCode,
    templateJson:
      data.templateJson === undefined
        ? current.templateJson
        : data.templateJson,
    version:
      data.templateJson === undefined
        ? (data.version ?? current.version)
        : (current.version || 1) + 1,
    updatedAt: new Date().toISOString(),
  };
  persistPrintTemplateStore();
  return printTemplateStore[idx];
}

/**
 * 删除模板（内置三条不可删）
 * @param id 记录 id
 */
export function removePrintTemplate(id: string) {
  const builtin = new Set(Object.values(PRINT_TEMPLATE_IDS));
  if (
    builtin.has(
      id as (typeof PRINT_TEMPLATE_IDS)[keyof typeof PRINT_TEMPLATE_IDS],
    )
  ) {
    return false;
  }
  const before = printTemplateStore.length;
  replacePrintTemplateStore(
    printTemplateStore.filter((s) => String(s.id) !== String(id)),
  );
  if (printTemplateStore.length < before) {
    persistPrintTemplateStore();
    return true;
  }
  return false;
}
