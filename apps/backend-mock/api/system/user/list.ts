import { faker } from '@faker-js/faker';
import { eventHandler, getQuery } from 'h3';
import {
  collectDeptAndDescendantIds,
  MOCK_DEPT_IDS,
  MOCK_DEPT_TREE,
} from '~/utils/mock-dept';
import { verifyAccessToken } from '~/utils/jwt-utils';
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

/** 演示用中文姓名 */
const CN_NAMES = [
  '张三',
  '李四',
  '王五',
  '赵六',
  '钱七',
  '孙八',
  '周九',
  '吴十',
  '郑十一',
  '冯十二',
  '陈明',
  '林芳',
  '黄伟',
  '刘洋',
  '杨静',
  '徐磊',
  '朱敏',
  '高强',
  '何丽',
  '罗军',
];

/** 演示用中文备注 */
const CN_REMARKS = [
  '普通员工账号',
  '部门管理员',
  '临时测试账号',
  '实习生账号，实习结束后禁用',
  '外部协作人员',
  '系统初始化账号',
  '财务部专用',
  '生产车间账号',
  '已完成入职培训',
  '待补充手机号',
];

/**
 * 生成用户列表 Mock 数据
 * @param count 条数
 */
function generateMockDataList(count: number) {
  const dataList = [];

  for (let i = 0; i < count; i++) {
    // 短用户 ID；deptId 与部门树短 ID 对齐，便于左侧筛选
    const dataItem: Record<string, any> = {
      id: `U${String(1001 + i)}`,
      name: CN_NAMES[i % CN_NAMES.length],
      status: faker.helpers.arrayElement([0, 1]),
      createTime: formatterCN.format(
        faker.date.between({ from: '2022-01-01', to: '2025-01-01' }),
      ),
      deptId: MOCK_DEPT_IDS[i % MOCK_DEPT_IDS.length],
      remark: CN_REMARKS[i % CN_REMARKS.length],
    };

    dataList.push(dataItem);
  }

  return dataList;
}

const mockData = generateMockDataList(100);

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
    deptId,
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
  // 选中父部门时，同时返回该部门及全部下级部门的用户
  if (deptId) {
    const deptIds = collectDeptAndDescendantIds(
      MOCK_DEPT_TREE,
      String(deptId),
    );
    listData = listData.filter((item) =>
      deptIds.includes(String(item.deptId)),
    );
  }
  return usePageResponseSuccess(page as string, pageSize as string, listData);
});
