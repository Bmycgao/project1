<script setup lang="ts">
import type { WorkflowContext } from '../../../../shared/workflow-runtime';
import { computed, ref, useId } from 'vue';
import { ElButton, ElDialog, ElEmpty, ElMessage, ElTag } from 'element-plus';
import {
  edgeCaption,
  edgeGeometry,
  edgeLabelBox,
} from '../system/workflow/model';
import { printWorkflowChart } from '../system/workflow/print-chart';
import { ACTION_LABELS } from '../../../../shared/workflow-runtime';
const props = defineProps<{ context: WorkflowContext }>();
const selected = ref('');
const visible = ref(false);
const chart = ref<SVGSVGElement>();
const arrowId = `workflow-arrow-${useId()}`;
const visited = computed(
  () => new Set(props.context.instance.events.map((e) => e.nodeId)),
);
const traversed = computed(
  () => new Set(props.context.instance.events.flatMap((e) => e.edgeIds)),
);
const bounds = computed(() => {
  const n = props.context.definition.nodes;
  if (!n.length) return '0 0 800 400';
  const x = Math.min(...n.map((i) => i.x)) - 120;
  const y = Math.min(...n.map((i) => i.y)) - 80;
  // 底部留出驳回弧线和线上的文字
  return `${x} ${y} ${Math.max(...n.map((i) => i.x)) - x + 120} ${Math.max(...n.map((i) => i.y)) - y + 260}`;
});
/** 连线路径和标签位置，标签在节点之后再画 */
const edgeViews = computed(() =>
  props.context.definition.edges
    .map((edge) => ({
      edge,
      geometry: edgeGeometry(edge, props.context.definition.nodes),
    }))
    .filter((item) => item.geometry),
);
const selectedEvents = computed(() =>
  props.context.instance.events.filter((e) => e.nodeId === selected.value),
);
/**
 * 运行图上的节点状态
 * @param id 节点 id
 */
