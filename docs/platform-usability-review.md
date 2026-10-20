# 流程、页面配置与打印：本轮交付检查

## 范围与结论

本轮检查用户截图、管理页面源码、配置接口和存储实现，并运行相关自动化测试。没有重新进行浏览器端到端操作，也没有让真实操作人员试用；以下区分已确认的代码行为、体验问题与待验收项。未修改产品代码、删除版本或清理测试数据。

交付主线是流程设计/运行、页面配置、打印模板。现有协议和字段继续作为测试数据，不把业务解耦、签约制度、演示状态扩展列入本轮前置工作。

主要结论：需要主动优化配置体验和管理安全性。单元测试通过不能替代引用保护、真实持久化失败和操作人员任务路径的验收。

## 先修影响配置可靠性的问题

### R01：配置写盘失败可能仍返回成功

- 已确认：`writePersistJson` 捕获写盘异常后只输出日志，不向调用者返回失败。页面、表单和打印模板的存储调用该函数；部分更新已在写盘之前修改内存数据。
- 影响：写盘失败时可能显示保存成功，重启后恢复旧配置。不是断言用户现在已经发生磁盘故障。
- 证据：[mock-persist.ts](../apps/backend-mock/utils/mock-persist.ts:40)、[页面配置更新](../apps/backend-mock/utils/mock-page-schema.ts:1921)、[打印模板存储](../apps/backend-mock/utils/mock-print-template.ts)。流程版本存储另有临时文件原子替换，不能把该问题笼统套到所有存储。
- 完成标准：写入失败接口失败，界面保留未保存草稿；内存与磁盘不假报一致；成功写入后重启能恢复。使用隔离目录模拟失败，不碰开发配置。

### R02：页面配置删除没有引用检查

- 已确认：删除接口鉴权后直接调用 `removePageSchema`；存储删除记录及其历史，没有先检查菜单、其他场景的共用表头引用、流程草稿的办理页面引用。
- 影响：仍在使用的配置可能被删，入口、继承布局或后续发布可能失效。已发布流程有冻结表单，不据此声称旧实例必然全部损坏。
- 证据：[删除接口](../apps/backend-mock/api/system/page-schema/[id].delete.ts)、[删除存储](../apps/backend-mock/utils/mock-page-schema.ts:1954)、[发布冻结](../apps/backend-mock/utils/workflow-forms.ts)。
- 完成标准：列明使用位置；对仍需实时引用的对象阻止删除并提供跳转；已冻结历史引用单独说明。停用操作也应预告影响。

### R03：自建打印模板删除/改编码没有引用保护

- 已确认：删除仅保护内置 ID，没有检查页面动作中的模板编码绑定；更新允许改编码。列表删除提示没有列出影响范围。
- 影响：使用旧编码的打印入口可能找不到模板。自建模板并不等于未被使用。
- 证据：[模板删除/更新](../apps/backend-mock/utils/mock-print-template.ts)、[打印列表](../apps/web-ele/src/views/system/print-template/list.vue)、[页面按钮绑定](../apps/web-ele/src/views/system/page-schema/modules/form.vue)。
- 完成标准：引用统计、删除/改编码的受控策略和清晰提示；旧入口、默认模板及实际输出回归。

## 再优化操作路径

### U01：流程主列表被全部历史版本占满

- 已确认：列表按版本平铺、每十条分页；没有默认隐藏历史或按流程家族展开。截图与此一致。已有草稿时，其他历史行仍显示“新建版本”，点击后服务端拒绝。
- 已有正确保护：仅草稿可删除；发布新版本会停用同家族旧发布版本；同家族只能有一个待发布草稿。
- 证据：[流程列表](../apps/web-ele/src/views/system/workflow/list.vue)、[版本存储](../apps/backend-mock/utils/workflow-store.ts:151)。
- 建议：主列表按流程展示当前发布版及待发布草稿，历史版本进入抽屉；已有草稿时提供“继续编辑草稿”；“复制”注明创建独立流程。
- 删除结论：本轮不开放已发布历史版本的直接删除。先解决展示拥挤。有实例或引用的版本需要留存；将来清理未使用测试版本时另做引用检查和明确的清理入口。

### U02：页面配置的列表用途和流程办理用途混在同一套操作中

- 已确认：业务场景保存要求场景码、共用表头、至少一个列表动作等；流程办理实际读取详情布局及模板，不使用列表按钮和查询条件。仅配置办理详情时，管理员仍要理解列表配置。
- 证据：[场景保存校验](../apps/web-ele/src/views/system/page-schema/modules/form.vue:848)、[办理详情配置说明](../apps/web-ele/src/views/system/workflow/inspector.vue)、[冻结详情](../apps/backend-mock/utils/workflow-forms.ts)。
- 建议：增加面向任务的“配置流程办理页面”路径/预设，聚焦模块、布局、模板、预览及绑定位置；保留原列表场景功能。这里是操作路径梳理，不是先建设通用低代码平台。
- 完成标准：管理员能从创建页面、预览，到绑定流程完成一条连续路径，无需配置与办理页无关的列表动作。

### U03：“未使用”提示不等于真实的未被引用

