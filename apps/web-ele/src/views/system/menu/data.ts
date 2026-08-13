import type { VbenFormSchema } from '#/adapter/form';
import type { OnActionClickFn, VxeTableGridColumns } from '#/adapter/vxe-table';
import type { SystemMenuApi } from '#/api/system/menu';

import { getMenuList, getPageSchemaList } from '#/api/system';
import { $t } from '#/locales';

/** 通用动态列表页组件路径 */
export const COMPONENT_DYNAMIC_LIST = '/system/dynamic-list/index';
/** 协议场景列表页组件路径 */
export const COMPONENT_AGREE_LIST = '/biz/agreement/list/index';

/** 页面组件下拉选项（方案 A） */
export function getMenuComponentOptions() {
  return [
    {
      label: '通用动态列表（按页面配置渲染列）',
      value: COMPONENT_DYNAMIC_LIST,
    },
    {
      label: '协议场景列表（电子协议 / 信息查询）',
      value: COMPONENT_AGREE_LIST,
    },
  ];
}

/**
 * 判断是否为协议场景列表组件
 * @param component 组件路径
 */
export function isAgreeListComponent(component?: string) {
  return String(component || '').includes('/biz/agreement/list');
}

/**
 * 判断是否为通用动态列表组件
 * @param component 组件路径
 */
export function isDynamicListComponent(component?: string) {
  return String(component || '').includes('dynamic-list');
}

/**
 * 拉取「实体」类页面配置（供动态列表选择）
 */
export async function fetchEntityPageSchemas() {
  const list = await getPageSchemaList();
  return (list || []).filter(
    (item) => !item.schemaKind || item.schemaKind === 'entity',
  );
}

/**
 * 拉取「场景」类页面配置（供协议列表选择）
 * 下拉展示：标题（场景码）
 */
export async function fetchScenePageSchemas() {
  const list = await getPageSchemaList();
  return (list || [])
    .filter((item) => item.schemaKind === 'scene' && item.scene)
    .map((item) => ({
      ...item,
      /** 下拉显示文案 */
      optionLabel: `${item.title}（${item.scene}）`,
    }));
}

/** 菜单类型选项（含 Tag 颜色） */
export function getMenuTypeOptions() {
  return [
    { label: $t('system.menu.typeCatalog'), type: 'primary', value: 'catalog' },
    { label: $t('system.menu.typeMenu'), type: 'info', value: 'menu' },
    { label: $t('system.menu.typeButton'), type: 'danger', value: 'button' },
    {
      label: $t('system.menu.typeEmbedded'),
      type: 'success',
      value: 'embedded',
    },
    { label: $t('system.menu.typeLink'), type: 'warning', value: 'link' },
  ];
}

