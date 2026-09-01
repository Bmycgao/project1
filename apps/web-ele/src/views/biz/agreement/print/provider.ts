/**
 * 打印设计器组件库：通用积木（不预绑业务字段，字段从数据源拖到纸面）
 * @param hiprint hiprint 命名空间
 */
export function createAgreePrintProvider(hiprint: any) {
  const addElementTypes = (context: any) => {
    /** 仅接受 hiprint.init 注入的合法 context，避免二次传入类/hiprint 对象时报错 */
    if (typeof context?.addPrintElementTypes !== 'function') return;
    if (typeof context.removePrintElementTypes === 'function') {
      context.removePrintElementTypes('agreePrintModule');
    }

    /** 空白动态文本：拖上纸面后再绑 field */
    const dynamicText = {
      tid: 'agreePrintModule.dynamicText',
      title: '动态文本',
      type: 'text',
      options: {
        title: '未绑定',
        field: '',
        testData: '',
        height: 16,
        width: 200,
        fontSize: 10,
      },
    };

    /** 静态标题：只显示文字，不走打印数据 */
    const staticTitle = {
      tid: 'agreePrintModule.staticTitle',
      title: '静态标题',
      type: 'text',
      options: {
        title: '请输入标题',
        hideTitle: true,
        height: 16,
        width: 220,
        fontSize: 12,
        fontWeight: '600',
      },
    };

    const longText = {
      tid: 'agreePrintModule.longText',
      title: '长文本',
      type: 'longText',
      options: {
        title: '长文本',
        field: '',
        width: 400,
        height: 40,
      },
    };

    /** 空表：列结构在绑定数据源后可套用推荐列 */
    const table = {
      tid: 'agreePrintModule.table',
      title: '表格',
      type: 'table',
      options: {
        field: '',
        width: 550,
        height: 54,
        tableHeaderRepeat: 'page',
        tableFooterRepeat: 'last',
        columns: [
          [
            {
              title: '列1',
              field: 'col1',
              width: 180,
              align: 'left',
              colspan: 1,
              rowspan: 1,
              checked: true,
            },
            {
              title: '列2',
              field: 'col2',
              width: 180,
              align: 'left',
              colspan: 1,
              rowspan: 1,
              checked: true,
            },
            {
              title: '列3',
              field: 'col3',
              width: 190,
              align: 'right',
              colspan: 1,
              rowspan: 1,
              checked: true,
            },
          ],
        ],
      },
    };

    const qrcode = {
      tid: 'agreePrintModule.qrcode',
      title: '二维码',
      type: 'text',
      options: {
        title: '二维码',
        field: 'qrcodeContent',
        textType: 'qrcode',
        hideTitle: true,
        qrcodeLevel: 1,
        width: 50,
        height: 50,
        testData: 'AGREE:XY-2026-001',
      },
    };

    const barcode = {
      tid: 'agreePrintModule.barcode',
      title: '条形码',
      type: 'text',
      options: {
        title: '条形码',
        field: 'barcodeContent',
        textType: 'barcode',
        barcodeMode: 'CODE128',
        hideTitle: true,
        barAutoWidth: true,
        width: 160,
        height: 40,
        testData: 'XY-2026-001',
      },
    };

    context.addPrintElementTypes('agreePrintModule', [
      new hiprint.PrintElementTypeGroup('积木', [
        staticTitle,
        dynamicText,
        longText,
        table,
        qrcode,
        barcode,
        { tid: 'agreePrintModule.hline', title: '横线', type: 'hline' },
        { tid: 'agreePrintModule.vline', title: '竖线', type: 'vline' },
        { tid: 'agreePrintModule.rect', title: '矩形', type: 'rect' },
      ]),
    ]);
  };

  return { addElementTypes };
}
