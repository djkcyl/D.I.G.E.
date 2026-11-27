# D.I.G.E.

D.I.G.E.（Dijiang Integrated Generator Efficiency）是《明日方舟：终末地》热能池发电方案计算器：给定目标功率，自动算出「几台满速 + 几路震荡分流 + 取货口/分流器怎么配」的最优组合，并逐秒仿真校验电池不被抽干。

- 在线地址：https://dige.aunly.cn

## 视频教程（有版本差）

入门可先看 B 站教程：https://www.bilibili.com/video/BV1mjZwBaEXi

**注意：视频录制于 v1.10 时期，没有演示后续新增的功能**——宽窗自动求解（不用再手调浪费/蓄电底线）、3×3 电网九宫格、电网码与多存档、双主题、地区规则、自定义热能池，以及游戏 1.7 的高容武陵电池。按视频逐步操作时遇到界面差异属正常现象，以本 README 与界面文案为准。

## 燃料数据（游戏 1.7）

| 燃料 | 功率 | 燃烧时长 | 备注 |
| --- | --- | --- | --- |
| 源矿 | 50W | 8s | 通用 |
| 低容 / 中容 / 高容谷地电池 | 220W / 420W / 1100W | 40s | 四号谷地 |
| 低容 / 中容 / **高容**武陵电池 | 1600W / 3200W / **6400W** | 40s | 武陵；谷地内不可用准入口限速 |
| 自定义燃料 | 自填 | 自填 | 主/副燃料均可覆盖 |

一条满速传送带 0.5 个/s、燃烧 40s 的电池对应 20 台热能池满载，所以高功率燃料的分流档位会很粗——这是燃料粒度决定的，不是算法缺陷。

## 游戏特性

- **物品准入口限流是成串放行，不是均匀拉长间隔**：设到 `6n` 个/分钟时，以 5 个传送带格位（10s）为周期，**连续放行 n 个、再空 5−n 个**（6/分 = `■□□□□`，12/分 = `■■□□□`，以此类推）。平均速率仍是 6n/分，但下游热能池会看到「成串 + 长空档」，仿真必须按格位序列推演。详见 [docs/architecture.md](docs/architecture.md)「三之一」。

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
