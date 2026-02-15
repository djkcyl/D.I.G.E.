# D.I.G.E.

D.I.G.E.（Dijiang Integrated Generator Efficiency）是一个面向《明日方舟：终末地》热能池系统的发电方案计算器，用于在目标功率、最小蓄电量与功率浪费约束下，自动求解可行且高效的发电配置。

- 在线地址：https://dige.aunly.cn
- 项目仓库：https://github.com/djkcyl/D.I.G.E.

## 核心功能

- 自动求解：根据参数自动计算最多 5 个可行方案。
- 多维排序：按分支数、功率方差、功率浪费、是否仅主燃料排序。
- 周期仿真：逐秒模拟供电与电池变化，校验最小蓄电量约束。
- 方案可视化：
  - 周期图表（发电功率 / 电池百分比 / 分支燃烧状态）
  - 分流流程图（2 分 / 3 分链路与存储箱回收提示）
- 燃料消耗统计：展示基础发电与震荡发电的分项耗材（分钟/小时/天）。
- 分享能力：参数可编码为短 token 并通过 URL 共享。
- 多输入来源：支持仓库与封装机输入速率模型。
- 多语言：`zh` / `en` / `ja` / `ko` / `ru` / `fr` / `de`。
- PWA：支持安装与自动更新（`vite-plugin-pwa`）。

## 技术栈

- React 19
- Vite 7
- Tailwind CSS v4
- Chart.js + react-chartjs-2
- pnpm

## 快速开始

```bash
pnpm install
pnpm dev
```

默认开发地址：`http://localhost:5173`

## 常用命令

```bash
# 开发
pnpm dev

# 构建
pnpm build

# 预览构建产物
pnpm preview

# 检查 i18n 同步状态
pnpm run i18n

# 批量新增/更新翻译 key（必须一次提供 7 语言）
pnpm run i18n translate add <key> --zh "..." --en "..." --ja "..." --ko "..." --ru "..." --fr "..." --de "..."

# 删除翻译 key
pnpm run i18n translate delete <key1> [<key2> ...]

# 清理未使用翻译 key
pnpm run i18n prune --write
```

## 参数与计算说明

主要输入参数：

- `targetPower`：目标发电功率（w）
- `minBatteryPercent`：最低允许蓄电量（%）
- `maxWaste`：允许功率浪费上限（w）
- `primaryFuelId`：主燃料
- `secondaryFuelId`：副燃料（可选）
- `inputSourceId`：输入来源（`warehouse` / `packer`）

系统常量（当前实现）：

- 基础发电：`200w`
- 电池容量：`100000J`
- 仓库输入速率：`0.5 item/s`（间隔 2s）
- 封装机输入速率：`0.1 item/s`（间隔 10s）

求解流程概述：

1. 先计算基础发电（主燃料满带发电机）。
2. 对震荡分支枚举合法分母（由 2 和 3 的幂乘积构成）。
3. 对候选方案进行周期仿真，逐秒更新电池并检查约束。
4. 过滤不可行方案并输出前 5 个最优解。

> 注意：分流回收线路必须接入存储箱（存储模式或不通电），不能直接并回传送带。

## 项目结构

```text
src/
  components/        # UI 组件（侧边栏、图表、流程图、公告等）
  i18n/              # 多语言资源与 I18nProvider
  utils/             # 求解器、常量、分享参数编码
  App.jsx            # 应用主流程
  main.jsx           # 入口（Sentry / Clarity 初始化）
scripts/
  i18n.ts            # 统一 i18n CLI（translate + prune）
```

## 环境变量（可选）

运行时（前端）：

- `VITE_SENTRY_DSN`：启用 Sentry 前端错误上报与回放。
- `VITE_CLARITY_ID`：启用 Microsoft Clarity。

构建时（source map 上传）：

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

当上述构建变量齐全时，Vite 构建阶段会自动启用 Sentry 插件上传发布信息，并在上传后删除 dist 下的 .map 文件以减小部署体积。

## 贡献说明

- 组件使用 `.jsx` + Hooks。
- 样式使用 Tailwind 工具类。
- 涉及 i18n key 变更时，必须使用 `scripts/i18n.ts`，禁止手改 locale JSON。

## License

MIT
