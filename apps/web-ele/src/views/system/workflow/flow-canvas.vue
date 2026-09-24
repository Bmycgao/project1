<script setup lang="ts">
import type { NodeType, WorkflowDocument, WorkflowNode } from './model';
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import {
  NODE_HEIGHT,
  NODE_LABELS,
  NODE_WIDTH,
  edgeCaption,
  edgeGeometry,
  edgeLabelBox,
} from './model';
import { printWorkflowChart } from './print-chart';

const props = defineProps<{
  document: WorkflowDocument;
  readOnly?: boolean;
  selectedNode: string;
  selectedEdge: string;
  errorNodeIds: string[];
  errorEdgeIds: string[];
}>();
const emit = defineEmits<{
  select: [kind: 'node' | 'edge' | 'none', id: string];
  move: [id: string, x: number, y: number];
  viewport: [value: WorkflowDocument['viewport']];
  add: [type: NodeType, x: number, y: number];
  connect: [source: string, target: string];
  finish: [];
}>();
const svg = ref<SVGSVGElement>();
const size = ref({ width: 800, height: 600 });
const linking = ref('');
const pointer = ref({ x: 0, y: 0 });
const marker = `flow-arrow-${useId().replaceAll(':', '')}`;
let observer: ResizeObserver | undefined;
let drag:
  | {
      kind: 'node' | 'pan';
      id: string;
      clientX: number;
      clientY: number;
      x: number;
      y: number;
    }
  | undefined;
