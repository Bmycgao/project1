export * from '../../../../../shared/workflow';
export {
  WORKFLOW_AUTH,
  WORKFLOW_FIELD_CATALOG,
  WORKFLOW_PERSON_FIELDS,
} from '../../../../../shared/workflow-runtime';
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
} from '../../../../../shared/workflow';
import {
  createNode,
  newId,
  exportWorkflowJson,
  parseWorkflowJson,
} from '../../../../../shared/workflow';

export const NODE_WIDTH = 164;
export const NODE_HEIGHT = 72;
/** 箭头长度约 9。上下落差大时末端直线加长，缩小后仍从边的正中进入 */
const ARROW_RUN = 16;
const ARROW_RUN_MAX = 48;

/**
 * 计算连线路径和标签位置。
 * 通过线先沿圆点正中走一段直线，再转弯，箭头前再走一段直线。
 * @param edge 连线
 * @param nodes 全部节点，坐标为节点中心
 */
export function edgeGeometry(edge: WorkflowEdge, nodes: WorkflowNode[]) {
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);
  if (!source || !target) return null;
  if (edge.type === 'reject') {
    const sx = source.x;
    const sy = source.y + NODE_HEIGHT / 2;
    const tx = target.x;
    const ty = target.y + NODE_HEIGHT / 2;
    const bottom = Math.max(sy, ty) + 75;
    const curveY = bottom + 40;
    const y2 = ty + ARROW_RUN;
    return {
      path: `M ${sx} ${sy} C ${sx} ${curveY}, ${tx} ${curveY}, ${tx} ${y2} L ${tx} ${ty}`,
      x: (sx + tx) / 2,
      // 标签放在弧线最低处，避免压到中间的菱形或节点
      y: 0.125 * (sy + ty) + 0.75 * curveY,
      labelAbove: false,
      labelSide: 'center' as const,
    };
  }
  const sx = source.x + NODE_WIDTH / 2;
  const sy = source.y;
  const tx = target.x - NODE_WIDTH / 2;
  const ty = target.y;
  const gap = tx - sx;
  const rise = Math.abs(ty - sy);
  const run = Math.min(ARROW_RUN_MAX, Math.max(ARROW_RUN, rise * 0.35));
  const enter = gap >= run ? run : Math.max(gap, 0);
  const leave = gap - enter >= run ? run : Math.max(0, gap - enter);
  const x1 = sx + leave;
  const x2 = tx - enter;
  const span = Math.max(x2 - x1, 0);
  const bend = Math.min(40, span * 0.45);
  const path =
    leave > 0
      ? `M ${sx} ${sy} L ${x1} ${sy} C ${x1 + bend} ${sy}, ${x2 - bend} ${ty}, ${x2} ${ty} L ${tx} ${ty}`
      : `M ${sx} ${sy} C ${sx} ${sy}, ${x2 - bend} ${ty}, ${x2} ${ty} L ${tx} ${ty}`;
  const upright = span < 12;
  return {
    path,
    /** 竖直段时 x 是线的位置，标签改放到线左侧 */
    x: upright ? x1 : (sx + tx) / 2,
    y: (sy + ty) / 2,
    /** 空隙放不下标签底时，把文字抬到线上方，露出箭头 */
    labelAbove: !upright && gap < 128,
    /** 落差收成竖线时，长条件放到竖线左侧，避免压住线 */
    labelSide: upright ? ('left' as const) : ('center' as const),
  };
}

/** 连线上的文字：否则、标签、条件，都没有时显示通过 */
export function edgeCaption(edge: WorkflowEdge) {
  if (edge.isDefault) return '否则';
  return edge.label || edge.condition || '通过';
}

/**
 * 连线标签宽度。条件表达式按全文计算，不截断。
 * @param text 线上要显示的文字
 */
export function edgeLabelWidth(text: string) {
  let units = 0;
  for (const char of text) units += char.charCodeAt(0) > 255 ? 12 : 6.6;
  return Math.max(40, Math.min(260, Math.ceil(units + 16)));
}

/**
 * 连线标签的矩形和文字坐标。竖直连线时整段文字放在线左侧。
 * @param geometry edgeGeometry 的结果
 * @param text 线上要显示的全文
 */
export function edgeLabelBox(
  geometry: {
    x: number;
    y: number;
    labelAbove: boolean;
    labelSide?: 'center' | 'left';
  },
  text: string,
) {
  const width = edgeLabelWidth(text);
  const x =
    geometry.labelSide === 'left'
      ? geometry.x - width - 8
      : geometry.x - width / 2;
  const y = geometry.labelAbove ? geometry.y - 28 : geometry.y - 10;
  return {
    x,
    y,
    width,
    height: 20,
    textX: x + width / 2,
    textY: geometry.labelAbove ? geometry.y - 14 : geometry.y + 4,
  };
}
export function sampleGraph(): Pick<WorkflowDocument, 'nodes' | 'edges'> {
  const nodes = [
    createNode('start', 100, 210, 1),
    createNode('task', 350, 210, 2),
    createNode('approve', 600, 210, 3),
    createNode('condition', 850, 210, 4),
    createNode('approve', 1100, 65, 5),
    createNode('task', 1350, 210, 6),
    createNode('approve', 1600, 210, 7),
    createNode('end', 1850, 210, 8),
  ];
  const names = [
    '开始',
    '经办人填报',
    '科长审核',
    '补偿金额判断',
    '分管领导核准',
    '预签约',
    '签订确认',
    '结束',
  ];
  nodes.forEach((node, i) => {
    node.name = names[i]!;
  });
  const edges: WorkflowEdge[] = [];
  function edge(
    from: number,
    to: number,
    type: WorkflowEdge['type'] = 'pass',
    condition = '',
    isDefault = false,
  ) {
    edges.push({
      id: newId('edge'),
      source: nodes[from]!.id,
      target: nodes[to]!.id,
      type,
      condition,
      isDefault,
      label:
        type === 'reject' ? '驳回' : isDefault ? '否则' : condition || '通过',
    });
  }
  edge(0, 1);
  edge(1, 2);
  edge(2, 3);
  edge(3, 4, 'condition', 'BuChangJinE >= 1000000');
  edge(3, 5, 'condition', '', true);
  edge(4, 5);
  edge(5, 6);
  edge(6, 7);
  edge(2, 1, 'reject');
  edge(4, 2, 'reject');
  edge(6, 5, 'reject');
  return { nodes, edges };
}

/** 在浏览器下载流程设计 JSON */
export function downloadWorkflowJson(doc: WorkflowDocument) {
  const text = exportWorkflowJson(doc);
  const code = (doc.code || 'workflow').replace(/[^\w-]+/g, '_') || 'workflow';
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${code}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * 从本地文件读取并解析流程 JSON
 * @param file 用户选择的 .json 文件
 */
export async function readWorkflowJsonFile(file: File) {
  if (file.size > 1_000_000) throw new Error('流程 JSON 过大');
  return parseWorkflowJson(await file.text());
}
