/** 前端新建与 mock 种子共用的示例版式；已有模板不自动迁移。 */
export function createAgreementExampleTemplate(): Record<string, any> {
  const bodyWidth = (210 * 72) / 25.4 - 40;
  function element(
    type: string,
    row: number,
    options: Record<string, any>,
    gap = 10,
    left = 0,
    width = 100,
  ) {
    return {
      printElementType: { type, title: options.title || type },
      options: {
        left: 20 + (bodyWidth * left) / 100,
        top: 20 + row * 35,
        width: (bodyWidth * width) / 100,
        height: 20,
        fontSize: 10,
        lineHeight: 15,
        ...options,
        agreeDocument: { row, gap, left, width, keepNext: false },
      },
    };
  }
  function heading(row: number, title: string, condition = '') {
    const item = element(
      'text',
      row,
      {
        title,
        hideTitle: true,
        fontSize: 12,
        fontWeight: '700',
        ...(condition ? { agreeVisibleWhen: condition } : {}),
      },
      18,
    );
    item.options.agreeDocument.keepNext = true;
    return item;
  }
  function column(title: string, field: string, width: number, extra = {}) {
    return {
      title,
      field,
      width,
      align: 'center',
      checked: true,
      colspan: 1,
      rowspan: 1,
      ...extra,
    };
  }
  function table(
    row: number,
    field: string,
    title: string,
    columns: any[][],
    extra = {},
  ) {
    return element(
      'table',
      row,
      {
        title,
        field,
        columns,
        fontSize: 9,
        lineHeight: 12,
        tableHeaderFontSize: 9,
        tableHeaderFontWeight: '700',
        tableHeaderRowHeight: 24,
        tableBodyRowHeight: 22,
        tableHeaderBackground: '#f3f4f6',
        tableHeaderRepeat: 'page',
        tableFooterRepeat: 'last',
        ...extra,
      },
      7,
    );
  }
  function panel(index: number, printElements: any[]) {
    return {
      index,
      name: index + 1,
      width: 210,
      height: 297,
      paperHeader: 28,
      paperFooter: 800,
      paperNumberLeft: 565,
      paperNumberTop: 819,
      paperNumberDisabled: false,
      paperNumberContinue: true,
      watermarkOptions: { content: '' },
      panelLayoutOptions: {},
      printElements,
    };
  }
  const fixedCell = (value: string) => ({ mode: 'text', value, bold: true });
  const fieldCell = (value: string, format = '') => ({
    mode: 'field',
    value,
    format,
  });
  const fixedForm = {
    version: 1,
    columns: [85, 190, 85, 190],
    rows: [
      {
        height: 30,
        cells: [
          fixedCell('协议编号'),
          fieldCell('agreementNo'),
          fixedCell('签约日期'),
          fieldCell('signDate', 'date'),
        ],
      },
      {
        height: 30,
        cells: [
          fixedCell('被征收人'),
          fieldCell('compensatee'),
          fixedCell('所属部门'),
          fieldCell('department'),
        ],
      },
      {
        height: 30,
        cells: [
          fixedCell('补偿合计'),
          fieldCell('compensationTotal', 'money'),
          fixedCell('奖励合计'),
          fieldCell('rewardTotal', 'money'),
        ],
      },
      {
        height: 32,
        cells: [
          fixedCell('协议总金额'),
          { ...fieldCell('amount', 'money'), colspan: 3, bold: true },
          { mode: 'text', value: '' },
          { mode: 'text', value: '' },
        ],
      },
    ],
  };
  return {
    agreeTemplatePreset: 'example',
    agreeLayout: 'document-flow',
    panels: [
      panel(0, [
        element(
          'text',
          0,
          {
            title: '房屋征收补偿协议',
            hideTitle: true,
            textAlign: 'center',
            fontSize: 20,
            lineHeight: 28,
            fontWeight: '700',
          },
          4,
        ),
        element(
          'text',
          1,
          { title: '协议编号', field: 'agreementNo', fontSize: 10 },
          16,
          0,
          62,
        ),
        element(
          'text',
          1,
          {
            title: '协议条形码',
            field: 'barcodeContent',
            textType: 'barcode',
            barcodeMode: 'CODE128',
            barAutoWidth: false,
            hideTitle: true,
            width: (bodyWidth * 30) / 100,
            height: 30,
          },
          16,
          70,
          30,
        ),
        element(
          'text',
          2,
          { title: '被征收人', field: 'compensatee' },
          8,
          0,
          49,
        ),
        element(
          'text',
          2,
          { title: '签约日期', field: 'signDate', agreeFormat: 'date' },
          8,
          51,
          49,
        ),
        element('text', 3, { title: '征收人', field: 'acquirer' }, 6),
        element('text', 4, { title: '协议名称', field: 'agreementName' }, 6),
        heading(5, '一、房屋明细'),
        table(6, 'houses', '房屋明细', [
          [
            column('户名', 'householdName', 64, { agreeMergeSame: true }),
            column('序号', 'index', 30),
            column('房屋地址', 'address', 115, { align: 'left' }),
            column('产权证号', 'certNo', 65),
            column('房屋类型', 'houseType', 55, { agreeMergeSame: true }),
            column('建筑面积', 'buildArea', 65, { agreeColFormat: 'areaM2' }),
            column('征收面积', 'expropriatedArea', 65, {
              agreeColFormat: 'areaM2',
            }),
            column('评估价值', 'evalValue', 85, { agreeColFormat: 'money0' }),
          ],
        ]),
        heading(7, '二、补偿安置'),
        table(8, 'compensationItems', '补偿安置', [
          [
            column('序号', 'index', 30, { rowspan: 2 }),
            column('项目信息', '', 210, { colspan: 2 }),
            column('计价信息', '', 230, { colspan: 3 }),
            column('备注', 'remark', 74, { rowspan: 2 }),
          ],
          [
            column('项目名称', 'name', 130, { align: 'left' }),
            column('计算方式', 'calcType', 80),
            column('数量', 'quantity', 50),
            column('单价', 'unitPrice', 85, {
              agreeColFormat: 'money',
              align: 'right',
            }),
            column('金额', 'amount', 95, {
              agreeColFormat: 'money',
              align: 'right',
              tableSummary: 'sum',
            }),
          ],
        ]),
      ]),
      panel(1, [
        element(
          'text',
          0,
          {
            title: '补充信息与确认',
            hideTitle: true,
            textAlign: 'center',
            fontSize: 18,
            lineHeight: 26,
            fontWeight: '700',
          },
          4,
        ),
        heading(1, '三、奖励补贴', 'COUNT(rewardItems) > 0'),
        table(
          2,
          'rewardItems',
          '奖励补贴',
          [
            [
              column('序号', 'index', 36),
              column('奖励项目', 'name', 195, { align: 'left' }),
              column('金额', 'amount', 120, {
                agreeColFormat: 'money',
                align: 'right',
                tableSummary: 'sum',
              }),
              column('说明', 'remark', 193, { align: 'left' }),
            ],
          ],
          { agreeVisibleWhen: 'COUNT(rewardItems) > 0' },
        ),
        heading(3, '四、信息确认'),
        table(4, '', '信息确认表单', [], {
          agreeFormGrid: fixedForm,
          fontSize: 10,
        }),
        element(
          'text',
          5,
          {
            title: '协议金额（大写）',
            field: 'amountCn',
            fontSize: 11,
            fontWeight: '700',
          },
          12,
        ),
        heading(6, '五、补充说明'),
        element(
          'longText',
          7,
          {
            title: '补充说明',
            hideTitle: true,
            agreeTextSectionGap: 6,
            agreeTextSections: [
              {
                when: '',
                content:
                  '本协议编号为 {{agreementNo}}，被征收人为 {{compensatee}}。房屋、补偿及奖励明细见前述清单，协议总金额为 {{FORMAT_MONEY(amount, 2)}} 元。',
              },
              {
                when: 'COUNT(rewardItems) > 0',
                content:
                  '本协议包含 {{COUNT(rewardItems)}} 项奖励补贴，奖励合计 {{FORMAT_MONEY(rewardTotal, 2)}} 元，已列入协议总金额。',
              },
            ],
          },
          7,
        ),
        element(
          'text',
          8,
          { title: '被征收人签字：________________', hideTitle: true },
          32,
          0,
          49,
        ),
        element(
          'text',
          8,
          { title: '征收人盖章：________________', hideTitle: true },
          32,
          51,
          49,
        ),
        element(
          'text',
          9,
          { title: '日期：________年____月____日', hideTitle: true },
          20,
          0,
          49,
        ),
        element(
          'text',
          9,
          { title: '日期：________年____月____日', hideTitle: true },
          20,
          51,
          49,
        ),
      ]),
    ],
  };
}