const edges = computed(() =>
  props.document.edges
    .map((edge) => ({
      edge,
      geometry: edgeGeometry(edge, props.document.nodes),
    }))
    .filter((item) => item.geometry !== null),
);
const colors: Record<NodeType, string> = {
  start: '#15976c',
  task: '#3478d4',
  approve: '#6d5bd0',
  cc: '#0e8a96',
  parallel: '#d97706',
  subflow: '#0f766e',
  condition: '#c28b18',
  end: '#64748b',
};
function short(text: string, limit = 13) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
/** 画布节点摘要：人工/抄送显示候选人，并行显示分叉或汇聚 */
function summary(node: WorkflowNode) {
  if (node.type === 'parallel') {
    const out = props.document.edges.filter(
      (e) => e.source === node.id && e.type !== 'reject',
    ).length;
    const inn = props.document.edges.filter(
      (e) => e.target === node.id && e.type !== 'reject',
    ).length;
    if (out >= 2) return `分叉 · ${out} 路`;
    if (inn >= 2) return `汇聚 · ${inn} 路`;
    return NODE_LABELS.parallel;
  }
  if (node.type === 'subflow')
    return node.subflowCode ? `子流程 · ${node.subflowCode}` : '待绑定子流程';
  if (!['task', 'approve', 'cc'].includes(node.type))
    return NODE_LABELS[node.type];
  const person = node.type === 'cc' ? '抄送人' : '办理人';
  const { type, ids, field } = node.assignee;
  if (type === 'initiator') return `${person} · 发起人`;
  if (type === 'field')
    return field ? `表单取人 · ${field}` : `待配置${person}`;
  return ids.length
    ? `${{ role: '角色', user: '人员', departmentLeader: '部门负责人' }[type]} · ${ids.length} 项`
    : `待配置${person}`;
}
function point(clientX: number, clientY: number) {
  const rect = svg.value!.getBoundingClientRect();
  const v = props.document.viewport;
  return {
    x: (clientX - rect.left - v.x) / v.zoom,
    y: (clientY - rect.top - v.y) / v.zoom,
  };
}
function capture(event: PointerEvent) {
  svg.value?.setPointerCapture(event.pointerId);
}
function nodeDown(event: PointerEvent, node: WorkflowNode) {
  if (event.button !== 0) return;
  if (linking.value) {
    completeLink(node.id);
    return;
  }
  emit('select', 'node', node.id);
  if (props.readOnly) return;
  drag = {
    kind: 'node',
    id: node.id,
    clientX: event.clientX,
    clientY: event.clientY,
    x: node.x,
    y: node.y,
  };
  capture(event);
}
function backgroundDown(event: PointerEvent) {
  if (event.button !== 0) return;
  if (linking.value) {
    linking.value = '';
    return;
  }
  emit('select', 'none', '');
  drag = {
    kind: 'pan',
    id: '',
    clientX: event.clientX,
    clientY: event.clientY,
    x: props.document.viewport.x,
    y: props.document.viewport.y,
  };
  capture(event);
}
function beginLink(event: PointerEvent, node: WorkflowNode) {
  if (props.readOnly) return;
  linking.value = node.id;
  pointer.value = point(event.clientX, event.clientY);
  capture(event);
}
function completeLink(target: string) {
  if (linking.value && linking.value !== target)
    emit('connect', linking.value, target);
  linking.value = '';
}
function move(event: PointerEvent) {
  if (linking.value) pointer.value = point(event.clientX, event.clientY);
  if (!drag) return;
  const dx = event.clientX - drag.clientX;
  const dy = event.clientY - drag.clientY;
  if (drag.kind === 'pan')
    emit('viewport', {
      ...props.document.viewport,
      x: drag.x + dx,
      y: drag.y + dy,
    });
  else
    emit(
      'move',
      drag.id,
      Math.round((drag.x + dx / props.document.viewport.zoom) / 10) * 10,
      Math.round((drag.y + dy / props.document.viewport.zoom) / 10) * 10,
    );
}
function up(event: PointerEvent) {
  if (linking.value) {
    const target = window.document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-node-id]')
      ?.getAttribute('data-node-id');
    if (target && target !== linking.value) completeLink(target);
  }
  drag = undefined;
  if (svg.value?.hasPointerCapture(event.pointerId))
    svg.value.releasePointerCapture(event.pointerId);
  emit('finish');
}
function zoomTo(
  zoom: number,
  x = size.value.width / 2,
  y = size.value.height / 2,
) {
  const v = props.document.viewport;
  const next = Math.max(0.25, Math.min(2, zoom));
  emit('viewport', {
    zoom: next,
    x: x - ((x - v.x) * next) / v.zoom,
    y: y - ((y - v.y) * next) / v.zoom,
  });
}
function wheel(event: WheelEvent) {
  const rect = svg.value!.getBoundingClientRect();
  zoomTo(
    props.document.viewport.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1),
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
}
function fit() {
  const nodes = props.document.nodes;
  if (!nodes.length) {
    emit('viewport', { x: 60, y: 100, zoom: 1 });
    return;
  }
  const left = Math.min(...nodes.map((n) => n.x)) - 110;
  const right = Math.max(...nodes.map((n) => n.x)) + 110;
  const top = Math.min(...nodes.map((n) => n.y)) - 80;
  const bottom = Math.max(...nodes.map((n) => n.y)) + 160;
  const zoom = Math.max(
    0.25,
    Math.min(
      1.25,
      (size.value.width - 40) / (right - left),
      (size.value.height - 40) / (bottom - top),
    ),
  );
  emit('viewport', {
    zoom,
    x: size.value.width / 2 - ((left + right) / 2) * zoom,
    y: size.value.height / 2 - ((top + bottom) / 2) * zoom,
  });
}
function focusNode(id: string) {
  const node = props.document.nodes.find((n) => n.id === id);
  if (!node) return;
  emit('select', 'node', id);
  emit('viewport', {
    zoom: 1,
    x: size.value.width / 2 - node.x,
    y: size.value.height / 2 - node.y,
  });
}
function focusEdge(id: string) {
  const edge = props.document.edges.find((e) => e.id === id);
  if (!edge) return;
  const geo = edgeGeometry(edge, props.document.nodes);
  emit('select', 'edge', id);
  if (geo)
    emit('viewport', {
      zoom: 0.85,
      x: size.value.width / 2 - geo.x * 0.85,
      y: size.value.height / 2 - geo.y * 0.85,
    });
}
function drop(event: DragEvent) {
  if (props.readOnly) return;
  const type = event.dataTransfer?.getData(
    'application/workflow-node',
  ) as NodeType;
  if (type && Object.hasOwn(NODE_LABELS, type)) {
    const p = point(event.clientX, event.clientY);
    emit('add', type, p.x, p.y);
  }
}
function center() {
  return point(
    (svg.value?.getBoundingClientRect().left || 0) + size.value.width / 2,
    (svg.value?.getBoundingClientRect().top || 0) + size.value.height / 2,
  );
}
function cancelLink() {
  linking.value = '';
}
/**
 * 按节点范围打印整张流程图，不受当前缩放影响
 * @param title 打印标题
 * @param subtitle 编码、版本等说明
 */
function printChart(title: string, subtitle?: string) {
  if (!svg.value || !props.document.nodes.length)
    throw new Error('画布上还没有节点');
  const box = (
    svg.value.querySelector('g[transform]') as SVGGElement | null
  )?.getBBox();
  printWorkflowChart(svg.value, {
    title,
    subtitle,
    legend: '实线为通过或条件，红色虚线为驳回',
    viewBox: box
      ? `${box.x - 48} ${box.y - 48} ${box.width + 96} ${box.height + 140}`
      : undefined,
  });
}
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry)
      size.value = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
  });
  if (svg.value) observer.observe(svg.value);
});
onBeforeUnmount(() => observer?.disconnect());
defineExpose({ fit, focusNode, focusEdge, center, cancelLink, printChart });
</script>

