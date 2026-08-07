/**
 * 深拷贝纯 JSON 数据（兼容 Vue 响应式 Proxy，避免 structuredClone 报错）
 * @param value 任意可序列化数据
 */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
