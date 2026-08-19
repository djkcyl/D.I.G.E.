# D.I.G.E. Grid Code（电网蓝图码）

方案 **B：全粘连（Fully-Concatenated）**。参数分享码，不携带求解结果。

## 格式

```text
DIGE + <R:1> + <power:1-5 digits> + <primary:2> + <secondary:2> + <mode:1> + <Base52 payload>
```

示例（载荷示意）：

```text
DIGEW7300WMVHA9aK7Z2…
DIGEV5800VHNOA…
DIGEF2500WLORM…
```

- **无** `-` / `+` / `#` 分隔符（canonical 无空格；UI 可加空格展示，导入时 strip）。
- **权威数据**：Base52 `payload` = 既有 `encodeShareParams` / `decodeShareParams`（`src/utils/shareParams.ts`）。
- **人读头**：仅展示与粗校验；与 payload 不一致时 **以 payload 为准** 并提示。

## 正则

```text
^DIGE([VWF])(\d{1,5})([A-Z]{2})([A-Z]{2})([ALMPS])([A-Za-z]+)$
```

## 字典

### 地区 `factoryRegion`

| 值 | 码 |
|----|-----|
| valley | V |
| wuling | W |
| free | F |

### 燃料

| fuelId | 码 |
|--------|-----|
| ore | OR |
| valleyLow | VL |
| valleyMid | VM |
| valleyHigh | VH |
| wulingLow | WL |
| wulingMid | WM |
| customPrimary | CP |
| customSecondary | CS |
| none（副） | NO |

### 模式 `multiFuelMode`

| 值 | 码 |
|----|-----|
| auto | A |
| legacy | L |
| mixed | M |
| primaryOnly | P |
| secondaryOnly | S |

## 双轨兼容

| 形态 | 说明 |
|------|------|
| Grid Code B | `DIGEW7300WMVHA…` |
| URL | `?p=<Base52>`（冷启动 → 临时会话） |
| 裸 token | 纯 Base52 |

## 载荷边界（v1）

- **包含**：与 `ShareParams` 相同（含 fuelOverrides、factoryRegion、multiFuelMode 等）。
- **不包含**：`manualBaseLines`、profile 元数据、计算结果 / 蓝图格子。

## 产品行为

1. **head ≠ payload**：按 payload 载入 + Toast 提示真实功率。
2. **显式导入**（Import 弹窗）：新建本地存档槽并切换。
3. **URL 冷启动**：`isUrlSession`，不自动写档。
4. **分享弹窗**：蓝图码优先，完整链接并列。

## 实现

- `src/utils/gridCode.ts` — 编解码与 `parseImportInput`
- `ShareModal` / `ImportProfileModal` — UI

## 自测

```bash
pnpm exec tsx scripts/_selftest_grid_code.mjs
```
