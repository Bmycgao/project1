/**
 * 加载 hiprint 二维码/条形码依赖（JsBarcode、bwip-js）
 * 优先 npm 打进页面，避免 unpkg 被拦后条码报「格式不支持」
 */

let depsReady = false;

/**
 * 把库挂到 window，供 hiprint 内部按全局名调用
 * @param name 全局名
 * @param value 库对象
 */
function setGlobal(name: string, value: unknown) {
  if (typeof window === 'undefined' || !value) return;
  (window as any)[name] = value;
}

/**
 * CDN 兜底注入
 * @param src 脚本地址
 */
function injectScript(src: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (document.querySelector(`script[data-hiprint-dep="${src}"]`)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.hiprintDep = src;
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), {
      once: true,
    });
    document.head.append(el);
  });
}

/**
 * 确保二维码/条形码渲染库已就绪
 */
export async function ensureHiprintBarcodeDeps() {
  if (typeof window === 'undefined' || depsReady) return;
  const w = window as any;

  if (!w.JsBarcode) {
    try {
      const mod: any = await import('jsbarcode');
      setGlobal('JsBarcode', mod.default || mod);
    } catch {
      await injectScript(
        'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
      ).catch(() =>
        injectScript(
          'https://unpkg.com/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
        ),
      );
    }
  }

  if (!w.bwipjs && !w.BWIPJS) {
    try {
      const mod: any = await import('bwip-js');
      const lib = mod.default || mod;
      setGlobal('bwipjs', lib);
      setGlobal('BWIPJS', lib);
    } catch {
      await injectScript(
        'https://cdn.jsdelivr.net/npm/bwip-js@4.5.1/dist/bwip-js.js',
      ).catch(() =>
        injectScript('https://unpkg.com/bwip-js@4.5.1/dist/bwip-js.js'),
      );
    }
  }

  depsReady = !!(w.JsBarcode || w.bwipjs || w.BWIPJS);
}
