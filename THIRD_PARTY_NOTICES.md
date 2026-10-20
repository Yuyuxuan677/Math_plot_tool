# 第三方依赖与许可证

本项目在本地运行，运行时不需要访问外部 CDN。以下是主要第三方依赖：

| 依赖 | 版本（锁定在 package-lock.json） | 许可证 | 用途 |
|---|---|---|---|
| React / React DOM | 19.3.1 | MIT | 界面 |
| Zustand | 5.0.15 | MIT | 状态管理 |
| mathjs | 15.2.0 | Apache-2.0 | 表达式解析、求值、求导、化简 |
| JSXGraph | 1.14.0 | MIT 或 LGPL-3.0-or-later | 2D 坐标系、曲线、几何元素、拖拽、切线、轨迹 |
| KaTeX | 0.19.0 | MIT | 公式排版（字体文件随构建打包） |
| Three.js | 0.186.1 | MIT | 3D 曲面与曲线 |
| Vite | 7.3.7 | MIT | 开发与构建 |
| TypeScript | 5.9.3 | Apache-2.0 | 类型检查 |
| Vitest | 4.1.12 | MIT | 单元测试 |
| playwright-core | 1.64.1 | Apache-2.0 | 端到端测试（使用本机 Chrome） |

JSXGraph 采用 MIT 或 LGPL 双许可证；本项目按 MIT 使用。各依赖的完整许可证文本随 npm 包分发，可在 `node_modules/<包名>/` 中找到。

> 说明：JSXGraph 内部包含 JessieCode 解析器（含 `eval` 用法）作为其库的一部分。本项目不启用用户自定义 JessieCode 脚本，只通过 JavaScript 函数和受控表达式使用 JSXGraph。所有依赖均安装到本地，运行时页面不会从 JSXGraph 官网等外部地址加载资源。
