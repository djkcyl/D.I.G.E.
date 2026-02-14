# x/p 多方块质数分流器重构规划（第三版｜工程化审阅稿）

> 状态：仅规划，不实施代码改动  
> 基线依据：`python/knowledge.md`（LT 结算、分流器顺时针轮询、元相位与周期定义）  
> 设计目标：先以低计算成本快速筛选可行候选方案，再进入蓝图规划与至少一完整周期（回归元相位）仿真验证，最后输出可扩展为成品蓝图的结构结果。

---

## 0. 强约束与验收口径

## 0.1 强约束

1. `models` 只存放设备模型与设备自身逻辑。  
2. `simulation` 必须独立于 `models`。  
3. `draw` 相关字段仅用于绘图，不参与任何逻辑判断与仿真。  
4. 二分器、三分器、质数分流器使用统一逻辑语言与统一执行语义。  
5. 本轮不考虑旧代码兼容，可替换式重构。

## 0.2 强制停止条件（本版新增）

对任一候选方案，流程只能在以下条件满足后才允许“判定完成”：

- 已生成逻辑蓝图；
- 已完成至少一完整周期仿真；
- 周期定义为系统回归元相位（不是输入数量达到 `p`）；
- 已输出周期统计报告（`x/p` 名义值与实测值）。

若未回归元相位，只能输出“未收敛/未闭环”，不得宣称方案可行。

---

## 1. 总体流程：四阶段流水线

## 阶段 A：候选构建系统（低算力快速筛选）

目标：在尽量小的计算开销下，快速找到“可能可行”的方案集合，而不是直接做重仿真。

输入：

- 目标质数 `p`（需满足 `p+1 = 2^m * 3^n` 可构造条件）；
- 目标分子范围 `x` 或目标输出端口预算；
- 反馈延迟近似规则（默认 `splitter_count + 1` LT）。

输出：

- 候选方案列表 `CandidatePlan[]`（每项含分流器组合、支路角色分配草案、预估评分）。

方法：

1. 拓扑模板枚举（仅枚举可构造模板，剪枝非法结构）；
2. 支路角色快速分配（输出/反馈/终端）；
3. 静态可行性检查（端口连通、入出度、无断链）；
4. 轻量估计打分（近似平衡度、反馈负载、潜在拥堵风险）。

复杂度策略：

- 先启发式，再精算；
- 固定最大候选数 `K`（例如 10～30）；
- 失败时输出“无候选”并返回最接近约束的诊断信息。

## 阶段 B：逻辑蓝图规划（从候选到可执行图）

目标：将候选方案转成可直接仿真的逻辑蓝图，不依赖绘图系统。

输入：`CandidatePlan`

输出：`LogicBlueprint`

处理：

1. 生成节点集（分流器/汇入器/传输边）；
2. 生成端口集（明确每个端口的角色与顺时针序）；
3. 生成边集（带 `delay_lt`）；
4. 写入默认方案分配（用于构造 1/p 基线与 x/p 变体）。

## 阶段 C：周期仿真验证（必须回归元相位）

目标：验证候选在 LT 离散时钟下是否真实成立。

输入：`LogicBlueprint + SchemeAssignment`

输出：`CycleReport`

执行规则（对齐 knowledge）：

- 以 LT 为计算步（世界时偶秒触发等价于每 LT 一步）；
- 分流器输出按顺时针轮询（9→12→3），阻塞跳过；
- 回流通过延迟队列回注；
- 周期结束条件是“状态签名回到元相位初始签名”。

最小验收：

- 至少完成 1 次回归元相位；
- 产出周期长度、周期输入总量、端口输出分布、实测比值；
- 若未闭环，输出最大步数截断报告与当前相位差。

## 阶段 D：成品蓝图补全（本轮只定义接口）

目标：在验证通过的逻辑蓝图上补回外围线路（回收链路、输出汇总、仓储接口）形成成品图。

说明：你已明确此部分可后续讨论，因此本轮只定义输入输出与挂接位，不做最终工程细化。

---

## 2. 新目录结构（按职责分层）

```text
python/src/
  models/
    parts/
      draw.py                      # 仅绘图对象
      logic_language.py            # 逻辑语言：端口/节点/状态定义
      splitter_models.py           # 二分/三分/质数分流器模型
      logic_blueprint.py           # 逻辑蓝图结构与构建器
      candidate_builder.py         # 低算力候选构建系统（阶段A）

  simulation/
    lt_engine.py                   # LT 离散执行引擎
    cycle_verifier.py              # 元相位回归判定
    prime_splitter_runner.py       # 针对质数分流器的执行编排
    report_types.py                # 周期报告/统计类型
    report_builder.py              # 报告汇总与一致性检查

  designer/
    predictive.py                  # 对外入口：build -> plan -> simulate
```

---

## 3. 统一逻辑语言（用于全部分流器）

## 3.1 语言目标

统一描述“每个分流器每个接口”的行为，不使用绘图标注。

## 3.2 核心类型

### 3.2.1 端口角色 `PortRole`

- `INPUT`
- `OUTPUT_CANDIDATE`
- `FEEDBACK_RETURN`
- `EXTERNAL_OUTPUT`
- `SINK`

### 3.2.2 节点行为 `NodeBehavior`

- `SPLITTER_RR_2`
- `SPLITTER_RR_3`
- `CONVERGER_3_TO_1`
- `TRANSPORT`

### 3.2.3 节点状态 `NodeState`

- `pointer`：当前轮询指针
- `buffer`：缓存占用（首版 0/1）
- `blocked`：当前候选口阻塞视图