<template>
  <div class="canvas-wrap" :class="{ connecting: linking }">
    <div class="canvas-hint">
      {{
        linking
          ? '选择目标节点完成连线 · Esc 取消'
          : '拖动节点调整布局 · 从右侧圆点连线 · 拖动画布平移'
      }}
    </div>
    <svg
      ref="svg"
      class="flow-svg"
      aria-label="流程设计画布"
      @pointerdown="backgroundDown"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="
        drag = undefined;
        linking = '';
      "
      @wheel.prevent="wheel"
      @dragover.prevent
      @drop.prevent="drop"
    >
      <defs>
        <pattern
          :id="`${marker}-grid`"
          :width="20 * document.viewport.zoom"
          :height="20 * document.viewport.zoom"
          patternUnits="userSpaceOnUse"
          :x="document.viewport.x"
          :y="document.viewport.y"
        >
          <circle cx="1" cy="1" r="1" fill="var(--el-border-color)" />
        </pattern>
        <marker
          :id="marker"
          markerUnits="userSpaceOnUse"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="9"
          markerHeight="9"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8595ad" />
        </marker>
        <marker
          :id="`${marker}-red`"
          markerUnits="userSpaceOnUse"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="9"
          markerHeight="9"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc5964" />
        </marker>
      </defs>
      <rect width="100%" height="100%" :fill="`url(#${marker}-grid)`" />
      <g
        :transform="`translate(${document.viewport.x}, ${document.viewport.y}) scale(${document.viewport.zoom})`"
      >
        <g
          v-for="{ edge, geometry } in edges"
          :key="edge.id"
          class="edge"
          role="button"
          tabindex="0"
          :aria-label="`连线 ${edge.label || '通过'}`"
          @pointerdown.stop="emit('select', 'edge', edge.id)"
          @keydown.enter="emit('select', 'edge', edge.id)"
        >
          <path
            :d="geometry!.path"
            fill="none"
            stroke="transparent"
            stroke-width="18"
          />
          <path
            :d="geometry!.path"
            fill="none"
            :stroke="
              selectedEdge === edge.id
                ? '#3478d4'
                : errorEdgeIds.includes(edge.id) || edge.type === 'reject'
                  ? '#dc5964'
                  : '#8595ad'
            "
            :stroke-width="selectedEdge === edge.id ? 3 : 2"
            :stroke-dasharray="edge.type === 'reject' ? '7 5' : undefined"
            :marker-end="`url(#${marker}${edge.type === 'reject' ? '-red' : ''})`"
          />
        </g>
        <g
          v-for="node in document.nodes"
          :key="node.id"
          :data-node-id="node.id"
          :transform="`translate(${node.x}, ${node.y})`"
          class="node"
          role="button"
          tabindex="0"
          :aria-label="`${NODE_LABELS[node.type]} ${node.name}`"
          @pointerdown.stop="nodeDown($event, node)"
          @keydown.enter="
            linking ? completeLink(node.id) : emit('select', 'node', node.id)
          "
        >
          <title>{{ node.name }} · {{ summary(node) }}</title>
          <path
            v-if="['condition', 'parallel'].includes(node.type)"
            d="M -82 0 L 0 -48 L 82 0 L 0 48 Z"
            fill="var(--el-bg-color)"
            :stroke="
              errorNodeIds.includes(node.id)
                ? '#dc5964'
                : selectedNode === node.id
                  ? '#3478d4'
                  : colors[node.type]
            "
            :stroke-width="selectedNode === node.id ? 3 : 1.5"
          />
          <rect
            v-else
            :x="-NODE_WIDTH / 2"
            :y="-NODE_HEIGHT / 2"
            :width="NODE_WIDTH"
            :height="NODE_HEIGHT"
            :rx="['start', 'end'].includes(node.type) ? 36 : 12"
            fill="var(--el-bg-color)"
            :stroke="
              errorNodeIds.includes(node.id)
                ? '#dc5964'
                : selectedNode === node.id
                  ? '#3478d4'
                  : 'var(--el-border-color)'
            "
            :stroke-width="selectedNode === node.id ? 3 : 1.5"
          />
          <circle cx="-59" cy="-12" r="4" :fill="colors[node.type]" />
          <text
            x="7"
            y="-7"
            text-anchor="middle"
            font-size="13"
            font-weight="600"
            fill="var(--el-text-color-primary)"
          >
            {{ short(node.name, 10) }}
          </text>
          <text
            x="0"
            y="15"
            text-anchor="middle"
            font-size="10"
            fill="var(--el-text-color-secondary)"
          >
            {{ short(summary(node), 18) }}
          </text>
          <circle
            v-if="node.type !== 'start'"
            :cx="-NODE_WIDTH / 2"
            cy="0"
            r="5"
            fill="var(--el-bg-color)"
            stroke="#94a3b8"
            stroke-width="2"
          />
          <circle
            v-if="node.type !== 'end' && !readOnly"
            :cx="NODE_WIDTH / 2"
            cy="0"
            r="6"
            class="port"
            fill="var(--el-bg-color)"
            stroke="#3478d4"
            stroke-width="2"
            @pointerdown.stop="beginLink($event, node)"
          />
        </g>
        <path
          v-if="linking && document.nodes.find((n) => n.id === linking)"
          :d="`M ${document.nodes.find((n) => n.id === linking)!.x + NODE_WIDTH / 2} ${document.nodes.find((n) => n.id === linking)!.y} L ${pointer.x} ${pointer.y}`"
          stroke="#3478d4"
          stroke-width="2"
          stroke-dasharray="6 4"
          fill="none"
          pointer-events="none"
        />
        <g
          v-for="{ edge, geometry } in edges"
          :key="`label-${edge.id}`"
          pointer-events="none"
        >
          <rect
            :x="edgeLabelBox(geometry!, edgeCaption(edge)).x"
            :y="edgeLabelBox(geometry!, edgeCaption(edge)).y"
            :width="edgeLabelBox(geometry!, edgeCaption(edge)).width"
            height="20"
            rx="6"
            fill="var(--el-bg-color)"
          />
          <text
            :x="edgeLabelBox(geometry!, edgeCaption(edge)).textX"
            :y="edgeLabelBox(geometry!, edgeCaption(edge)).textY"
            text-anchor="middle"
            font-size="11"
            :fill="
              edge.type === 'reject'
                ? '#dc5964'
                : 'var(--el-text-color-secondary)'
            "
          >
            {{ edgeCaption(edge) }}
          </text>
        </g>
      </g>
    </svg>
    <div v-if="!document.nodes.length" class="empty-canvas">
      <b>从一个开始节点出发</b><span>拖入左侧节点，或点击节点添加到画布</span>
    </div>
    <div class="canvas-controls">
      <button
        title="缩小"
        aria-label="缩小"
        @click="zoomTo(document.viewport.zoom / 1.2)"
      >
        −</button
      ><span>{{ Math.round(document.viewport.zoom * 100) }}%</span
      ><button
        title="放大"
        aria-label="放大"
        @click="zoomTo(document.viewport.zoom * 1.2)"
      >
        ＋</button
      ><i></i><button class="fit-button" @click="fit">适应画布</button>
    </div>
    <div class="legend">
      <span><i style="background: #3478d4"></i>选中</span
      ><span><i style="background: #dc5964"></i>驳回 / 校验问题</span>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrap {
  position: relative;
  height: 100%;
  min-height: 300px;
  overflow: hidden;
  background: var(--el-fill-color-lighter);
}

