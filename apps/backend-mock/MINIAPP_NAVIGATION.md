# 底部导航与目标页面

> 已增加居民、操作员、小程序管理员三种导航角色。验收和阅读说明见小程序项目 `D:/pro/qy/qy/docs/三角色导航验收.md`。读取导航现在必须携带小程序 token；本文原有页面绑定与新增删除规则继续适用。

沿用现有 Vben Admin 和 Nitro。小程序有三个独立业务页面和一个测试页面；后台支持新增、删除、编辑、排序及显示控制，入口编号与目标页面分离。默认仍显示原来的三个入口。

## 怎么操作

1. 启动 Vben 前端及 Nitro：Vben 根目录运行 `pnpm dev:ele`；如果没有自动启动后端，再运行 `pnpm --filter @vben/backend-mock start:miniapp`。5320 端口只运行一份后端。
2. 管理员登录，进入 **系统管理 → 小程序导航**（`/system/miniapp-navigation`）。
3. 分别配置导航名称、目标页面、图标、显示状态与顺序。点击右侧预览中的导航，内容标题会跟随目标改变。已被其他入口占用的目标不可选，下拉列表会标注占用者，不会自动交换。
4. 点击“新增入口”将第一个未占用目标加入草稿，可继续修改名称和图标。没有空闲目标时按钮禁用并显示原因。点击某项的“删除”并确认后，该目标可重新使用；删除只改变草稿，不删除页面或业务数据。
5. 点击 **保存并发布 → 确认发布**。未发布的草稿不影响小程序。
6. 在 HBuilderX 重新运行到微信开发者工具。新增页面后不能只沿用旧编译产物。登录后点击 **更新导航**；页面重新显示时也会刷新。

现在可直接点击“新增入口”，将空闲的“测试页面”作为第四个入口加入草稿，无需先删除原入口。测试页面显示真实路径和点击计数，方便确认页面切换；计数在离开后重新进入时归零。要调整入口位置使用“上移 / 下移”；如果希望更换目标，需要先释放所选目标，系统不会修改另一项来交换绑定。账户入口始终保留，其目标不可更换。

## 三个字段分别做什么

```js
{
  id: 'nav-9fd2c174-ae68-4eda-b9b8-99a2e47712d8', // 新增时自动生成
  text: '个人中心',  // 底部显示什么文字
  target: 'account', // 点击后打开哪个目标，与文字和编号无关
  icon: 'user',
  enabled: true
}
```

目标白名单：

| target | 页面名称 | 小程序路径 |
| --- | --- | --- |
| home | 首页 | /pages/index/index |
| services | 服务中心 | /pages/services/index |
| account | 我的账户 | /pages/account/index |
| test | 测试页面 | /pages/test/index |

后台只能选择已经开发并注册的页面。新增业务页面时，先创建 `.vue`、在 `pages.json` 注册，再更新两端目标白名单。发布配置不会生成新页面，也不赋予用户业务权限。

## 点击后如何工作

1. `components/bottom-navigation.vue` 展示配置，点击后发出入口 `id`。
2. `composables/use-navigation-page.js` 用 `id` 查找对应入口，再取它的 `target`。
3. `utils/navigation.js` 将目标映射为本地路径，调用 `uni.redirectTo` 替换当前一级页面。
4. 新页面加载并检查登录。导航按该页面的目标查找入口编号，决定哪项高亮。

一级导航仍由自定义组件绘制，没有配置原生 `pages.json.tabBar`，因此这里不使用 `uni.switchTab`。四个目标都是已注册的普通独立页面；反复切换会替换当前页，不会不断增加返回层级。页面本地状态会在切换后重建，当前未实现原生标签页式的滚动位置和表单缓存。以后增加需要保留的筛选条件，可将其放入独立 store。

协议说明等详情继续使用 `uni.navigateTo`，返回后恢复来源页面。登录成功用 `reLaunch` 进入首页；如果首页目标被隐藏，读到配置后转到第一个可见目标。账户页的原生顶部标题是“我的账户”，不会跟着任意导航名称改变。

首页“查看我的账户”直接打开 `account` 目标。即使旧版本中已调整过绑定，或入口名称、顺序发生变化，它也能找到账户页面。

## 校验与升级

