<script lang="ts" setup>
import type {
  PrintExprHelpField,
  PrintExprHelpScene,
} from '../runtime/print-expr-catalog';
import type { PrintExprFunction } from '../runtime/print-expr-functions';

import { computed, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElDialog,
  ElInput,
  ElOption,
  ElSelect,
  ElTabPane,
  ElTabs,
} from 'element-plus';

import { requireDefined } from '../../../../../../../shared/require-defined';
import { TABLE_COLUMN_PRESETS } from '../data/fields';
import { validatePrintExpr } from '../runtime/print-expr';
import {
  groupPrintExprHelpFields,
  PRINT_EXPR_OPERATOR_CHIPS,
  PRINT_EXPR_SCENE_META,
} from '../runtime/print-expr-catalog';
import {
  buildPrintFunctionExpression,
  PRINT_EXPR_FUNCTIONS,
} from '../runtime/print-expr-functions';
import PrintExprConditionInput from './print-expr-condition-input.vue';
import PrintExprValueInput from './print-expr-value-input.vue';

const props = defineProps<{
  context?: Record<string, unknown>;
  expanded?: boolean;
  fields?: PrintExprHelpField[];
  initialPane?: string;
  scene: PrintExprHelpScene;
}>();
const emit = defineEmits<{ insert: [string] }>();
const open = ref(!!props.expanded);
const pane = ref(props.initialPane || 'values');
const search = ref('');
const category = ref('all');
const selected = ref<null | PrintExprFunction>(null);
let argumentId = 0;
const argument = (value = '') => ({ id: ++argumentId, value });
const args = ref<Array<ReturnType<typeof argument>>>([]);
const nestedOpen = ref(false);
const nestedLabel = ref('');
let nestedInsert: ((token: string) => void) | undefined;
let nestedToken = '';
function openNestedFunction(insert: (token: string) => void, label: string) {
  nestedInsert = insert;
  nestedLabel.value = label;
  nestedToken = '';
  nestedOpen.value = true;
}
function applyNestedFunction(token: string) {
  nestedToken = token;
  nestedOpen.value = false;
}
function finishNestedFunction() {
  if (nestedToken) nestedInsert?.(nestedToken);
  nestedToken = '';
  nestedInsert = undefined;
}

const meta = computed(() => PRINT_EXPR_SCENE_META[props.scene]);
// 同名字段只保留优先级最高的一项，避免把当前行 amount 标成协议金额。
const fields = computed(() =>
  (props.fields || []).filter(
    (item, index, all) =>
      all.findIndex((f) => f.value === item.value) === index,
  ),
);
const matches = (text: string) =>
  text.toLowerCase().includes(search.value.trim().toLowerCase());
const groups = computed(() =>
  groupPrintExprHelpFields(
    fields.value.filter((item) =>
      matches(`${item.label} ${item.value} ${item.group}`),
    ),
  ),
);
const tables = computed(() =>
  fields.value.filter((item) => item.group === '整表'),
);
const functions = computed(() =>
  PRINT_EXPR_FUNCTIONS.filter(
    (item) =>
      (category.value === 'all' || item.group === category.value) &&
      matches(`${item.name} ${item.title} ${item.description}`),
  ),
);
const categories = [...new Set(PRINT_EXPR_FUNCTIONS.map((item) => item.group))];
const tableColumns = computed(() => {
  const tableName = args.value[0]?.value || '';
  const rows = props.context?.[tableName];
  const presets = TABLE_COLUMN_PRESETS[tableName] || [];
  const names = new Set(presets.map((item) => item.field));
  if (Array.isArray(rows))
    for (const row of rows)
      if (row && typeof row === 'object')
        Object.keys(row).forEach((key) => names.add(key));
  return [...names].map((value) => ({
    value,
    label: presets.find((item) => item.field === value)?.title || value,
  }));
});
const parameters = computed(() => {
  if (!selected.value) return [];
  const item = selected.value;
  return args.value.map((_, index) => {
    if (item.name === 'IFS' && index === args.value.length - 1)
      return { label: '默认值（可留空）' };
    if (item.name === 'IFS')
      return {
        label: `${index % 2 === 0 ? '条件' : '结果'} ${Math.floor(index / 2) + 1}`,
        kind: index % 2 === 0 ? ('condition' as const) : undefined,
      };
    return (
      item.parameters[index] || {
        label: `${item.repeat?.[0] || '值'} ${index + 1}`,
        kind: ['AND', 'NOT', 'OR'].includes(item.name)
          ? ('condition' as const)
          : undefined,
      }
    );
  });
});
const formula = computed(() =>
  selected.value
    ? buildPrintFunctionExpression(
        selected.value,
        args.value.map((arg, index) => {
          const kind = parameters.value[index]?.kind;
          if (kind === 'column')
            return arg.value ? JSON.stringify(arg.value) : '';
          return arg.value;
        }),
      )
    : '',
);
const check = computed(() =>
  formula.value && props.context
    ? validatePrintExpr(formula.value, props.context)
    : null,
);
const examples = computed(() => {
  const scalar = fields.value.find(
    (item) => item.group !== '整表' && item.group !== '行位置',
  )?.value;
  const tableName = tables.value[0]?.value;
  return [
    ...(scalar
      ? [
          {
            label: '空值显示“无”',
            insert: `IF(EMPTY(${scalar}), "无", ${scalar})`,
          },
          { label: '字段不为空时通过', insert: `!EMPTY(${scalar})` },
        ]
      : []),
    ...(tableName
      ? [{ label: '表格有数据时通过', insert: `COUNT(${tableName}) > 0` }]
      : []),
    { label: '四舍五入到两位小数', insert: 'ROUND(12.345, 2)' },
    {
      label: '多条件取值 IFS',
      insert: 'IFS(100 > 200, "高", 100 > 0, "低", "无")',
    },
  ];
});

