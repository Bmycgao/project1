# 微信小程序登录联调

阅读接口实现请先看 [小程序认证代码阅读说明](./MINIAPP_AUTH_READING.md)：三个认证接口已展开为顺序执行的 async/await 和 try/catch，并附有逐步中文注释。

此模块位于现有 Nitro 服务中，供 `D:\pro\qy\qy` 的 uni-app 配套使用。它调用真实微信登录接口，没有服务端体验账号，也不复用 PC 管理员的 JWT 或 RBAC 账号。

## 1. 在本机填写密钥

在当前 `apps/backend-mock` 目录找到 `.env.local`。本次已创建空密钥模板；已有文件不会被覆盖。填写：

```dotenv
WECHAT_APP_ID=wx3458e655d7c30765
WECHAT_APP_SECRET=在本机填写配套的AppSecret
```

AppID 应与小程序 `manifest.json` 中的 `mp-weixin.appid` 相同。AppSecret 从对应小程序的微信公众平台开发设置中取得，不发到聊天、不放到前端、不提交 Git。`.env.local` 已被仓库的 `.gitignore` 忽略；可复制 `.env.local.example` 恢复模板。

修改后重启后端。Nitro 配置通过 Node.js `loadEnvFile` 读取该文件，既支持 Vben 自动启动后端，也支持下面的独立启动；已在进程中设置的同名环境变量优先。Node.js 使用项目要求的 20.19 或更新版本。部署时通过服务环境变量注入配置，不依赖复制密钥到构建产物。

## 2. 启动现有后端

在 Vben 仓库根目录运行：

```sh
pnpm --filter @vben/backend-mock start:miniapp
```

默认监听 `http://127.0.0.1:5320`，接口前缀 `/api`。如果 PC 管理后台已经启动同一 Nitro，先重启 PC 开发服务以加载新增接口，然后直接复用；不要再启动第二个占用 5320 的服务。

独立脚本通过 Nitro 官方 API 启动，后端仍是同一套代码。`MINIAPP_DEV_HOST`/`MINIAPP_DEV_PORT` 仅用于此脚本；Vben 自动启动仍沿用原来的本机端口设置。

## 3. 运行小程序

当前小程序已设为 `config/auth.js` 的 `mode: 'api'`，开发工具地址为 `http://127.0.0.1:5320/api`。在 HBuilderX 中「运行到微信开发者工具」，勾选协议后点击「微信快捷登录」。浏览器无法运行这条真实微信登录链路；如只看 H5 页面，可自行显式改回 `mock` 体验，不能用体验 code 请求真实后端。

流程为：uni.login → POST code → Nitro 请求微信 code2Session → 根据 AppID + openid 查找或创建小程序账号 → 返回独立业务 token → 前端在 Authorization Header 中携带 token。

微信 code 有效期短且只能使用一次；失败后重新点击登录获取新 code，不要复制旧 code 反复提交。不会从微信自动取得昵称或头像，本版展示“微信用户”。`openid`、`session_key` 和 AppSecret 不返回前端。

真机联调时，手机的 127.0.0.1 指手机自身。按需在 `.env.local` 将 `MINIAPP_DEV_HOST` 改成电脑可用的局域网 IP，并把小程序 `baseURL` 改为该 IP（例如 `http://192.168.1.10:5320/api`），确保网络及防火墙允许手机访问；不要直接将整个演示后台暴露到公网。开发工具的本地调试配置不替代正式环境的 HTTPS 和微信 request 合法域名配置。

## 接口契约

| 方法与路径 | 输入 | data |
| --- | --- | --- |
| POST `/api/miniapp/auth/wechat` | JSON `{ "code": "uni.login返回的code" }` | `{ "accessToken": "miniapp_...", "expiresIn": 7200, "user": { "id": "mp_...", "nickname": "微信用户", "roleName": "普通用户" } }` |
| GET `/api/miniapp/user/info` | Header `Authorization: Bearer miniapp_...` | `{ "id", "nickname", "roleName" }` |
| POST `/api/miniapp/auth/logout` | 同上 | `null`，服务端删除该会话 |

响应沿用 `{ code: 0, data, error: null, message: 'ok' }`。失败时 `code: -1`，HTTP 400 表示参数或 code 无效，401 表示未登录或凭证过期/撤销，429 表示频率限制，502 表示微信服务暂时异常，503 表示配置或存储不可用。响应包含 `Cache-Control: no-store`；上游错误不会原样透传。

凭证为密码学随机的 256 位不透明 token，有效期 2 小时；磁盘只保存 token 的 SHA-256 哈希，退出只撤销当前 token，其他设备的会话保留。小程序 token 不能通过 PC 的 JWT 校验，PC token 也不能调用小程序账户接口。

## 本地保存与边界

账号与有效会话保存至 `apps/backend-mock/data/miniapp-auth.json`，重启后保持账号 ID 和登录状态；存档已被忽略提交。可通过绝对路径环境变量 `MINIAPP_AUTH_DATA_DIR` 修改保存目录。仅后端存储 AppID/openid 的关联，不保存微信 session_key。损坏存档不会自动重置，写入失败不会返回成功登录。

这仍是单实例开发后端，文件存储不支持多个进程共同写入；上线应迁移到数据库、共享会话存储，并完善业务权限和部署安全。当前微信身份账号没有自动绑定原“流程／电子协议”中的人员或协议，没有授予业务数据权限；业务关联需要明确的绑定规则。

## 验证

在 Vben 仓库根目录运行：

```sh
node node_modules/vitest/vitest.mjs run apps/backend-mock/utils/miniapp-auth.test.ts
```

测试替换的仅为微信网络边界，实际执行三个路由、Header 校验、文件持久化与退出撤销；不使用真实 AppSecret、不调用真实微信服务、不改本地业务存档。另需在微信开发者工具中使用你本机的真实密钥完成最终联调。
