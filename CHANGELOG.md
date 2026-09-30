# Changelog

## 0.1.0

- 将旧 welcome-list 插件迁移为独立的 pi-package-list 官方格式 Pi 包。
- 将列表和 metadata 逻辑与内部宿主兼容层分离。
- 适配 Pi 0.99.1 的闭包式动态文字构建，保留旧 getter 兼容。
- 保留逐项换行、对齐描述、来源展开和 Themes 隐藏行为。
- 保留 welcome-metadata.json 用户配置兼容。
- 增加 Node.js 回归测试、CI、MIT 许可证和版本发布说明。
