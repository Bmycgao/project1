/**
 * 详情页字段权限：provide/inject + 读列模板 fieldRules
 * 另注入「整页是否可编辑」（浏览/编辑双态）
 */
import type { InjectionKey, Ref } from 'vue';

import type { AgreeFieldRule } from './field-access';

import { computed, inject, provide, ref, unref } from 'vue';

import { useAccessStore } from '@vben/stores';

import { getPageSchema } from '#/api';

import {
  DEFAULT_AGREE_FIELD_RULES,
  formatAgreeFieldValue,
  getFieldDisplayFormat,
  resolveFieldAccess,
} from './field-access';

/** 注入 key：字段规则 */
export const AGREE_FIELD_RULES_KEY: InjectionKey<Ref<AgreeFieldRule[]>> =
  Symbol('agreeFieldRules');

/** 注入 key：详情页是否处于可编辑态 */
export const AGREE_DETAIL_EDITABLE_KEY: InjectionKey<Ref<boolean>> = Symbol(
  'agreeDetailEditable',
);

/**
 * 详情壳加载字段规则并 provide
 * @param schemaId 列模板或场景 schemaId，默认 PS_AGREE_COLS
 */
export function useProvideAgreeFieldRules(schemaId = 'PS_AGREE_COLS') {
  const rules = ref<AgreeFieldRule[]>([...DEFAULT_AGREE_FIELD_RULES]);

  /** 从页面配置拉取 fieldRules */
  async function loadFieldRules() {
    try {
      const schema = await getPageSchema(schemaId);
      if (schema?.fieldRules?.length) {
        rules.value = schema.fieldRules as AgreeFieldRule[];
      }
    } catch {
      rules.value = [...DEFAULT_AGREE_FIELD_RULES];
    }
  }

  provide(AGREE_FIELD_RULES_KEY, rules);
  void loadFieldRules();

  return { rules, loadFieldRules };
}

/**
 * 详情壳注入整页编辑态（浏览=false / 编辑=true）
 * @param editable 是否可编辑
 */
export function useProvideAgreeDetailEditable(editable: Ref<boolean>) {
  provide(AGREE_DETAIL_EDITABLE_KEY, editable);
}

/**
 * 模块内使用：fieldVisible / fieldEditable / fieldFormat / isDetailPageEditable
 */
export function useAgreeFieldAccess() {
  const accessStore = useAccessStore();
  const rulesRef = inject(
    AGREE_FIELD_RULES_KEY,
    ref(DEFAULT_AGREE_FIELD_RULES),
  );
  /** 未注入时默认 true，避免配置台预览等场景误锁 */
  const editableRef = inject(AGREE_DETAIL_EDITABLE_KEY, ref(true));

  const codes = computed(() => accessStore.accessCodes);

  /**
   * 当前详情页是否处于可编辑态
   */
  function isDetailPageEditable() {
    return unref(editableRef) !== false;
  }

  /**
   * 字段是否可见
   * @param field 字段名
   */
  function fieldVisible(field: string) {
    return resolveFieldAccess(field, unref(rulesRef), codes.value).visible;
  }

  /**
   * 字段是否可编辑（整页浏览态时一律不可改）
   * @param field 字段名
   */
  function fieldEditable(field: string) {
    if (!isDetailPageEditable()) return false;
    return resolveFieldAccess(field, unref(rulesRef), codes.value).editable;
  }

  /**
   * 按 fieldRules.displayFormat 格式化展示
   * @param field 字段名
   * @param value 原始值
   */
  function fieldFormat(field: string, value: unknown) {
    const fmt = getFieldDisplayFormat(field, unref(rulesRef));
    return formatAgreeFieldValue(value, fmt);
  }

  return {
    fieldVisible,
    fieldEditable,
    fieldFormat,
    isDetailPageEditable,
    rulesRef,
  };
}
