import { defineConfig, viteCssLayerPlugin } from '@vben/vite-config';

import ElementPlus from 'unplugin-element-plus/vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig(async () => {
  const monacoPlugin =
    typeof (monacoEditorPlugin as any).default === 'function'
      ? (monacoEditorPlugin as any).default({
          languageWorkers: ['editorWorkerService', 'json'],
        })
      : (monacoEditorPlugin as any)({
          languageWorkers: ['editorWorkerService', 'json'],
        });

  return {
    application: {},
    vite: {
      plugins: [
        // element-plus 的 css 包进 @layer el，使 Tailwind 工具类可覆盖组件样式
        viteCssLayerPlugin({ layerName: 'el', packageName: 'element-plus' }),
        ElementPlus({ format: 'esm' }),
        monacoPlugin,
      ],
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
            // mock代理目标地址
            target: 'http://localhost:5320/api',
            ws: true,
          },
        },
      },
      optimizeDeps: {
        include: [
          'epic-designer',
          '@epic-designer/element-plus',
          'monaco-editor',
          '@form-create/designer',
          '@form-create/element-ui',
        ],
      },
    },
  };
});
