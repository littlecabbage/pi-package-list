# pi-package-list

将 Pi 启动时逗号分隔的资源列表改为逐项换行，并在名称旁对齐显示自定义 metadata。

```text
[Extensions]
  - pi-package-list  启动资源列表与描述
  - ask-user         交互式需求确认
```

## 安装

需要 Node.js 24+ 和 Pi。当前兼容性验证基线：Pi **0.99.1**。

```sh
pi install git:github.com/littlecabbage/pi-package-list@v0.1.0
```

本地开发：

```sh
git clone https://github.com/littlecabbage/pi-package-list.git
cd pi-package-list
npm test
pi install "$PWD"
```

安装后执行 `/reload` 或重启 Pi。不要同时加载旧的 `welcome-list.ts` 或其他副本。

## Metadata

为兼容旧配置，继续读取 Pi agent 目录下的 `welcome-metadata.json`（默认 `~/.pi/agent/welcome-metadata.json`，实际路径由 Pi 的 `getAgentDir()` 决定）。此文件是用户数据，不属于插件源码，不会上传到仓库。

```json
{
  "extensions": {
    "pi-package-list:extensions": "启动资源列表与描述",
    "ask-user": "交互式需求确认"
  },
  "skills": {
    "pi-subagents": "子代理操作指南"
  }
}
```

键名必须与 Pi 列表中的显示名称完全一致；包安装和单文件安装的名称可能不同。插件自动登记新名称，描述默认为空，不覆盖已有描述。支持 `context`、`skills`、`prompts`、`extensions`、`themes`。无效 JSON 或读写失败时不覆盖原文件。

收起视图显示描述；展开视图保留来源分组并为资源行增加项目符号。沿用旧插件行为：隐藏 `[Themes]` 及其后空行，保留诊断警告。

## 兼容性边界

包结构遵循官方 [Pi Packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) 规范，入口默认导出 extension factory，宿主依赖使用 `peerDependencies: "*"`，无新增第三方依赖。

**修改原生启动列表不是官方稳定扩展 API。** `src/host-patch.ts` 隔离了对 `InteractiveMode.showLoadedResources`、`loadedResourcesContainer` 和 `ExpandableText` 的补丁，兼容旧 getter 形式及 Pi 0.99.1 的 `ThemedText.build` 闭包形式。Pi 内部结构再次改变时可能需要适配；缺少入口方法会提示警告，未知组件保持原样。非 TUI 模式不增加界面。

## 项目结构

```text
extensions/index.ts       官方包入口
src/list.ts               列表转换与 metadata 存储
src/host-patch.ts         宿主内部 API 兼容层
tests/                    Node.js 原生回归测试
.github/workflows/test.yml CI
CHANGELOG.md              版本变更记录
```

## 开发与版本管理

```sh
npm test
npm run check
```

测试覆盖换行、ANSI、metadata、旧/新宿主、展开/收起、主题重建、重复安装、诊断保留和异常清理。无须安装依赖即可运行测试；宿主导入由 Pi 加载器提供。

采用 SemVer：兼容修复增加 patch，新功能增加 minor，不兼容变更增加 major（0.x 阶段破坏性改动增加 minor）。发布前更新 `package.json` 和 `CHANGELOG.md`、通过检查，再提交并创建对应 `vX.Y.Z` tag 和 GitHub Release。当前仅通过 GitHub 分发，不发布 npm。

安装 tag 会固定版本；升级时安装新的 tag。使用不带 tag 的 git source 则可用 `pi update git:github.com/littlecabbage/pi-package-list` 跟随仓库更新。

## License

MIT