function chooseFunction(item: PrintExprFunction) {
  selected.value = item;
  args.value = item.parameters.map((p) => argument(p.initial));
  if (item.parameters[0]?.kind === 'table')
    requireDefined(args.value[0]).value = tables.value[0]?.value || '';
}
function addArgument() {
  if (selected.value?.name === 'IFS')
    args.value.splice(-1, 0, argument(), argument());
  else args.value.push(argument());
}
function removeArgument(index: number) {
  if (selected.value?.name === 'IFS') args.value.splice(index - (index % 2), 2);
  else args.value.splice(index, 1);
}
watch(
  () => args.value[0]?.value,
  () => {
    if (
      selected.value?.parameters[1]?.kind === 'column' &&
      args.value[1] &&
      !tableColumns.value.some((col) => col.value === args.value[1]?.value)
    )
      args.value[1].value = '';
  },
);
watch(pane, () => {
  search.value = '';
});
</script>

<template>
  <div class="print-expr-help">
    <div v-if="!expanded" class="print-expr-help__summary">
      <span>{{ meta.summary }}</span><span>{{ meta.result }}</span>
      <ElButton
        size="small"
        text
        type="primary"
        @mousedown.prevent
        @click="open = !open"
      >
        {{ open ? '收起清单' : '全部函数与字段' }}
      </ElButton>
    </div>
    <div v-if="open || expanded" class="print-expr-help__panel">
      <ElTabs v-model="pane">
        <ElTabPane label="字段" name="values" />
        <ElTabPane label="函数" name="fn" />
        <ElTabPane label="运算符" name="operators" />
        <ElTabPane label="示例" name="examples" />
      </ElTabs>
      <ElInput
        v-if="pane === 'values' || pane === 'fn'"
        v-model="search"
        clearable
        size="small"
        :placeholder="
          pane === 'values'
            ? '搜索中文名或字段名'
            : '搜索函数名或用途，如：条件、金额、合计'
        "
        :aria-label="pane === 'values' ? '搜索字段' : '搜索函数'"
      />
      <div v-if="pane === 'values'" class="print-expr-help__scroll">
        <section
          v-for="group in groups"
          :key="group.title"
          class="print-expr-help__group"
        >
          <strong>{{ group.title }}</strong>
          <div class="print-expr-help__chips">
            <ElButton
              v-for="item in group.items"
              :key="item.value"
              size="small"
              :title="item.value"
              @mousedown.prevent
              @click="emit('insert', item.value)"
            >
              {{ item.label }} <small>{{ item.value }}</small>
            </ElButton>
          </div>
        </section>
        <p v-if="!groups.length">没有匹配字段。请检查搜索词或数据源。</p>
      </div>
      <div v-else-if="pane === 'fn'" class="print-expr-help__functions">
        <div class="print-expr-help__directory">
          <ElSelect v-model="category" size="small" aria-label="函数分类">
            <ElOption label="全部分类" value="all" /><ElOption
              v-for="item in categories"
              :key="item"
              :label="item"
              :value="item"
            />
          </ElSelect>
          <div class="print-expr-help__scroll">
            <button
              v-for="item in functions"
              :key="item.name"
              type="button"
              class="print-expr-help__function"
              :class="{ active: selected?.name === item.name }"
              @click="chooseFunction(item)"
            >
              <strong>{{ item.name }}</strong><span>{{ item.title }}</span>
            </button>
            <p v-if="!functions.length">没有匹配函数</p>
          </div>
        </div>
        <section v-if="selected" class="print-expr-help__builder">
          <strong>{{ selected.name }} · {{ selected.title }}</strong>
          <span class="print-expr-help__note">
            · 结果类型：{{ selected.result }}</span>
          <p>{{ selected.description }}</p>
          <p class="print-expr-help__example">
            示例：<code>{{ selected.example }}</code>
          </p>
          <div
            v-for="(arg, index) in args"
            :key="arg.id"
            class="print-expr-help__argument"
          >
            <strong class="print-expr-help__arg-label">{{
              parameters[index]?.label
            }}</strong>
            <div class="print-expr-help__arg-inputs">
              <ElSelect
                v-if="parameters[index]?.kind === 'table'"
                v-model="arg.value"
                filterable
                :aria-label="parameters[index]?.label"
                placeholder="选择数据表"
              >
                <ElOption
                  v-for="item in tables"
                  :key="item.value"
                  :label="`${item.label} (${item.value})`"
                  :value="item.value"
                />
              </ElSelect>
              <ElSelect
                v-else-if="parameters[index]?.kind === 'column'"
                v-model="arg.value"
                filterable
                :aria-label="parameters[index]?.label"
                placeholder="选择统计字段"
              >
                <ElOption
                  v-for="item in tableColumns"
                  :key="item.value"
                  :label="`${item.label} (${item.value})`"
                  :value="item.value"
                />
              </ElSelect>
              <ElSelect
                v-else-if="parameters[index]?.kind === 'format'"
                v-model="arg.value"
                aria-label="日期格式"
              >
                <ElOption label="日期 2026-03-15" value="&quot;date&quot;" /><ElOption
                  label="中文日期 2026年3月15日"
                  value="&quot;dateCn&quot;"
                /><ElOption label="日期时间" value="&quot;datetime&quot;" />
              </ElSelect>
              <PrintExprConditionInput
                v-else-if="parameters[index]?.kind === 'condition'"
                v-model="arg.value"
                :fields="fields"
                :label="parameters[index]!.label"
                @request-function="
                  openNestedFunction($event, parameters[index]!.label)
                "
              />
              <PrintExprValueInput
                v-else
                v-model="arg.value"
                :fields="fields"
                :label="parameters[index]!.label"
                @request-function="
                  openNestedFunction($event, parameters[index]!.label)
                "
              />
              <ElButton
                v-if="
                  selected.repeat &&
                  index >=
                    (selected.name === 'IFS'
                      ? 2
                      : selected.parameters.length) &&
                  (selected.name !== 'IFS' ||
                    (index % 2 === 0 && index < args.length - 1))
                "
                text
                type="danger"
                size="small"
                @click="removeArgument(index)"
              >
                移除
              </ElButton>
            </div>
          </div>
          <ElButton v-if="selected.repeat" size="small" @click="addArgument">
            {{ selected.name === 'IFS' ? '添加条件与结果' : '添加参数' }}
          </ElButton>
          <div class="print-expr-help__generated">
            <code>{{ formula || '请填完整参数后插入' }}</code>
          </div>
          <ElAlert
            v-if="check"
            :type="check.ok ? 'success' : 'error'"
            :closable="false"
            :title="
              check.ok ? `样例结果：${check.preview ?? ''}` : check.message
            "
          />
          <ElButton
            type="primary"
            size="small"
            :disabled="!formula || check?.ok === false"
            @click="emit('insert', formula)"
          >
            插入函数
          </ElButton>
        </section>
        <p v-else class="print-expr-help__empty">
          选择函数，查看说明并填写参数。<br />IF 用于条件取值；IFS
          用于多条件取值。
        </p>
      </div>
      <div v-else-if="pane === 'operators'" class="print-expr-help__chips">
        <ElButton
          v-for="item in PRINT_EXPR_OPERATOR_CHIPS"
          :key="item.label"
          size="small"
          @mousedown.prevent
          @click="emit('insert', item.insert)"
        >
          {{ item.label }}
        </ElButton>
        <p>
          比较用 == 或 !=；单个 = 不可用。文字需要引号。可用括号控制计算顺序。
        </p>
      </div>
      <div v-else class="print-expr-help__examples">
        <ElButton
          v-for="item in examples"
          :key="item.insert"
          @mousedown.prevent
          @click="emit('insert', item.insert)"
        >
          <span>{{ item.label }}</span><code>{{ item.insert }}</code>
        </ElButton>
      </div>
      <p class="print-expr-help__note">{{ meta.note }}</p>
    </div>
    <ElDialog
      v-model="nestedOpen"
      :title="`为「${nestedLabel}」插入函数`"
      width="min(850px, 94vw)"
      top="5vh"
      :body-style="{ maxHeight: '72vh', overflowY: 'auto' }"
      append-to-body
      destroy-on-close
      @closed="finishNestedFunction"
    >
      <p class="print-expr-help__note">
        选择函数并填写参数，结果插入「{{ nestedLabel }}」的光标位置。
      </p>
      <PrintExprHelp
        v-if="nestedOpen"
        expanded
        initial-pane="fn"
        :scene="scene"
        :fields="fields"
        :context="context"
        @insert="applyNestedFunction"
      />
      <template #footer>
        <ElButton @click="nestedOpen = false">取消</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.print-expr-help {
  margin-top: 8px;
  container-type: inline-size;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.print-expr-help__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
  color: var(--el-text-color-secondary);
}

