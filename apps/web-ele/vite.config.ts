import { defineConfig } from '@vben/vite-config';

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
        // 不把 element-plus 打进 @layer：生产环境 @layer el 会被 Tailwind 盖掉，
        // 按钮丢失圆角和主色。无层样式与 pnpm dev 一致。
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
          'monaco-editor',
          '@form-create/designer',
          '@form-create/element-ui',
          'jquery',
          'jsbarcode',
          'bwip-js',
          'vue-plugin-hiprint',
        ],
      },
    },
  };
});
