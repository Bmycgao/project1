/**
 * 演示用部门树（短 ID + 中文名称/备注）
 * 用户列表 deptId 与此对齐，便于左侧部门筛选
 */
export const MOCK_DEPT_TREE = [
  {
    id: 'D1001',
    pid: 0,
    name: '总公司',
    status: 1,
    createTime: '2022/01/15 09:00:00',
    remark: '集团总部',
    children: [
      {
        id: 'D1002',
        pid: 'D1001',
        name: '研发中心',
        status: 1,
        createTime: '2022/03/01 10:00:00',
        remark: '产品研发与技术支持',
        children: [
          {
            id: 'D1003',
            pid: 'D1002',
            name: '前端组',
            status: 1,
            createTime: '2023/02/10 11:00:00',
            remark: 'Web / 小程序前端',
          },
          {
            id: 'D1004',
            pid: 'D1002',
            name: '后端组',
            status: 1,
            createTime: '2023/02/10 11:00:00',
            remark: '服务端与接口开发',
          },
          {
            id: 'D1005',
            pid: 'D1002',
            name: '测试组',
            status: 1,
            createTime: '2023/05/20 14:00:00',
            remark: '功能与自动化测试',
          },
        ],
      },
      {
        id: 'D1006',
        pid: 'D1001',
        name: '产品部',
        status: 1,
        createTime: '2022/04/12 09:30:00',
        remark: '需求分析与产品规划',
      },
      {
        id: 'D1007',
        pid: 'D1001',
        name: '市场部',
        status: 1,
        createTime: '2022/05/08 09:30:00',
        remark: '品牌推广与渠道运营',
      },
      {
        id: 'D1008',
        pid: 'D1001',
        name: '人事部',
        status: 1,
        createTime: '2022/01/20 09:00:00',
        remark: '招聘、考勤与培训',
      },
      {
        id: 'D1009',
        pid: 'D1001',
        name: '财务部',
        status: 1,
        createTime: '2022/01/20 09:00:00',
        remark: '核算、报销与预算',
      },
      {
        id: 'D1010',
        pid: 'D1001',
        name: '仓储部',
        status: 0,
        createTime: '2022/06/18 15:00:00',
        remark: '已停用，业务合并至供应链',
        children: [
          {
            id: 'D1011',
            pid: 'D1010',
            name: '原料仓',
            status: 0,
            createTime: '2023/01/05 10:00:00',
            remark: '随仓储部一并停用',
          },
        ],
      },
    ],
  },
];

/** 部门短 ID 列表（供用户 Mock 关联） */
export const MOCK_DEPT_IDS = [
  'D1001',
  'D1002',
  'D1003',
  'D1004',
  'D1005',
  'D1006',
  'D1007',
  'D1008',
  'D1009',
  'D1010',
  'D1011',
];

/**
 * 在部门树中查找节点
 * @param tree 部门树
 * @param id 部门 ID
 */
export function findDeptNode(
  tree: any[],
  id: string,
): any | null {
  for (const node of tree) {
    if (String(node.id) === String(id)) {
      return node;
    }
    if (node.children?.length) {
      const found = findDeptNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 收集某部门及其全部下级部门 ID（用于「点父部门看下级用户」）
 * @param tree 部门树
 * @param id 选中的部门 ID
 */
export function collectDeptAndDescendantIds(tree: any[], id: string): string[] {
  const node = findDeptNode(tree, id);
  if (!node) {
    return [String(id)];
  }
  const ids: string[] = [];
  const walk = (n: any) => {
    ids.push(String(n.id));
    (n.children || []).forEach(walk);
  };
  walk(node);
  return ids;
}