.print-expr-help__panel {
  padding: 10px;
  margin-top: 6px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}

.print-expr-help__panel :deep(.el-tabs__header) {
  margin-bottom: 10px;
}

.print-expr-help__panel :deep(.el-tabs__item) {
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
}

.print-expr-help__scroll {
  max-height: 240px;
  margin-top: 8px;
  overflow: auto;
}

.print-expr-help__group {
  margin-bottom: 10px;
}

.print-expr-help__group > strong {
  display: block;
  margin-bottom: 6px;
}

.print-expr-help__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.print-expr-help__chips :deep(.el-button + .el-button) {
  margin-left: 0;
}

.print-expr-help__chips small {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
}

.print-expr-help__functions {
  display: grid;
  grid-template-columns: 155px minmax(0, 1fr);
  gap: 16px;
  margin-top: 10px;
}

.print-expr-help__function {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.print-expr-help__function:hover,
.print-expr-help__function.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.print-expr-help__builder {
  min-width: 0;
}

.print-expr-help__builder p {
  margin: 6px 0;
}

.print-expr-help__example,
.print-expr-help__note {
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}

.print-expr-help__argument {
  margin-top: 10px;
}

.print-expr-help__arg-label {
  display: block;
  margin-bottom: 4px;
}

.print-expr-help__arg-inputs {
  display: flex;
  gap: 6px;
}

.print-expr-help__arg-inputs > * {
  flex: 1;
  min-width: 0;
}

.print-expr-help__generated {
  padding: 8px;
  margin: 10px 0;
  overflow-wrap: anywhere;
  background: var(--el-fill-color);
  border-radius: 4px;
}

.print-expr-help__builder > :deep(.el-alert) {
  margin-bottom: 8px;
}

.print-expr-help__note {
  margin: 10px 0 0;
}

.print-expr-help__examples {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}

.print-expr-help__examples :deep(.el-button) {
  height: auto;
  padding: 8px;
  margin: 0;
  white-space: normal;
}

.print-expr-help__examples :deep(.el-button > span) {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: start;
  text-align: left;
  overflow-wrap: anywhere;
}

.print-expr-help__empty {
  padding: 16px;
  color: var(--el-text-color-secondary);
}

@container (width < 600px) {
  .print-expr-help__functions {
    grid-template-columns: 1fr;
  }

  .print-expr-help__directory .print-expr-help__scroll {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: 150px;
  }

  .print-expr-help__arg-inputs {
    flex-wrap: wrap;
  }
}
</style>