.flow-svg {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.flow-svg:active {
  cursor: grabbing;
}

.canvas-hint {
  position: absolute;
  top: 18px;
  left: 20px;
  z-index: 1;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  pointer-events: none;
}

.node {
  cursor: grab;
}

.edge {
  cursor: pointer;
}

.port,
.connecting .node {
  cursor: crosshair;
}

.port:hover {
  fill: #3478d4;
  r: 8;
}

.canvas-controls {
  position: absolute;
  bottom: 22px;
  left: 22px;
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 5px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  box-shadow: 0 4px 16px #00000008;
}

.canvas-controls button {
  width: 32px;
  height: 30px;
  cursor: pointer;
  border-radius: 4px;
}

.canvas-controls button:hover {
  background: var(--el-fill-color);
}

.canvas-controls span {
  width: 42px;
  font-size: 12px;
  text-align: center;
}

.canvas-controls i {
  width: 1px;
  height: 18px;
  background: var(--el-border-color);
}

.canvas-controls .fit-button {
  width: 78px;
  font-size: 12px;
}

.legend {
  position: absolute;
  right: 18px;
  bottom: 30px;
  display: flex;
  gap: 12px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  pointer-events: none;
}

.legend span {
  display: flex;
  gap: 5px;
  align-items: center;
}

.legend i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.empty-canvas {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  pointer-events: none;
}

.empty-canvas b {
  font-size: 18px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
</style>
