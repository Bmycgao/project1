import { ensureHiprintBarcodeDeps } from './load-hiprint-deps';
/**
 * 初始化 vue-plugin-hiprint（挂载 jQuery、关闭自动连打印客户端）
 */
import { createAgreePrintProvider } from './provider';

let ready = false;
let providerReady = false;

export interface EnsureHiprintOptions {
  /** 是否注册设计器组件库（预览可不传） */
  withProvider?: boolean;
}

/** 确保 hiprint 可在当前页使用；返回 hiprint 命名空间 */
export async function ensureHiprint(
  options: EnsureHiprintOptions = {},
): Promise<{
  $: any;
  hiprint: any;
  PrintTemplate: any;
}> {
  if (typeof window === 'undefined') {
    throw new TypeError('打印仅能在浏览器中使用');
  }

  const jqueryMod = await import('jquery');
  const $ = (jqueryMod as any).default || jqueryMod;
  (window as any).$ = $;
  (window as any).jQuery = $;

  (window as any).autoConnect = false;

  const hiprintMod: any = await import('vue-plugin-hiprint');
  const hiprint = hiprintMod.hiprint || hiprintMod.default?.hiprint;
  const disAutoConnect =
    hiprintMod.disAutoConnect || hiprintMod.default?.disAutoConnect;

  if (!hiprint) {
    throw new Error('vue-plugin-hiprint 加载失败');
  }

  const needProvider = !!options.withProvider;

  /** 预览/设计均需要码图库 */
  await ensureHiprintBarcodeDeps();

  const provider = createAgreePrintProvider(hiprint);

  if (!ready) {
    try {
      disAutoConnect?.();
    } catch {
      // 无客户端场景可忽略
    }
    hiprint.init?.({
      host: '',
      token: '',
      ...(needProvider ? { providers: [provider] } : {}),
    });
    ready = true;
    providerReady = needProvider;
  } else if (needProvider && !providerReady) {
    /** 已 init 过但未注册组件库：再带 providers 初始化一次，不要手动把错误对象传给 addElementTypes */
    hiprint.init?.({
      host: '',
      token: '',
      providers: [provider],
    });
    providerReady = true;
  }

  return {
    hiprint,
    PrintTemplate: hiprint.PrintTemplate,
    $,
  };
}
