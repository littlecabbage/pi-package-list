# Changelog

## 0.3.0 (Unreleased)

- 新增 `/pi-package-list update`，为已加载插件补充缺失 metadata；优先读取包 description，缺失时经确认使用当前模型总结本地片段。
- 新增 cancel、shutdown 取消、模型超时和失败跳过；保留手写/旧入口描述，重新读取后原子写入并刷新树。

- 启动列表中的描述最多显示 40 列（中文算 2 列），超出用 … 截断并合并为单行；welcome-metadata.json 保留完整描述。
- 默认以 ├──/└──/│ 树形线条展示 scope → local/npm/git → 名称和 metadata，不再重复显示每个包的来源标题。
- 扩展包的多个入口合并为一行，隐藏入口后缀；独立脚本隐藏源码扩展名。
- 本地 Pi 包从 manifest 读取真实包名，解决 extensions/src 等含糊名称。
- 保留旧入口 metadata，新包名描述优先，多个旧描述去重合并，不删除旧配置。
- 增加入口合并、名称识别和树形分支测试；并覆盖自动补充描述、写入保护、模型失败和取消流程。
- 验证 Pi 0.99.1 真实组件的树形渲染和 20/40/80 列宽适配。

## 0.2.0

- 默认视图按 Pi 原生 project/user/path 和 npm/git 来源分组，无需 Ctrl+O。
- 分组中保留简短资源名称与 metadata 描述，Ctrl+O 仍显示完整路径。
- 复用宿主来源数据，新增 4 项分组测试，并验证 Pi 0.99.1 真实渲染方法。
- 临时来源捕获方法在正常和异常路径均恢复，缺少元数据时安全回退。

## 0.1.0

- 将旧 welcome-list 插件迁移为独立的 pi-package-list 官方格式 Pi 包。
- 将列表和 metadata 逻辑与内部宿主兼容层分离。
- 适配 Pi 0.99.1 的闭包式动态文字构建，保留旧 getter 兼容。
- 保留逐项换行、对齐描述、来源展开和 Themes 隐藏行为。
- 保留 welcome-metadata.json 用户配置兼容。
- 增加 Node.js 回归测试、CI、MIT 许可证和版本发布说明。