- 入口数量可变化，至少显示两项；每个已支持目标最多绑定一次，所以当前最多四个入口。账户目标必须可见，账户入口不能删除、隐藏或更换目标；限制依据是 `target`，不依赖 `id: 'mine'`。
- 新入口编号由 `crypto.randomUUID()` 生成；后端和小程序校验编号格式及唯一性，但不会用编号拼接路由。旧的 home/services/mine 编号继续有效。只有这些旧编号在缺少 target 时能自动补齐目标，新编号必须显式携带目标。
- 隐藏入口仍保留绑定，不能通过隐藏绕过重复目标限制；删除入口后才释放目标。后端也会拒绝重复目标、重复编号、缺少账户或少于两个可见入口，防止绕过界面校验。
- 名称 1～6 字，应用名称 1～16 字；图标和颜色仍使用原有校验。
- 旧接口数据、磁盘存档和本机缓存如果缺少 `target`，自动按 `home → home`、`services → services`、`mine → account` 补齐，不改变原有名称、顺序、版本或时间。读取不会偷偷改写存档，下次发布再保存新结构。
- 当前页面目标的入口被删除或隐藏时，刷新后打开第一个可见目标。入口重新创建得到新编号后，高亮仍按实际目标计算。
- 网络失败保留上次有效配置，页面显示重试按钮。离开页面后迟到的导航响应不再触发跳转。
- 配置缓存按后端地址和 mock/api 模式隔离；接口失败不会自动降级成模拟登录。
- 文件存储仍校验 revision，冲突返回 409；当前是开发用单实例存储。

## 接口与权限

| 用途 | 方法和路径（包含 /api） | 身份 |
| --- | --- | --- |
| 小程序读取 | GET /api/miniapp/navigation | 当前用户导航，携带小程序业务 token；后端按当前角色过滤 |
| 后台读取 | GET /api/system/miniapp-navigation | PC JWT + System:MiniappNavigation:List |
| 后台发布 | PUT /api/system/miniapp-navigation | PC JWT + System:MiniappNavigation:Edit |

发布接口接收整份配置及当前 revision，返回新版本。400 表示配置不合法，401/403 表示身份或权限问题，409 表示版本冲突，503 表示存储故障。小程序 token 不能调用管理接口。存档仍为后端 `data/miniapp-navigation.json`，支持原 `MINIAPP_AUTH_DATA_DIR` 设置。

## 找问题时看哪个文件

| 小程序文件 | 职责 |
| --- | --- |
| pages/index/index.vue | 独立首页 |
| pages/services/index.vue | 独立服务中心 |
| pages/account/index.vue | 独立账户页、资料刷新、退出 |
| pages/test/index.vue | 独立测试页、路径提示与点击计数 |
| pages.json | 注册页面与原生窗口标题 |
| components/navigation-layout.vue | 一级页面共用布局、刷新按钮和底栏 |
| components/bottom-navigation.vue | 底栏图标、文字、选中状态和点击 |
| composables/use-navigation-page.js | 登录检查、配置刷新、点击目标、隐藏后回退 |
| utils/navigation.js | 目标路径映射后执行页面跳转 |
| config/navigation.js | 默认配置、白名单、旧配置兼容与校验 |
| stores/navigation.js | 配置缓存 |

Vben 文件位于 `D:\pro\vue-vben-admin-main`：

- `apps/web-ele/src/views/system/miniapp-navigation/index.vue`：编辑和预览。
- `apps/shared/miniapp-navigation.ts`：类型、目标选项、新增删除规则、占用校验与服务端校验。
- `apps/backend-mock/utils/miniapp-navigation-store.ts`：存档与版本冲突。
- `apps/backend-mock/api/system/miniapp-navigation/`：管理接口。
- `apps/backend-mock/api/miniapp/navigation.get.ts`：小程序读取接口。

## 验收步骤

1. 先确认正常登录、三个底部入口分别打开对应页面。在控制台执行 `getCurrentPages().map(page => page.route)`，应能看到真实路径变化。
2. 展开“首页”的目标下拉框，确认“服务中心”和“我的账户”标注已占用且不能选，不会修改其他入口。账户入口的目标、开关和删除操作均不可用。
3. 保留原三个入口，点击“新增入口”，确认新增“测试页面”，预览有四个等宽入口，图标与文字上下居中。可改名、换图标、调整顺序，再保存并发布。重新编译小程序并更新导航，点击新入口应打开 `/pages/test/index`，点击按钮应增加计数。切回其他页再进入，计数归零。
4. 只改名称不改目标，确认内容保持不变。改顺序后确认高亮依然跟随正确目标。
5. 删除测试入口时先取消，确认草稿不变；再次确认删除并发布。小程序停留在测试页时更新导航，应回到第一个可见目标；后台可再次新增测试入口。再测试删除“服务”后只剩两项的配置，确认不能继续删除或隐藏可见入口，账户始终可达。
6. 打开用户协议后返回，应回到来源页。连续切换底部入口，页面栈不应逐次增长。
7. 后端断开时更新导航，应保留上次配置并显示失败提示；恢复后可重试。

自动化命令：小程序目录 `npm test`；Vben 根目录：

```sh
node node_modules/vitest/vitest.mjs run apps/backend-mock/utils/miniapp-navigation.test.ts apps/backend-mock/utils/miniapp-auth.test.ts
```

自动化用隔离存档和微信接口替身，不能代替微信开发者工具内的真实微信登录与交互验收。流程实例、电子协议列表、人员绑定仍待业务接入。
