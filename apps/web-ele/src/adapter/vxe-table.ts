import type { FormValues } from '@vben/common-ui';
import type { VxeTableGridOptions } from '@vben/plugins/vxe-table';
import type { Recordable } from '@vben/types';

import type { ComponentPropsMap, ComponentType } from './component';

import { h } from 'vue';

import {
  setupVbenVxeTable,
  useVbenVxeGrid as useGrid,
} from '@vben/plugins/vxe-table';
import { get, isFunction, isString } from '@vben/utils';

import { ElButton, ElImage, ElMessageBox, ElSwitch, ElTag } from 'element-plus';

import { $t } from '#/locales';

import { useVbenForm } from './form';

setupVbenVxeTable({
  configVxeTable: (vxeUI) => {
    vxeUI.setConfig({
      grid: {
        align: 'center',
        border: false,
        columnConfig: {
          resizable: true,
        },
        minHeight: 180,
        formConfig: {
          enabled: false,
        },
        proxyConfig: {
          autoLoad: true,
          response: {
            result: 'items',
            total: 'total',
            list: 'items',
          },
          showActiveMsg: true,
          showResponseMsg: false,
        },
        round: true,
        showOverflow: true,
        size: 'small',
      } as VxeTableGridOptions,
    });

    vxeUI.renderer.forEach((_item, key) => {
      if (key.startsWith('Cell')) {
        vxeUI.renderer.delete(key);
      }
    });

    vxeUI.renderer.add('CellImage', {
      renderTableDefault(renderOpts, params) {
        const { props } = renderOpts;
        const { column, row } = params;
        const src = row[column.field];
        return h(ElImage, { src, previewSrcList: [src], ...props });
      },
    });

    vxeUI.renderer.add('CellLink', {
      renderTableDefault(renderOpts) {
        const { props } = renderOpts;
        return h(
          ElButton,
          { size: 'small', link: true },
          { default: () => props?.text },
        );
      },
    });

    /** 状态/类型 Tag 渲染 */
    vxeUI.renderer.add('CellTag', {
      renderTableDefault({ options, props }, { column, row }) {
        const value = get(row, column.field);
        const tagOptions = options ?? [
          { label: $t('common.enabled'), type: 'success', value: 1 },
          { label: $t('common.disabled'), type: 'danger', value: 0 },
        ];
        const tagItem = tagOptions.find((item: any) => item.value === value);
        return h(
          ElTag,
          {
            ...props,
            type: tagItem?.type || tagItem?.color || 'info',
          },
          { default: () => tagItem?.label ?? value },
        );
      },
    });

    /** 启用/禁用开关，支持 beforeChange 拦截 */
    vxeUI.renderer.add('CellSwitch', {
      renderTableDefault({ attrs, props }, { column, row }) {
        const loadingKey = `__loading_${column.field}`;
        async function onChange(newVal: any) {
          row[loadingKey] = true;
          try {
            const result = await attrs?.beforeChange?.(newVal, row);
            if (result !== false) {
              row[column.field] = newVal;
            }
          } finally {
            row[loadingKey] = false;
          }
        }
        return h(ElSwitch, {
          activeText: $t('common.enabled'),
          inactiveText: $t('common.disabled'),
          activeValue: 1,
          inactiveValue: 0,
          ...props,
          modelValue: row[column.field],
          loading: row[loadingKey] ?? false,
          'onUpdate:modelValue': onChange,
        });
      },
    });

    /** 表格操作列：edit / delete / 自定义按钮 */
    vxeUI.renderer.add('CellOperation', {
      renderTableDefault({ attrs, options, props }, { column, row }) {
        const presets: Recordable<Recordable<any>> = {
          delete: {
            type: 'danger',
            text: $t('common.delete'),
          },
          edit: {
            text: $t('common.edit'),
          },
          detail: {
            text: $t('common.detail'),
          },
        };
        const operations = (options || ['edit', 'delete'])
          .map((opt: any) => {
            if (isString(opt)) {
              return presets[opt]
                ? { code: opt, ...presets[opt] }
                : { code: opt, text: opt };
            }
            return { ...presets[opt.code], ...opt };
          })
          .map((opt: any) => {
            const mapped: Recordable<any> = {};
            Object.keys(opt).forEach((key) => {
              mapped[key] = isFunction(opt[key]) ? opt[key](row) : opt[key];
            });
            return mapped;
          })
          .filter((opt: any) => opt.show !== false);

        return h(
          'div',
          {
            class: 'flex items-center justify-center gap-1',
            style: { justifyContent: column.align || 'center' },
          },
          operations.map((opt: any) => {
            const onClick = async () => {
              if (opt.code === 'delete') {
                try {
                  await ElMessageBox.confirm(
                    $t('ui.actionMessage.deleteConfirm', [
                      row[attrs?.nameField || 'name'],
                    ]),
                    $t('common.prompt'),
                    { type: 'warning' },
                  );
                } catch {
                  return;
                }
              }
              attrs?.onClick?.({ code: opt.code, row });
            };
            return h(
              ElButton,
              {
                size: 'small',
                link: true,
                type: opt.type === 'danger' ? 'danger' : 'primary',
                ...props,
                onClick,
              },
              { default: () => opt.text },
            );
          }),
        );
      },
    });
  },
  useVbenForm,
});

export const useVbenVxeGrid = <
  T extends Record<string, any>,
  TFormValues extends FormValues = FormValues,
  TSubmitValues extends FormValues = TFormValues,
>(
  ...rest: Parameters<
    typeof useGrid<
      T,
      ComponentType,
      ComponentPropsMap,
      TFormValues,
      TSubmitValues
    >
  >
) =>
  useGrid<T, ComponentType, ComponentPropsMap, TFormValues, TSubmitValues>(
    ...rest,
  );

export type * from '@vben/plugins/vxe-table';
export type OnActionClickParams<T = Recordable<any>> = {
  code: string;
  row: T;
};
export type OnActionClickFn<T = Recordable<any>> = (
  params: OnActionClickParams<T>,
) => void;