### 3.2.4 全局状态 `MachineState`

- `lt_index`
- `node_state_map`
- `transit_tokens`
- `feedback_delay_queue`
- `input_count`
- `output_count_by_port`

---

## 4. 全分流器统一类结构

## 4.1 类体系

- `BaseSplitterModel`
- `TwoWaySplitterModel`
- `ThreeWaySplitterModel`
- `PrimeMultiBlockSplitterModel`

## 4.2 统一接口

- `build_candidate_space() -> CandidateSpace`
- `build_logic_blueprint(candidate) -> LogicBlueprint`
- `init_machine_state(blueprint) -> MachineState`
- `validate_scheme(blueprint, scheme) -> ValidationResult`

说明：二分器与三分器也必须走同一流程，不再作为例外特判。

---

## 5. 候选构建系统（你要求的基础系统）

## 5.1 设计目标

- 用最小计算量给出“可能可行”候选；
- 候选必须可被后续蓝图规划与仿真消费；
- 输出可解释，不做黑箱评分。

## 5.2 候选对象 `CandidatePlan`

字段建议：

- `plan_id`
- `prime_p`
- `splitter_chain_signature`（2/3 分流器链构成）
- `branch_role_draft`（支路用途草案）
- `estimated_feedback_load`
- `estimated_output_span`
- `heuristic_score`

## 5.3 快速筛选规则

1. 构造性筛选：不可分解为 `2^m*3^n-1` 直接淘汰；
2. 连通性筛选：入口到所有候选输出必须可达；
3. 回流可达筛选：反馈支路必须回到入口汇入点；
4. 容量近似筛选：局部边负载估计超阈值淘汰；
5. 保留 Top-K 候选进入仿真阶段。

---

## 6. 周期仿真与停止逻辑（关键）

## 6.1 单步执行（每 1 LT）

1. 注入可用输入（外部+反馈到期）；
2. 按稳定顺序执行节点动作；
3. 轮询分配与阻塞跳过；
4. 推进在途 token；
5. 更新反馈延迟队列；
6. 记录事件快照。

## 6.2 元相位判定

元相位初态定义（对齐 knowledge）：

- 所有分流器指针指向“自输入口顺时针第一个已连接输出口”；
- 全局在途 token 与反馈队列为空或等于初始设定。

周期闭环签名：

- 分流器指针向量
- 在途 token 分布
- 反馈延迟队列分布
- LT 模相位

当签名首次重现初态签名，判定一个完整周期结束。

## 6.3 停止条件

- `SUCCESS`：至少一次回归元相位并生成周期报告；
- `FAIL_MAX_STEPS`：达到最大步数仍未闭环；
- `FAIL_DEADLOCK`：系统进入无前进事件死锁；
- `FAIL_INVALID`：方案非法（连通/容量/角色冲突）。

---

## 7. 报告体系（x/p 名义与实测并列）

`CycleReport` 建议字段：

- `prime_p`
- `target_x`
- `cycle_length_lt`
- `cycle_input_total`
- `cycle_output_total`
- `output_by_port`
- `nominal_ratio`（目标 x/p）
- `effective_ratio`（实测输出/输入）
- `phase_returned`（是否回归元相位）
- `termination_reason`

要求：未回归元相位时，`effective_ratio` 标记为“非稳态参考值”。

---

## 8. 实施计划（可执行顺序）

## 步骤 1：先建候选构建系统

- 完成 `candidate_builder.py`；
- 输出 Top-K 候选与筛选诊断；
- 提供固定随机种子确保可复现。

## 步骤 2：再建逻辑蓝图规划器

- 完成 `logic_language.py` 与 `logic_blueprint.py`；
- 二分/三分器先落地，作为质数分流器子结构基石。

## 步骤 3：构建周期仿真验证器

- 完成 `lt_engine.py`、`cycle_verifier.py`；
- 强制“回归元相位才可判定完成”。

## 步骤 4：落地质数多方块模型

- 完成 `PrimeMultiBlockSplitterModel`；
- 与候选系统/仿真系统打通。

## 步骤 5：输出成品蓝图挂接接口

- 给出外围回收与输出链路挂接点；
- 具体外围连接细节留待下一轮讨论。

---

## 9. 验证矩阵

基础验证：

- `p=5,7,11` 的 1/p 基线收敛；
- 同一 `p` 的多组 x/p 候选中至少一组闭环；
- 二分/三分器在统一状态语言下结果与规则一致。

压力验证：

- 长周期候选在最大步数内给出明确终止原因；
- 反馈负载极端场景无崩溃。

---

## 10. 关键风险与缓解

1. 候选空间爆炸  
   - 缓解：规则剪枝 + Top-K + 分层评分。

2. 周期过长导致验证慢  
   - 缓解：签名哈希去重 + 步数上限 + 早停诊断。

3. 名义比例与实测偏差难解释  
   - 缓解：报告并列展示并附相位差/延迟统计。

---

## 11. 待你确认（仅两项）

1. 候选构建阶段的默认 `Top-K` 取值（建议 20）。
2. `FAIL_MAX_STEPS` 的默认上限（建议按 `p` 分段配置，如 `max_steps = 200 * p`）。

---

## 12. 审阅通过后的立即执行范围

- 先实施步骤 1～3（候选构建 + 逻辑蓝图 + 周期验证）；
- 以 `p=5,7,11` 输出第一轮可审计报告；
- 成品蓝图外围连接在你确认后进入下一迭代。
