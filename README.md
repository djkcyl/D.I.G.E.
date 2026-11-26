# D.I.G.E.（社区维护版）

D.I.G.E.（Dijiang Integrated Generator Efficiency）是《明日方舟：终末地》热能池发电方案计算器：给定目标功率，自动算出「几台满速 + 几路震荡分流 + 取货口/分流器怎么配」的最优组合，并逐秒仿真校验电池不被抽干。

> **本仓库是 fork，不是原项目。**
> 上游：[djkcyl/D.I.G.E.](https://github.com/djkcyl/D.I.G.E.)（作者 [djkcyl](https://github.com/djkcyl)、核心算法 [Well2333](https://github.com/Well2333)）
> 本仓库：[VincentHDLee/D.I.G.E.](https://github.com/VincentHDLee/D.I.G.E./tree/main)

- 本仓库在线版：https://dige-2st.pages.dev （Cloudflare Pages，随 `main` 自动部署）
- 上游官方站：https://dige.aunly.cn （原版，版本停在游戏 1.5 口径）

## 为什么有这个 fork

上游 `main` 最后一次提交是 **2026-04-21**（`2b454a5`），此后游戏已经走完 1.5 → 1.7，燃料表、电网环境都变了，issue 区也积压未处理。本 fork 从 v1.11.0 起接手继续做：

- 让计算器跟上游戏版本（当前对齐 **1.7**，含高容武陵电池 6400W / 40s）；
- 把玩家反复提的痛点做进产品（宽窗求解、电网码分享、多存档、地区规则、准入口限速、主题）；
- 保持分享码向后兼容，上游时期生成的码在本仓库依然解得开。

原项目主创与开发同学已 AFK，这里先谢过：**没有上游那套求解器和蓝图 SVG，就没有这个工具**。

## 对比上游（`2b454a5` → 本仓库）

| 维度 | 上游 v1.10.5 时期 | 本仓库 v1.11.1+ |
| --- | --- | --- |
| 游戏版本 | 1.5 之前 | **1.7**（高容武陵电池 6400W / 40s 已接入） |
| 约束参数 | 玩家手调 `maxWaste` / `minBatteryPercent` / `maxBranches` | **内部宽窗自动搜索**（1000W 窗口、5% 蓄电底线、1~4 路），界面不再让人猜 |
| 求解轨道 | 单轨 | **双轨并行**：自动常驻补齐 + 纯震荡/手动常驻，合并后按 Pareto 分桶 |
| 结果呈现 | 方案列表 | **3×3 电网九宫格**（纵轴取货口 1~3、横轴十/百/千瓦），无解格画红斜线 |
| 常驻供电 | 只能整台满载 | **常驻分层**：核心 200W / 手动常驻行（可多种燃料）/ 自动补齐，全网燃料 BOM 统一统计 |
| 多燃料 | 主 + 副各自枚举 | **智能混编**：主/副/混合联合竞争，也有 `legacy` / `primaryOnly` / `secondaryOnly` 可选 |
| 准入口限速 | 手动选档 | **震荡分支自动枚举 k/5 限速**，能省掉多级分流器；可按地区禁用 |
| 建设地区 | 无 | **四号谷地 / 武陵 / 自由建造**，谷地下武陵电池不可限速并给出提示 |
| 分享 | URL `?p=` 短 token | **DIGE 电网码 B**（人读头 + Base52 载荷）+ URL + 裸 token 万能导入 |
| 存档 | 无 | **本地多槽位电网存档**，内置四号谷地 / 武陵预设，支持另存为与切换 |
| 界面 | 单主题 | **工业白 / 极夜暗双主题**，未手动覆盖时按本地时间自动切换 |
| 移动端 | 底栏切换 | 顶栏吸顶仪表盘 + 居中九宫格弹层 |
| 稳定性 | 长周期可能 OOM | 仿真周期硬上限 + 长分支剪枝 |
| 语言 | 7 种 | **8 种**（新增 `id` 印尼语） |
| 自定义常驻 | 无 | **自定义常驻热能池**：任意多行、多燃料、任意台数，自动补齐可关 |
| 自定义震荡 | 无 | **自定义震荡热能池**：指定电池 + 每分钟投料上限，自动拆成满速带与余量震荡，与系统震荡共享设备预算 |
| 部署 | 手工 | Docker 多阶段 / devcontainer / Capacitor Android / Cloudflare Pages 自动部署 |

差异的代码级细节（宽窗、双轨、分桶、分享码 bit 槽）见 [`docs/architecture.md`](docs/architecture.md) 与 [`docs/handover.md`](docs/handover.md)。

## 上游 issue 处理情况

本仓库用**功能覆盖**而不是逐条回复的方式处理上游 issue：

| 上游 issue | 诉求 | 本仓库现状 |
| --- | --- | --- |
| [#16](https://github.com/djkcyl/D.I.G.E./issues/16) 希望增加一个主燃料多选功能 | 想让常驻/震荡同时吃多种电池 | **已由「自定义常驻热能池」实现**：多行、每行独立选电池与台数，配合「自定义震荡热能池」可再指定一种电池做震荡 |
| [#13](https://github.com/djkcyl/D.I.G.E./issues/13) max Fuel/hr 与第三燃料 | 想限制每小时耗料、并加第三种燃料 | **已由「自定义常驻 + 自定义震荡热能池」实现**：主/副/自定义常驻/自定义震荡可同时存在，投料量按个/分钟直接设定 |
| [#14](https://github.com/djkcyl/D.I.G.E./issues/14) 常驻燃料上限 | 想限制常驻台数 | **不打算实现**：正常玩法下玩家不会铺超过 10 台热能池，用「自定义常驻热能池」手动排即可 |
| [#2](https://github.com/djkcyl/D.I.G.E./issues/2) 回灌分流 / 能量泄漏 | 用 loopback 实现任意 1/x 精度 | **暂不实现**：调研与评估记录在 `feature/input-rate-limiter` 分支的 `docs/upstream-issue-2-loopback.md` |
| [#9](https://github.com/djkcyl/D.I.G.E./issues/9) 赞助渠道 | 想赞助项目 | 不属于代码范畴，未处理 |

## 分支说明

| 分支 | 用途 |
| --- | --- |
| `main` | 开发主干，随 `main` 自动部署到 Cloudflare Pages |
| `feature/input-rate-limiter` | 资料分支：记录上游未实现议题（issue #2 回灌分流/能量泄漏）的调研与评估，见该分支的 `docs/upstream-issue-2-loopback.md` |
| `chore/dev-selftests-2026-08-17` | 归档分支：M1/M2/M3/OOM/limiter 时期的 12 个自测脚本备份 |

`fork/feature/input-rate-limiter`、`fork/feat/add-wuling-mid-battery` 是历史上已合并或已废弃的远端分支，可删。

## 视频教程（有版本差）

入门可先看上游作者录的 B 站教程：https://www.bilibili.com/video/BV1mjZwBaEXi

**注意：视频录制于 v1.10 时期，没有演示本仓库的新东西**——宽窗自动求解（不用再手调浪费/蓄电底线）、3×3 电网九宫格、电网码与多存档、双主题、地区规则、以及游戏 1.7 的高容武陵电池。按视频一步步操作时，遇到这些界面差异属正常现象，以本 README 和界面文案为准。

## 燃料数据（游戏 1.7）

| 燃料 | 功率 | 燃烧时长 | 备注 |
| --- | --- | --- | --- |
| 源矿 | 50W | 8s | 通用 |
| 低容 / 中容 / 高容谷地电池 | 220W / 420W / 1100W | 40s | 四号谷地 |
| 低容 / 中容 / **高容**武陵电池 | 1600W / 3200W / **6400W** | 40s | 武陵；谷地内不可用准入口限速 |
| 自定义燃料 | 自填 | 自填 | 主/副燃料均可覆盖 |

一条满速传送带 0.5 个/s、燃烧 40s 的电池对应 20 台热能池满载，所以高功率燃料的分流档位会很粗——这是燃料粒度决定的，不是算法缺陷。

## 快速开始

```bash
pnpm install
pnpm dev
```

- 本机 `pnpm dev`：`http://localhost:3000`（5173 常被 Windows 保留，故改用 3000）
- Docker 开发（热重载）：`docker compose -f docker-compose.dev.yml up --build`，宿主 3000 → 容器 5173
- 生产镜像：`docker compose up --build -d`，`http://localhost:8080`

> 注意：`http://127.0.0.1:3000` 可能被本机其他服务占用，请用 `http://localhost:3000`。

## 常用命令

```bash
pnpm dev            # 开发
pnpm build          # 构建（产物 dist/）
pnpm preview        # 预览构建产物
pnpm typecheck      # TS 类型检查
pnpm lint           # Biome 检查（历史双引号风格会报错，见「已知问题」）
pnpm i18n           # 检查 8 语言同步状态
pnpm i18n translate add <key> --zh .. --en .. --ja .. --ko .. --ru .. --fr .. --de .. --id ..
pnpm i18n changelog append <version> --zh .. --en .. --ja .. --ko .. --ru .. --fr .. --de .. --id ..
```

## 自测

```bash
pnpm exec tsx scripts/selftest-grid-code.mjs        # 电网码往返 + 燃料编码下标稳定性
pnpm exec tsx scripts/selftest-region-limiter.mjs   # 地区 × 燃料限速矩阵
pnpm exec tsx scripts/selftest-i18n-grid-keys.mjs   # 电网码相关 i18n key 完整性
pnpm exec tsx scripts/selftest-matrix-7665.mjs      # 7665W 九宫格回归
```

`selftest-grid-code` 里有一条硬断言：**燃料在分享码里的下标顺序不允许重排**，新燃料只能追加到 `FUELS` 末尾（UI 顺序走 `FUEL_DISPLAY_ORDER`）。四个脚本都在 CI 里跑，命名统一为 `selftest-*.mjs`，不要再加 `_` 前缀。

## 项目结构

```text
src/
  components/            # UI：layout（顶栏/侧栏）、solution（九宫格/图表/蓝图）、modals、ui 基件
  i18n/                  # 8 语言 key + 公告/更新日志 changelog
  types/                 # CalcParams / SolutionResult / 决策矩阵类型
  utils/
    FactoryDesigner.ts   # 求解内核（base 分层 + 震荡枚举 + 仿真 + 双轨）
    constants.ts         # 燃料表、常量、显示顺序
    shareParams.ts       # 分享码位域编解码（bit 槽向后兼容）
    gridCode.ts          # DIGE 电网码 B
    profileStorage.ts    # 本地多槽位存档
    inputRate.ts         # 准入口限速枚举
    regionLimiter.ts     # 地区 × 燃料规则
    decisionMatrix.ts    # 3×3 分桶与 Pareto 排序
    endfieldBlueprint/   # 蓝图 PNG 导出
scripts/
  i18n.ts                # 统一 i18n CLI（translate / prune / changelog）
docs/                    # 架构、电网码、容器与 APK 说明
```

求解主链路：

```text
侧栏参数 → App → factoryDesigner.worker
  → FactoryDesigner.solve()   （Track A 自动常驻 / Track B 纯震荡，签名去重）
  → buildSudokuDecisionMatrix()  （Pareto → 3×3 格）
  → 九宫格 + 方案详情 + 蓝图
```

## 已知问题

- `pnpm lint` 全仓有历史报错：Biome 配置要求单引号，而 1.11 之前的代码统一双引号。属于风格债务，不影响构建；改动建议只对自己碰过的文件保持现状风格，不做全仓 `--write`。
- 求解结果对「目标功率刚好卡在两台高功率机之间」的情况只能给硬顶解（例：单用高容武陵电池、目标 7300W 时只有 2×6400+200=13000W）。想精细就配低一档副燃料。

## 多语言规范

`zh` 是唯一 source of truth，任何新增/修改 key 必须一次补齐 8 种语言并用 CLI 写入，禁止手改 locale JSON。更新日志只往**当前大版本**小节追加，不新开小节。

## 部署（Cloudflare Pages）

| 项 | 值 |
| --- | --- |
| Framework preset | Vite |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Node / pnpm | `NODE_VERSION=22`、`PNPM_VERSION=9.13.0` |

`public/_redirects`（SPA 回退）与 `public/_headers`（缓存策略）随构建进 `dist/`。

## 贡献

欢迎提 Issue / PR，但请守住三条：

1. **先开 issue 说清场景**，尤其是求解内核改动（涉及分享码兼容与分桶口径）。
2. **新燃料只能追加**到 `FUELS` 末尾，UI 顺序改 `FUEL_DISPLAY_ORDER`。
3. 涉及文案必须 8 语言齐全；提交信息用 `feat|fix|chore(scope): 英文祈使句`。

## 致谢

- [djkcyl](https://github.com/djkcyl)：原项目作者，求解器与整体产品设计的起点。
- [Well2333](https://github.com/Well2333)：核心算法、蓝图 SVG 图标。
- [Starficz](https://github.com/Starficz)、[gander03](https://github.com/gander03) 等：上游 issue #2 里关于回灌分流与能量泄漏的公开推导，是本领域最有价值的一份资料。
- 所有在 issue 区留下使用场景的玩家。

## License

MIT，与上游一致。
