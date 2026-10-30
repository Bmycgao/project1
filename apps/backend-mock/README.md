# @vben/backend-mock

当前协议用于演示流程、页面和打印能力，字段与状态不代表已确认的正式业务规则。流程办理仍直接接入协议，其他业务需要实现相应数据接入；范围基线、代码耦合及待实施清单见[范围与业务接入盘点](../../docs/platform-scope-and-coupling-audit.md)。

## Description

Vben Admin 数据 mock 服务，没有对接任何的数据库，所有数据都是模拟的，用于前端开发时提供数据支持。线上环境不再提供 mock 集成，可自行部署服务或者对接真实数据，由于 `mock.js` 等工具有一些限制，比如上传文件不行、无法模拟复杂的逻辑等，所以这里使用了真实的后端服务来实现。唯一麻烦的是本地需要同时启动后端服务和前端服务，但是这样可以更好的模拟真实环境。该服务不需要手动启动，已经集成在 vite 插件内，随应用一起启用。

## Running the app

```bash
# development
$ pnpm run start

# production mode
$ pnpm run build
```

## 协议数据保存

协议新增、整页保存、分模块保存、提交/审核/驳回、流程回写和删除会保存到 `apps/backend-mock/data/agreements.json`，重启服务后从该文件恢复。列表、详情和编号流水写入同一份存档，先写临时文件再替换正式文件；磁盘写入失败时接口返回错误，内存保留上一次成功保存的数据。

存档 v2 使用内部 ID 关联详情，展示编号与内部标识分离。默认编号为 `LL-年份-四位流水`，按服务端年份计数，流水持久化，自动避让已用编号。草稿允许改号，重复编号和其他协议的历史编号均不能使用；提交复核或发起流程后锁定。改号记录（内部 ID、原编号、新编号、时间）保存在 `numberChanges`；历史别名兼容旧链接，并保留删除记录的编号占用。旧 v1 存档保持原编号，首次写入 v2 前保存为 `agreements.v1.backup.json`，不批量重编号。

新客户端读取详情和分模块保存优先使用 `id`，整页保存以 `id` 定位、以 `basic.agreementNo` 提交展示编号；批量接口使用 `agreementIds`，流程发起使用 `agreementId`，实例 `bizId` 保存内部 ID、`businessNo` 保存展示编号。旧版 `agreementNo`/`agreementNos` 和旧流程实例仍可解析，流程实例在读取时兼容转换为内部 ID，后续实例写入时持久化转换结果。

存档位于 `.nitro`、`.output` 等构建目录之外，不随重新编译清理。首次运行且没有存档时加载内置演示协议；已有存档即使为空，也不会重新灌入演示记录。存档损坏时会明确报错并保留原文件，不自动重置。修改前已随重启丢失的内存数据无法从本次新增的存档中恢复。

`data` 目录已被 Git 忽略，备份项目代码时请另外备份此文件。部署时可通过 `VBEN_AGREEMENT_DATA_DIR` 指定持久化目录（建议绝对路径，容器中挂载到持久卷）。这仍是单服务实例使用的本地模拟后端；多个后端进程并发使用时应迁移到数据库，文件存档不提供跨进程事务或锁。

持久化回归测试（测试使用独立临时目录，不修改本地业务存档）：

```sh
node node_modules/vitest/vitest.mjs run apps/backend-mock/utils/agreement-store.test.ts apps/backend-mock/utils/mock-agreement-detail.test.ts apps/backend-mock/utils/workflow-agreement.test.ts
```

## 微信小程序登录

配套小程序的真实微信登录、环境变量配置与启动方法，见 [小程序登录联调](./MINIAPP_LOGIN.md)。

小程序底部导航配置见 [MINIAPP_NAVIGATION.md](./MINIAPP_NAVIGATION.md)。
