# x/p 多方块质数分流器方案（V4｜快速筛选独立版）

> 本文件为**新方案**，不替代、不覆盖任何旧方案。  
> 目标：在低计算成本下，先得到可用于筛选的 `x/p` 粗略分布画像。

---

## 1. 适用阶段与目标

本方案仅用于“候选快速筛选（Pre-Screening）”，输出如下两类核心信息：

1. 分流器的可用输出口数量；
2. 输入 `p` 个物品时，各输出口的输出计数与比例。

该阶段只做粗略统计，不做 LT 精确模拟、不做元相位闭环验证。

---

## 2. 元件范围（固定 19 个）

快速筛选只允许以下 19 个元件：

- `double_splitter`
- `triple_splitter`
- `one_5_splitter`（`2^1*3^1-1`）
- `one_7_splitter`（`2^3*3^0-1`）
- `one_11_splitter`（`2^2*3^1-1`）
- `one_17_splitter`（`2^1*3^2-1`）
- `one_23_splitter`（`2^3*3^1-1`）
- `one_31_splitter`（`2^5*3^0-1`）
- `one_47_splitter`（`2^4*3^1-1`）
- `one_53_splitter`（`2^1*3^3-1`）
- `one_71_splitter`（`2^3*3^2-1`）
- `one_107_splitter`（`2^2*3^3-1`）
- `one_127_splitter`（`2^7*3^0-1`）
- `one_191_splitter`（`2^6*3^1-1`）
- `one_383_splitter`（`2^7*3^1-1`）
- `one_431_splitter`（`2^4*3^3-1`）
- `one_647_splitter`（`2^3*3^4-1`）
- `one_863_splitter`（`2^5*3^3-1`）
- `one_971_splitter`（`2^2*3^5-1`）

---

## 3. 拓扑与结构前提

沿用当前 `SimplePrimeSplitter` 的布局主干：

- `Converger -> n个三分器 -> m个二分器`（单串结构）
- 其中 `p + 1 = 2^m * 3^n`

本方案认可该结构正确，不在筛选阶段改动布局。

---

## 4. 快速筛选计算模型（无 LT）

## 4.1 计算简化原则

- 只进行顺序输入，不引入时间维度（无 LT）；
- 每次输入在当前拓扑中完成一次离散分配；
- 不模拟阻塞与带宽；
- 回收支路在本阶段可被视作“可统计输出口”。

## 4.2 计算流程

对于目标质数分流器（`p`）：

1. 初始化所有分流器轮询指针（元相位初始方向）；
2. 依次输入第 `1..p` 个物品；
3. 物品经过链路时，分流器按顺时针轮询规则分配出口；
4. 命中某个可统计出口时，为该口计数 `+1`；
5. 完成 `p` 次输入后统计各口计数与比例。

## 4.3 输出指标

- `available_output_count`
- `output_count_by_port`
- `output_ratio_by_port = count / p`
- `ratio_sum_check`（应接近 1）

---

## 5. 数据结构（建议）

```text
QuickProfile
- part_id: str
- prime_p: int
- factor_m: int
- factor_n: int
- available_outputs: list[str]
- output_count_by_port: dict[str, int]
- output_ratio_by_port: dict[str, float]
- notes: str
```

批量结果：

```text
QuickProfileBundle
- generated_at
- profiles: list[QuickProfile]  # 固定19条
```

---

## 6. 与后续阶段的接口关系

本阶段结果用于缩小搜索空间，不直接判定最终可行性：

- 快速筛选通过：进入 LT 精确模拟（元相位回归判定）；
- 快速筛选不通过：直接淘汰或降级候选优先级。

---

## 7. 实施顺序（审阅通过后执行）

1. 基于 `SimplePrimeSplitter` 增加“可统计出口提取”能力；
2. 实现“顺序输入 p 次”的无 LT 粗算器；
3. 跑通 `p=5,7,11` 样例；
4. 批量生成 19 元件 `QuickProfileBundle`；
5. 输出排序视图（按目标 `x/p` 覆盖度）。

---

## 8. 阶段验收标准

- 19 个元件均产出 `QuickProfile`；
- 所有元件 `output_ratio_by_port` 可复现；
- 比例和校验通过（浮点误差范围内为 1）；
- 输出结果可直接用于后续精算阶段输入。
