# Changelog

## 0.3.0 (Unreleased)

- 默认按 scope → local/npm/git → 名称和 metadata 展示，不再重复显示每个包的来源标题。
- 扩展包的多个入口合并为一行，隐藏入口后缀；独立脚本隐藏源码扩展名。
- 本地 Pi 包从 manifest 读取真实包名，解决 extensions/src 等含糊名称。
- 保留旧入口 metadata，新包名描述优先，多个旧描述去重合并，不删除旧配置。
- 增加入口合并与名称识别测试；共 27 项回归测试通过。

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
