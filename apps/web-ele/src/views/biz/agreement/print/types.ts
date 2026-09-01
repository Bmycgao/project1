/**
 * 协议打印：运行时灌入 hiprint 的业务数据结构
 */
export interface AgreePrintHouseRow {
  /** 户名（连续相同可合并单元格） */
  householdName: string;
  /** 序号 */
  index: number;
  address: string;
  certNo: string;
  houseType: string;
  buildArea: number | string;
  expropriatedArea: number | string;
  evalValue: number | string;
}

/** 补偿/奖励明细行 */
export interface AgreePrintMoneyRow {
  index: number;
  name: string;
  calcType?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  amount: number | string;
  remark: string;
}

/** 传给 hiprint.print / getHtml 的数据 JSON */
export interface AgreePrintData {
  agreementNo: string;
  agreementName: string;
  compensatee: string;
  acquirer: string;
  department: string;
  signDate: string;
  statusValue: string;
  amount: number | string;
  /** 金额大写（业务侧预计算） */
  amountCn: string;
  remark: string;
  houses: AgreePrintHouseRow[];
  compensationItems: AgreePrintMoneyRow[];
  rewardItems: AgreePrintMoneyRow[];
  /** 补偿合计 */
  compensationTotal: number;
  /** 奖励合计 */
  rewardTotal: number;
  /** 是否有奖励（条件展示用） */
  hasRewards: boolean;
  /** 是否高额协议（表达式示例：amount > 500000） */
  isHighAmount: boolean;
  /** 二维码扫描内容 */
  qrcodeContent: string;
  /** 条形码内容（默认同协议编号） */
  barcodeContent: string;
  /** 房屋套数 */
  houseCount: number;
  /** 建筑面积合计 */
  totalBuildArea: number;
  /** 评估价值合计 */
  totalEvalValue: number;
  /** 打印元信息（便于 CONCAT 等） */
  printMeta: string;
}
