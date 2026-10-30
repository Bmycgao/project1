# 小程序认证代码：按顺序阅读

三个接口已经改为 `defineEventHandler(async (event) => { try { ... } catch { ... } })`。业务步骤从上往下执行，成功返回对象，失败进入当前文件的 catch。三个接口不再通过 `miniappResponse(event, 回调)` 执行业务；导航接口仍使用原工具。

## 先读微信登录接口

文件：`api/miniapp/auth/wechat.post.ts`

```text
前端 uni.login 获取 code
  → POST /api/miniapp/auth/wechat，JSON 请求体 { code }
  → limitMiniappLogin(event)：检查请求频率
  → readBody(event)：读取请求体
  → validateWechatCode(body?.code)：检查参数格式
  → exchangeWechatCode(code)：向微信换取 { appid, openid }
  → accountStore.login(wechatIdentity)：查找/创建用户，保存会话
  → return { code: 0, data: loginResult, error: null, message: 'ok' }
```

`event` 是当前请求的上下文。`await` 表示等异步操作完成再继续；`throw` 表示停止正常流程并进入 catch；`body?.code` 表示 body 不为空时才读取 code。`let body: { code?: unknown } | null` 是 TypeScript 类型说明：请求体可能为空，code 可能缺失，收到后需要校验。

`validateWechatCode` 只能确认格式，不证明它是微信签发的真实 code；真正的身份确认由微信接口完成。前端提交的 openid、角色等字段不会被用来决定身份或权限。

`wechatIdentity` 是后端使用的身份数据；`loginResult` 才是返回前端的数据，包含 accessToken、expiresIn 和用户展示信息。

## 再读获取账户和退出

`api/miniapp/user/info.get.ts`：取 Header 的 token → 读小程序配置 → 校验会话并取用户 → 返回用户。

`api/miniapp/auth/logout.post.ts`：取 Header 的 token → 读小程序配置 → 删除当前会话 → 返回 data: null。

这两个接口仍会使用 `getWechatConfig()` 检查后端配置，行为与重构前一致；它们不会在每次请求时再调用微信。

登录接口没有 token，因为它就是用来获取 token 的。后续两个接口传 `Authorization: Bearer 业务token`，不传 AppSecret 或 openid 代替凭证。

## 需要深入时，只找这三个模块

| 模块 | 负责什么 | 优先看哪个函数 |
| --- | --- | --- |
| `utils/miniapp-auth.ts` | 请求限流、Header 取 token、找到账号存档 | `limitMiniappLogin`、`miniappBearer`、`miniappStore` |
| `utils/miniapp-wechat.ts` | 参数检查、读取服务端配置、请求微信 | `validateWechatCode`、`getWechatConfig`、`exchangeWechatCode` |
| `utils/miniapp-store.ts` | 保存用户和登录会话 | `login`、`profile`、`logout` |

`miniappStore()` 取得的是服务器端账号存储对象，接口里用 `accountStore` 变量接住，再调用它的方法。它不是前端 Pinia。当前使用文件保存数据，未来接数据库主要修改这一层。

## catch 为什么要这样写

已知业务错误使用 `MiniappAuthError`，带有 HTTP 状态、提示信息和错误标识。例如 code 无效返回 400，凭证失效返回 401，请求频繁返回 429。

未知异常统一转成 503 和通用提示，避免把文件路径、密钥或内部异常直接返回前端。成功/失败响应都设置禁止缓存的 Header。

HTTP 状态与响应体里的 code 要分别看：成功通常是 HTTP 200 + code: 0；失败使用相应 HTTP 状态 + code: -1。

这三处保留了少量相同的成功/错误返回代码，让你读任意一个接口都能直接看到结果。熟悉后如有需要再统一抽取，不增加额外的业务回调层。

## 定位问题的顺序

1. 微信开发者工具 Network：确认请求地址、请求体 code、HTTP 状态和响应 message。不要把 code、token 或密钥贴到聊天或日志。
2. 登录返回 400：查看请求体与微信 code 是否已过期/使用过，重新执行 uni.login。
3. 返回 502：查看 `exchangeWechatCode` 的微信请求与网络情况。
4. 返回 503：区分配置缺失、微信配置异常、账号存档读取/写入失败，先看响应 error/message，再找对应模块。
5. 账户/退出返回 401：确认 Header 携带当前业务 token，检查会话有效期与是否已退出。
6. 返回 429：停止重复请求，按 Retry-After 等待后重试。

接口地址、返回字段、随机 token、两小时有效期、服务端会话撤销和原有文件存储均未改变。测试使用临时数据和微信网络替身，不替代微信开发者工具的真实登录联调。
