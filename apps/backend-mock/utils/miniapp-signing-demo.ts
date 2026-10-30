/** 固定演示数据：没有读取真实居民、协议或工作组资料，三个角色使用同一组示例。 */
export function miniappSigningDemo(viewer: {
  id: string;
  roleCode: string;
  roleRevision: number;
}) {
  return {
    dataSource: 'demo',
    unit: '户',
    updatedAt: new Date().toISOString(),
    // 前端对照请求开始时的身份，避免旧请求显示到新账号或新角色下。
    viewer: {
      id: viewer.id,
      roleCode: viewer.roleCode,
      roleRevision: viewer.roleRevision,
    },
    groups: [
      { id: 'group-1', name: '工作一组', total: 145, signed: 145 },
      { id: 'group-2', name: '工作二组', total: 100, signed: 96 },
      { id: 'group-3', name: '工作三组', total: 261, signed: 249 },
      { id: 'group-4', name: '工作四组', total: 259, signed: 241 },
      { id: 'group-5', name: '工作五组', total: 135, signed: 108 },
      { id: 'group-6', name: '工作六组', total: 360, signed: 316 },
      { id: 'group-7', name: '工作七组', total: 72, signed: 72 },
      { id: 'group-8', name: '工作八组', total: 268, signed: 237 },
    ],
  };
}
