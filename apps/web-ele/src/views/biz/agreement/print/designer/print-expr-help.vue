<script lang="ts" setup>
import type {
  PrintExprHelpField,
  PrintExprHelpScene,
} from '../runtime/print-expr-catalog';

/**
 * 表达式两层帮助：一行摘要 + 展开后三个 Tab（可用值 / 判断 / 函数）。
 * 长文本仍用四宫格折叠；这里按场景只先展示最常用的值。
 */
import { computed, ref, watch } from 'vue';

import { ElButton, ElTabPane, ElTabs } from 'element-plus';

import {
  groupPrintExprHelpFields,
  PRINT_EXPR_CALC_GROUPS,
  PRINT_EXPR_JUDGE_GROUPS,
  PRINT_EXPR_OPERATOR_CHIPS,
  PRINT_EXPR_SCENE_META,
  splitPrintExprHelpFields,
} from '../runtime/print-expr-catalog';

const props = defineProps<{
  /** 当前场景可点插入的字段 */
  fields?: PrintExprHelpField[];
  /** 筛行 / 列公式 / 单格 / 显隐 / 颜色 */
  scene: PrintExprHelpScene;
}>();

const emit = defineEmits<{
  /** 把片段插入当前表达式 */
  insert: [string];
}>();

const open = ref(false);
const pane = ref('values');
const extraOpen = ref(false);
const meta = computed(() => PRINT_EXPR_SCENE_META[props.scene]);
const splitFields = computed(() =>
  splitPrintExprHelpFields(props.scene, props.fields || []),
);
const primaryGroups = computed(() =>
  groupPrintExprHelpFields(splitFields.value.primary),
);
const extraGroups = computed(() =>
  groupPrintExprHelpFields(splitFields.value.extra),
);

watch(open, (visible) => {
  if (!visible) return;
  pane.value = 'values';
  extraOpen.value = false;
});

/** 点芯片插入，阻止 mousedown 以免输入框失焦 */
function insertToken(token: string) {
  emit('insert', token);
}
</script>

<template>
  <div class="print-expr-help">
    <div class="print-expr-help__summary">
      <span>{{ meta.summary }}</span>
      <span class="print-expr-help__result">{{ meta.result }}</span>
      <ElButton size="small" text type="primary" @click="open = !open">
        {{ open ? '收起清单' : '全部函数与字段' }}
      </ElButton>
    </div>
    <div v-if="open" class="print-expr-help__panel">
      <ElTabs v-model="pane" class="print-expr-help__tabs">
        <ElTabPane lazy label="可用值" name="values">
          <section
            v-for="group in primaryGroups"
            :key="group.title"
            class="print-expr-help__group"
          >
            <strong>{{ group.title }}</strong>
            <div class="print-expr-help__chips">
              <ElButton
                v-for="item in group.items"
                :key="`${group.title}-${item.value}`"
                size="small"
                :title="`插入 ${item.value}`"
                @mousedown.prevent
                @click="insertToken(item.value)"
              >
                {{ item.label }}
              </ElButton>
            </div>
          </section>
          <p v-if="primaryGroups.length === 0" class="print-expr-help__note">
            当前没有可插入的字段，请先绑定数据源或列。
          </p>
          <ElButton
            v-if="extraGroups.length"
            class="print-expr-help__more"
            size="small"
            text
            type="primary"
            @click="extraOpen = !extraOpen"
          >
            {{ extraOpen ? '收起更多值' : '更多值（协议 / 合计 / 整表）' }}
          </ElButton>
          <template v-if="extraOpen">
            <section
              v-for="group in extraGroups"
              :key="`extra-${group.title}`"
              class="print-expr-help__group"
            >
              <strong>{{ group.title }}</strong>
              <div class="print-expr-help__chips">
                <ElButton
                  v-for="item in group.items"
                  :key="`${group.title}-${item.value}`"
                  size="small"
                  :title="`插入 ${item.value}`"
                  @mousedown.prevent
                  @click="insertToken(item.value)"
                >
                  {{ item.label }}
                </ElButton>
              </div>
            </section>
          </template>
        </ElTabPane>
        <ElTabPane lazy label="判断" name="judge">
          <section class="print-expr-help__group">
            <strong>比较与逻辑</strong>
            <div class="print-expr-help__chips">
              <ElButton
                v-for="item in PRINT_EXPR_OPERATOR_CHIPS"
                :key="item.label"
                size="small"
                @mousedown.prevent
                @click="insertToken(item.insert)"
              >
                {{ item.label }}
              </ElButton>
            </div>
          </section>
          <section
            v-for="group in PRINT_EXPR_JUDGE_GROUPS"
            :key="group.title"
            class="print-expr-help__group"
          >
            <strong>{{ group.title }}</strong>
            <div class="print-expr-help__chips">
              <ElButton
                v-for="item in group.items"
                :key="item.label"
                size="small"
                @mousedown.prevent
                @click="insertToken(item.insert)"
              >
                {{ item.label }}
              </ElButton>
            </div>
          </section>
        </ElTabPane>
        <ElTabPane lazy label="函数" name="fn">
          <section
            v-for="group in PRINT_EXPR_CALC_GROUPS"
            :key="group.title"
            class="print-expr-help__group"
          >
            <strong>{{ group.title }}</strong>
            <div class="print-expr-help__chips">
              <ElButton
                v-for="item in group.items"
                :key="item.label"
                size="small"
                @mousedown.prevent
                @click="insertToken(item.insert)"
              >
                {{ item.label }}
              </ElButton>
            </div>
          </section>
        </ElTabPane>
      </ElTabs>
      <p class="print-expr-help__note">{{ meta.note }}</p>
    </div>
  </div>
</template>

<style scoped>
.print-expr-help {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}

.print-expr-help__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
}

.print-expr-help__result {
  color: #9ca3af;
}

.print-expr-help__panel {
  padding: 8px 10px 6px;
  margin-top: 6px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.print-expr-help__tabs :deep(.el-tabs__header) {
  margin: 0 0 8px;
}

.print-expr-help__tabs :deep(.el-tabs__item) {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.print-expr-help__group + .print-expr-help__group {
  margin-top: 8px;
}

.print-expr-help__group strong {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #374151;
}

.print-expr-help__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.print-expr-help__more {
  margin-top: 4px;
}

.print-expr-help__note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #9ca3af;
}
</style>