/** 菜单新增/编辑表单 schema */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'RadioGroup',
      componentProps: {
        isButton: true,
        options: getMenuTypeOptions().map(({ label, value }) => ({
          label,
          value,
        })),
      },
      defaultValue: 'menu',
      fieldName: 'type',
      label: $t('system.menu.type'),
      rules: 'required',
    },
    {
      component: 'ApiTreeSelect',
      componentProps: {
        api: getMenuList,
        childrenField: 'children',
        class: 'w-full',
        labelField: 'meta.title',
        valueField: 'id',
      },
      fieldName: 'pid',
      label: $t('system.menu.parent'),
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('system.menu.menuName'),
      rules: 'required',
    },
    {
      component: 'Input',
      fieldName: 'meta.title',
      label: $t('system.menu.menuTitle'),
      rules: 'required',
    },
    {
      component: 'Input',
      componentProps: {
        placeholder: '如 /demo 或 demo（子级可相对路径）',
      },
      dependencies: {
        // 按钮权限节点不需要路由地址；其余类型必填，否则刷新会崩
        rules(values) {
          return values.type === 'button' ? null : 'required';
        },
        show(values) {
          return values.type !== 'button';
        },
        triggerFields: ['type'],
      },
      fieldName: 'path',
      label: $t('system.menu.path'),
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        class: 'w-full',
        options: getMenuComponentOptions(),
        placeholder: '请选择列表模板页',
      },
      dependencies: {
        show(values) {
          return values.type === 'menu';
        },
        triggerFields: ['type'],
      },
      fieldName: 'component',
      label: $t('system.menu.component'),
      help: '通用动态列表挂页面配置；协议场景列表挂协议场景（自动带 sceneId）',
    },
    {
      component: 'ApiSelect',
      componentProps: {
        api: fetchEntityPageSchemas,
        class: 'w-full',
        clearable: true,
        labelField: 'title',
        valueField: 'id',
      },
      dependencies: {
        show(values) {
          return (
            values.type === 'menu' && isDynamicListComponent(values.component)
          );
        },
        triggerFields: ['type', 'component'],
      },
      fieldName: 'meta.schemaId',
      label: '页面配置',
      help: '关联「页面配置」中的实体字段方案（schemaKind=entity）',
    },
    {
      component: 'ApiSelect',
      componentProps: {
        api: fetchScenePageSchemas,
        class: 'w-full',
        clearable: true,
        labelField: 'optionLabel',
        valueField: 'id',
      },
      dependencies: {
        show(values) {
          return values.type === 'menu' && isAgreeListComponent(values.component);
        },
        triggerFields: ['type', 'component'],
      },
      // 与 meta.schemaId 分开，避免双字段同名冲突；提交时再写入 schemaId+sceneId
      fieldName: 'meta.sceneSchemaId',
      label: '协议场景',
      help: '选择场景后保存时自动写入 sceneId；列表按钮与数据按场景变化',
    },
    {
      component: 'Input',
      fieldName: 'authCode',
      label: $t('system.menu.authCode'),
    },
    {
      component: 'IconPicker',
      fieldName: 'meta.icon',
      label: $t('system.menu.icon'),
    },
    {
      component: 'RadioGroup',
      componentProps: {
        isButton: true,
        options: [
          { label: $t('common.enabled'), value: 1 },
          { label: $t('common.disabled'), value: 0 },
        ],
      },
      defaultValue: 1,
      fieldName: 'status',
      label: $t('system.menu.status'),
    },
  ];
}

/**
 * 菜单树表格列
 * @param onActionClick 操作回调
 * @param actionAccess 按 System:Menu:* 控制
 */
export function useColumns(
  onActionClick: OnActionClickFn<SystemMenuApi.SystemMenu>,
  actionAccess?: {
    canCreate?: boolean;
    canDelete?: boolean;
    canEdit?: boolean;
  },
): VxeTableGridColumns<SystemMenuApi.SystemMenu> {
  const canCreate = actionAccess?.canCreate !== false;
  const canEdit = actionAccess?.canEdit !== false;
  const canDelete = actionAccess?.canDelete !== false;
  return [
    {
      align: 'left',
      field: 'meta.title',
      fixed: 'left',
      slots: { default: 'title' },
      title: $t('system.menu.menuTitle'),
      treeNode: true,
      width: 240,
    },
    {
      align: 'center',
      cellRender: { name: 'CellTag', options: getMenuTypeOptions() },
      field: 'type',
      title: $t('system.menu.type'),
      width: 100,
    },
    {
      field: 'authCode',
      title: $t('system.menu.authCode'),
      minWidth: 160,
    },
    { align: 'left', field: 'path', title: $t('system.menu.path'), minWidth: 160 },
    {
      align: 'left',
      field: 'component',
      minWidth: 180,
      title: $t('system.menu.component'),
    },
    {
      cellRender: { name: 'CellTag' },
      field: 'status',
      title: $t('system.menu.status'),
      width: 90,
    },
    {
      align: 'center',
      cellRender: {
        attrs: { nameField: 'name', onClick: onActionClick },
        name: 'CellOperation',
        options: [
          { code: 'append', text: '新增下级', show: canCreate },
          { code: 'edit', show: canEdit },
          { code: 'delete', show: canDelete },
        ],
      },
      field: 'operation',
      fixed: 'right',
      title: $t('system.menu.operation'),
      width: 200,
    },
  ];
}
