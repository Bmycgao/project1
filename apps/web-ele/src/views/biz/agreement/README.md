# 协议业务：从哪里开始看

先打开你要修改的页面，再沿着事件和数据查找相关文件，不必从框架底层开始。

| 想修改什么 | 从哪里看 |
| --- | --- |
| 列表查询、勾选、打印入口 | `list/index.vue` |
| 详情加载、编辑与保存 | `detail/index.vue` |
| 新增、审核、跳转等按钮操作 | `actions.ts` |
| 某种场景的列、按钮、模块配置 | `config/resolve-runtime.ts`，再看 `config/scenes.ts` |
| 字段能否看到、能否编辑 | `access/field-access.ts` |
| 在 Vue 组件里使用字段权限 | `access/use-field-access.ts` |
| 详情模块的可见性、顺序和布局 | `access/module-access.ts` |
| 模块内部的字段和默认值 | `config/module-inner-config.ts` |
| 房屋、补偿、奖励等具体表单 | `modules/` |
| FormCreate 的规则转换和绑定 | `fc/` |
| 打印设计、预览与计算 | [print/README.md](./print/README.md) |

## 目录职责

```text
agreement/
├─ list/         列表页面
├─ detail/       详情页面
├─ modules/      房屋、补偿、奖励等业务区域
├─ components/   协议页面共用的界面组件
├─ config/       场景配置、默认配置及配置整理
├─ access/       字段和模块权限；Vue 中的权限状态传递
├─ data/         演示数据和样例构造
├─ fc/           FormCreate 适配
├─ print/        打印功能
├─ actions.ts    按钮操作
├─ types.ts      协议数据类型
└─ clone.ts      共用的 JSON 深拷贝
```

`data/mock-data.ts` 当前既用于演示，也用于列表、详情接口失败时的回退，以及打印样例。它不是只供测试使用的文件；调整正式环境的回退策略时，需要一起检查这些入口。

## 第一条阅读路线：列表查询

1. 在 `list/index.vue` 看 `keyword`、`statusFilter`：查询条件存在哪里。
2. 找到 `loadList()`：怎样把条件传给 `getAgreementList()`。
3. 接口实现在 `src/api/biz/agreement.ts`。
4. 返回结果写入 `tableData`，再交给模板中的 `ElTable`。
5. 最后看 `loadRuntime()`：列和按钮如何随场景变化。

页面配置优先从后台加载，本地 `config/scenes.ts` 提供默认场景；具体整理过程集中在 `config/resolve-runtime.ts`。修改配置来源时先读这个入口，避免在不同页面各写一套判断。

## 后续开发约定

- 普通界面直接使用 Vue 和 Element Plus；复用项目已有的请求、权限和布局能力。
- 只被一个组件使用的小函数可以留在组件内；多个地方共用或有独立业务含义时再提取。
- 新文件放进对应职责目录，避免重新把配置、权限和打印逻辑平铺到根目录。
- `*.test.ts` 是回归测试，通常不进入正式页面运行代码。修改相关规则时运行测试，不要为了减少文件数量删除测试。
- `config/module-inner-config.ts` 仍集中保存多类模块的默认配置和兼容处理。后续修改某类模块时，可按业务模块逐步拆分，保持配置数据结构和旧配置兼容。
