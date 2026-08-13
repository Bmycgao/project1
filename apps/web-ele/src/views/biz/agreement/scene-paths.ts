/**
 * 协议场景 → 列表菜单路径（详情页侧栏高亮 / 返回列表共用）
 */
export const AGREE_SCENE_LIST_PATH: Record<string, string> = {
  entry: '/e-agree/entry',
  lawyer_audit: '/e-agree/lawyer-audit',
  preview: '/e-query/preview',
  view: '/e-query/view',
};

/**
 * 根据场景码取列表路径
 * @param scene 场景码
 */
export function getAgreeListPathByScene(scene?: string) {
  const key = String(scene || '').trim();
  return AGREE_SCENE_LIST_PATH[key] || AGREE_SCENE_LIST_PATH.entry;
}