- 已确认：页面配置列表只统计菜单的 `meta.schemaId`；没有计入流程默认办理页面、节点覆盖页面或其他配置的共用表头引用。菜单获取失败时还会按空列表统计。
- 影响：被流程使用的页面可能显示“未使用”，容易被误删；不能拿此字段作为清理依据。
- 证据：[页面列表](../apps/web-ele/src/views/system/page-schema/list.vue:35)。
- 建议：当前列改成准确的“菜单引用”，没有菜单时写“未挂菜单”；新增完整使用位置。加载失败显示“引用信息加载失败”，不当作零引用。

### U04：按钮管理存在用途和生效范围的理解成本

- 已确认：页面配置的按钮是列表动作；按钮管理提供流程办理动作。流程导入按钮时生成配置副本，后续库修改不会自动更新该副本。这个隔离有助于保护已发布版本，但需要清楚说明。
- 体验缺口：按钮列表动作显示 `submit/pass/reject` 等英文；缺少使用位置；流程设计器按钮资源请求失败会变成空列表，不能区分“没有资源”和“加载失败”。内置按钮删除错误提示称“可停用”，实际又禁止停用，文案矛盾。
- 证据：[按钮管理](../apps/web-ele/src/views/system/workflow-button/list.vue)、[导入配置副本](../apps/web-ele/src/views/system/workflow/inspector.vue:89)、[内置保护](../apps/backend-mock/utils/workflow-button-store.ts:91)。
- 建议：明确区分“列表操作按钮”和“流程办理按钮”；动作类型中文化；显示来源和使用位置；说明修改对按钮库、当前草稿、已发布版本各有什么影响；加载失败提供重试。需要刷新草稿副本时提供显式操作，避免自动覆盖已有定制。

### U05：配置查看与修改删除的权限粒度不足

- 已确认：页面配置、打印模板的新增/修改/删除使用相应 `List` 管理权限；目前不能仅凭这组管理权限区分配置查看人员与配置维护人员。业务人员的数据读取权限另有检查，不等于所有登录用户都能改配置。
- 证据：[权限常量](../apps/backend-mock/utils/system-api-auth.ts)、[页面修改接口](../apps/backend-mock/api/system/page-schema/[id].put.ts)、[打印删除接口](../apps/backend-mock/api/system/print-template/[id].delete.ts)。
- 建议：若交付包含只读配置账号，补齐查看/编辑/删除的权限区分和前后端一致性；普通办理人员只接触待办和业务动作，无需学习配置台。

### U06：两个打印设计入口的保存范围不同

- 已确认：独立设计路由使用本地模板保存；系统模板管理入口保存到服务端模板库。两者都在代码中，不能直接删掉旧入口。
- 证据：[独立入口](../apps/web-ele/src/views/biz/agreement/print/designer/index.vue)、[本地存储](../apps/web-ele/src/views/biz/agreement/print/template/template-store.ts)、[系统模板编辑](../apps/web-ele/src/views/system/print-template/edit.vue)。
- 建议：检查实际菜单暴露情况。对维护人员提供明确的主入口；若保留本地入口，标注“本地试排”，说明保存范围。验证业务打印入口最终引用服务端的哪份模板。

## 本轮验证及未验证项

12 个测试文件、161 项测试通过，覆盖流程版本存储、按钮资源、发布检查、菜单绑定、引擎、画布、节点配置、打印编辑及预览/分页渲染。未修改测试数据。

运行入口：根目录 `node node_modules/vitest/vitest.mjs run`，本轮文件为：

```text
apps/backend-mock/utils/workflow-store.test.ts
apps/backend-mock/utils/workflow-button-store.test.ts
apps/backend-mock/utils/workflow-publication.test.ts
apps/backend-mock/utils/workflow-menu.test.ts
apps/backend-mock/utils/workflow-engine.test.ts
apps/web-ele/src/views/system/workflow/inspector.test.ts
apps/web-ele/src/views/system/workflow/configuration.test.ts
apps/web-ele/src/views/system/workflow/flow-canvas.test.ts
apps/web-ele/src/views/system/print-template/edit.test.ts
apps/web-ele/src/views/biz/agreement/print/designer/agreement-print-designer.test.ts
apps/web-ele/src/views/biz/agreement/print/runtime/document-renderer.test.ts
apps/web-ele/src/views/biz/agreement/print/print-preview-dialog.test.ts
```

上述通过不代表 R01—R03 已修复或已被这些测试覆盖。后续修改应增加针对性的失败场景与引用保护验证。

实际验收仍需：管理员创建页面→配节点和按钮→发布→两个权限账号办理/驳回重提→检查旧版本实例；模板保存重开→换空数据/多页数据→实际打印/PDF；配置与实例重启恢复。普通人员能否独立完成任务，需要实际试用，不能由源码检查代替。

## 固定处理顺序

1. 修保存失败反馈及页面/打印模板引用保护（R01—R03）。
2. 整理流程主列表与历史入口、已有草稿的继续编辑（U01）。
3. 梳理办理页面配置路径、完整使用位置和按钮的作用范围（U02—U04）；按交付角色补权限，明确打印主入口（U05—U06）。
4. 完成一轮管理员配置与普通人员办理、打印的实际验收；只修验收中发现的问题，不追加协议业务规则。

本清单替代继续围绕演示协议状态扩展的工作顺序，不要求先做通用业务接入重构。
