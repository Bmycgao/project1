import type { Plugin } from 'vite';

interface CssLayerRule {
  /** 层名，需在 css 中先于 @import 'tailwindcss' 首次出现（见 internal/tailwind-config/theme.css） */
  layerName: string;
  /** 需要包层的包名（匹配该包在 node_modules 下的 css 模块 id） */
  packageName: string;
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * 去掉 BOM、@charset、块注释，避免 :root 判断被这些前缀挡住
 * @param code 原始 css 文本
 */
function stripCssPreamble(code: string) {
  return code
    .replace(/^\uFEFF/, '')
    .replace(/^(\s*@charset\s+[^;]+;\s*)+/i, '')
    .replace(/^(\s*\/\*[\s\S]*?\*\/\s*)+/, '')
    .trimStart();
}

/**
 * Element Plus 的 :root 变量文件不能进 @layer：
 * 进层后生产环境 --el-border-radius-base / --el-color-primary 会失效，按钮变方角、无主色。
 * @param file 模块路径
 * @param code css 文本
 */
function isElementCssVarsFile(file: string, code: string) {
  if (/(?:el-var|css-vars)\.css$/i.test(file)) {
    return true;
  }
  const body = stripCssPreamble(code);
  return body.startsWith(':root') && body.includes('--el-color-primary');
}

/**
 * 把指定包内的 css 包进 @layer：
 * 组件库的 css 是无层样式，无层样式在级联中永远压过 @layer 内的 Tailwind 工具类；
 * 包层后由 theme.css 的层声明决定顺序（utilities 排在组件库层之后），
 * 使 Tailwind 工具类可以覆盖组件库样式。
 *
 * @example
 * ```ts
 * plugins: [viteCssLayerPlugin({ packageName: 'element-plus', layerName: 'el' })]
 * ```
 */
export function viteCssLayerPlugin(
  rules: CssLayerRule | CssLayerRule[],
): Plugin {
  const list = Array.isArray(rules) ? rules : [rules];
  const matchers = list.map(({ layerName, packageName }) => ({
    layerName,
    regex: new RegExp(`${escapeRegExp(packageName)}[\\\\/].+\\.css$`, 'i'),
  }));
  return {
    name: 'vite-plugin-css-layer',
    enforce: 'pre',
    transform(code, id) {
      const [file] = id.split('?', 1);
      if (!file) return;

      const matched = matchers.find((m) => m.regex.test(file));
      if (!matched) return;

      // 变量文件保持无层，组件 css 仍进 @layer el
      if (isElementCssVarsFile(file, code)) {
        return;
      }

      return { code: `@layer ${matched.layerName} {\n${code}\n}`, map: null };
    },
  };
}
