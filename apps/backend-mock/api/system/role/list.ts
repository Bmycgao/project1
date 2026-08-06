import { faker } from '@faker-js/faker';
import { eventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { getMenuIds, MOCK_MENU_LIST } from '~/utils/mock-data';
import { unAuthorizedResponse, usePageResponseSuccess } from '~/utils/response';

const formatterCN = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const menuIds = getMenuIds(MOCK_MENU_LIST);

/** 演示用角色名称 */
const CN_ROLE_NAMES = [
  '超级管理员',
  '系统管理员',
  '部门管理员',
  '普通用户',
  '财务专员',
  '人事专员',
  '仓储管理员',
  '生产调度员',
  '销售专员',
  '采购专员',
  '质检员',
  '只读访客',
  '审批人',
  '发起人',
  '运维人员',
  '数据分析师',
  '客服专员',
  '项目经理',
  '测试工程师',
  '开发工程师',
];

/** 演示用中文备注 */
const CN_REMARKS = [
  '拥有系统全部权限',
  '可管理本部门用户与菜单',
  '日常业务操作账号',
  '仅可查看，不可修改',
  '负责财务相关审批与查询',
  '负责入职、离职流程',
  '仓库出入库操作权限',
  '生产计划与工单调度',
  '客户跟进与订单录入',
  '供应商与采购单管理',
];

/**
 * 生成角色列表 Mock 数据
 * @param count 条数
 */
function generateMockDataList(count: number) {
  const dataList = [];

  for (let i = 0; i < count; i++) {
    const dataItem: Record<string, any> = {
      // 短业务 ID，避免 UUID 过长
      id: `R${String(1001 + i)}`,
      name: CN_ROLE_NAMES[i % CN_ROLE_NAMES.length],
      status: faker.helpers.arrayElement([0, 1]),
      createTime: formatterCN.format(
        faker.date.between({ from: '2022-01-01', to: '2025-01-01' }),
      ),
      permissions: faker.helpers.arrayElements(menuIds),
      remark: CN_REMARKS[i % CN_REMARKS.length],
    };

    dataList.push(dataItem);
  }

  return dataList;
}

const mockData = generateMockDataList(20);

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const {
    page = 1,
    pageSize = 20,
    name,
    id,
    remark,
    startTime,
    endTime,
    status,
  } = getQuery(event);
  let listData = structuredClone(mockData);
  if (name) {
    listData = listData.filter((item) =>
      String(item.name).includes(String(name)),
    );
  }
  if (id) {
    listData = listData.filter((item) =>
      String(item.id).toLowerCase().includes(String(id).toLowerCase()),
    );
  }
  if (remark) {
    listData = listData.filter((item) =>
      String(item.remark || '').includes(String(remark)),
    );
  }
  if (startTime) {
    listData = listData.filter((item) => item.createTime >= startTime);
  }
  if (endTime) {
    listData = listData.filter((item) => item.createTime <= endTime);
  }
  if (['0', '1'].includes(status as string)) {
    listData = listData.filter((item) => item.status === Number(status));
  }
  return usePageResponseSuccess(page as string, pageSize as string, listData);
});