function nodeStatus(id: string) {
  const active =
    props.context.instance.currentNodeId === id &&
    (props.context.instance.status === 'running' ||
      props.context.instance.status === 'suspended');
  if (active)
    return {
      fill: '#e8f3ff',
      stroke: '#3478d4',
      width: 3.5,
      label: '办理中',
    };
  if (visited.value.has(id))
    return {
      fill: '#e7f6ef',
      stroke: '#15976c',
      width: 2.5,
      label: '已完成',
    };
  return {
    fill: 'var(--el-bg-color)',
    stroke: '#94a3b8',
    width: 1.5,
    label: '未到达',
  };
}
function select(id: string) {
  selected.value = id;
  visible.value = true;
}
/** 打印运行中的流程图，含已到达、当前节点和驳回红线 */
function printChart() {
  if (!chart.value || !props.context.definition.nodes.length) {
    ElMessage.warning('没有可打印的流程图');
    return;
  }
  try {
    printWorkflowChart(chart.value, {
      title: props.context.instance.title || props.context.definition.name,
      subtitle: `${props.context.definition.name} · 运行流程图`,
      legend: '绿色已完成，蓝色办理中，灰色未到达，红色虚线为已发生驳回',
    });
  } catch (error) {
    ElMessage.warning(error instanceof Error ? error.message : '无法打印');
  }
}
</script>
<template>
  <div class="trace-wrap">
    <div class="trace-legend">
      <span class="legend-done">● 已完成</span>
      <span class="legend-current">● 办理中</span>
      <span class="legend-wait">● 未到达</span>
      <span style="color: #dc5964">┄ 已发生驳回</span>
      <span>点击节点查看记录</span>
      <ElButton size="small" @click="printChart">打印</ElButton>
    </div>
    <svg
      ref="chart"
      :viewBox="bounds"
      class="trace-svg"
      role="img"
      aria-label="运行中的流程图"
    >
      <defs>
        <marker
          :id="arrowId"
          markerUnits="userSpaceOnUse"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="9"
          markerHeight="9"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      <g v-for="{ edge, geometry } in edgeViews" :key="edge.id">
        <path
          :d="geometry!.path"
          :marker-end="`url(#${arrowId})`"
          fill="none"
          :stroke="
            traversed.has(edge.id)
              ? edge.type === 'reject'
                ? '#dc5964'
                : '#15976c'
              : '#cbd5e1'
          "
          :stroke-width="traversed.has(edge.id) ? 3 : 1.5"
          :stroke-dasharray="edge.type === 'reject' ? '7 5' : undefined"
        />
      </g>
      <g
        v-for="node in context.definition.nodes"
        :key="node.id"
        :transform="`translate(${node.x}, ${node.y})`"
        role="button"
        tabindex="0"
        :aria-label="`查看节点 ${node.name}`"
        style="cursor: pointer"
        @click="select(node.id)"
        @keydown.enter="select(node.id)"
      >
        <path
          v-if="node.type === 'condition'"
          d="M -82 0 L 0 -48 L 82 0 L 0 48 Z"
          :fill="nodeStatus(node.id).fill"
          :stroke="nodeStatus(node.id).stroke"
          :stroke-width="nodeStatus(node.id).width"
        />
        <rect
          v-else
          x="-82"
          y="-36"
          width="164"
          height="72"
          :rx="['start', 'end'].includes(node.type) ? 36 : 12"
          :fill="nodeStatus(node.id).fill"
          :stroke="nodeStatus(node.id).stroke"
          :stroke-width="nodeStatus(node.id).width"
        />
        <text
          x="0"
          y="-4"
          text-anchor="middle"
          font-size="13"
          font-weight="650"
          fill="var(--el-text-color-primary)"
        >
          {{ node.name }}
        </text>
        <text
          x="0"
          y="16"
          text-anchor="middle"
          font-size="12"
          font-weight="650"
          :fill="nodeStatus(node.id).stroke"
        >
          {{ nodeStatus(node.id).label }}
        </text>
      </g>
      <g
        v-for="{ edge, geometry } in edgeViews"
        :key="`label-${edge.id}`"
        pointer-events="none"
      >
        <rect
          :x="edgeLabelBox(geometry!, edgeCaption(edge)).x"
          :y="edgeLabelBox(geometry!, edgeCaption(edge)).y"
          :width="edgeLabelBox(geometry!, edgeCaption(edge)).width"
          height="20"
          rx="6"
          fill="#ffffff"
        />
        <text
          :x="edgeLabelBox(geometry!, edgeCaption(edge)).textX"
          :y="edgeLabelBox(geometry!, edgeCaption(edge)).textY"
          text-anchor="middle"
          font-size="11"
          :fill="edge.type === 'reject' ? '#dc5964' : '#64748b'"
        >
          {{ edgeCaption(edge) }}
        </text>
      </g>
    </svg>
    <ElDialog
      v-model="visible"
      :title="context.definition.nodes.find((n) => n.id === selected)?.name"
      width="560px"
      ><div
        v-for="task in context.instance.tasks.filter(
          (t) => t.nodeId === selected,
        )"
        :key="task.id"
        class="task-record"
      >
        <b>{{ task.assigneeNames.join('、') }}</b>
        <p>到达：{{ new Date(task.arrivedAt).toLocaleString('zh-CN') }}</p>
        <p v-if="task.completedAt">
          办理：{{ new Date(task.completedAt).toLocaleString('zh-CN') }}
        </p>
        <ElTag size="small">{{
          task.status === 'pending'
            ? '待办理'
            : task.status === 'rejected'
              ? '已驳回'
              : '已办理'
        }}</ElTag>
      </div>
      <div v-for="event in selectedEvents" :key="event.id" class="task-record">
        <b>{{ event.actorName }} · {{ ACTION_LABELS[event.action] }}</b>
        <p>{{ event.opinion || '无补充意见' }}</p>
        <small>{{ new Date(event.at).toLocaleString('zh-CN') }}</small>
      </div>
      <ElEmpty
        v-if="
          !selectedEvents.length &&
          !context.instance.tasks.some((t) => t.nodeId === selected)
        "
        description="尚未到达此节点"
    /></ElDialog>
  </div>
</template>
<style scoped>
.trace-wrap {
  padding: 16px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
}

.trace-svg {
  width: 100%;
  min-width: 700px;
  min-height: 210px;
  max-height: 360px;
}

.trace-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.legend-done {
  font-weight: 650;
  color: #15976c;
}

.legend-current {
  font-weight: 650;
  color: #3478d4;
}

.legend-wait {
  color: #94a3b8;
}

.task-record {
  padding: 12px;
  font-size: 13px;
  line-height: 1.8;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
</style>
