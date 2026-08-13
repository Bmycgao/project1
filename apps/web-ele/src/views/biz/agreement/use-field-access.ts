/**
 * 详情页字段权限：provide/inject + 读列模板 fieldRules
 */
import type { InjectionKey, Ref } from 'vue';

import { computed, inject, provide, ref, unref } from 'vue';

import { useAccessStore } from '@vben/stores';

import { getPageSchema } from '#/api';

import {
  DEFAULT_AGREE_FIELD_RULES,
  formatAgreeFieldValue,
  getFieldDisplayFormat,
  resolveFieldAccess,
  type AgreeFieldRule,
} from './field-access';

/** 注入 key */
export const AGREE_FIELD_RULES_KEY: InjectionKey<Ref<AgreeFieldRule[]>> =
  Symbol('agreeFieldRules');

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
 * 模块内使用：fieldVisible / fieldEditable / fieldFormat
 */
export function useAgreeFieldAccess() {
  const accessStore = useAccessStore();
  const rulesRef = inject(AGREE_FIELD_RULES_KEY, ref(DEFAULT_AGREE_FIELD_RULES));

  const codes = computed(() => accessStore.accessCodes);

  /**
   * 字段是否可见
   * @param field 字段名
   */
  function fieldVisible(field: string) {
    return resolveFieldAccess(field, unref(rulesRef), codes.value).visible;
  }

  /**
   * 字段是否可编辑
   * @param field 字段名
   */
  function fieldEditable(field: string) {
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

  return { fieldVisible, fieldEditable, fieldFormat, rulesRef };
}
