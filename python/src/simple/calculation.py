import math

from ..general.draw import (
    Belt,
    Converger,
    InputSource,
    LeftTurnBelt,
    Part,
    PartFace,
    RecycleSource,
    RightTurnBelt,
    Splitter,
    ThermalBank,
)
from ..general.items import Fuel
from ..general.result import (
    BranchComplexity,
    BranchInfo,
    BranchInput,
    BaseConfig,
    FuelConsumption,
    FuelConsumptionSummary,
    OscillatingSolution,
    SolutionOutput,
)
from .config import Config
from .simulator import PowerCycleSimulator


def get_oscillating_power(
    fuel: Fuel,
    denominator: int,
    base_interval: int,
) -> float:
    """分流后的平均功率.

    输入间隔 = 基础间隔 * 分母.
    - 若输入间隔 <= 燃烧时间, 发电机持续燃烧, 平均功率 = 额定功率
    - 若输入间隔 > 燃烧时间, 燃烧存在空档, 平均功率按占空比折算
    """

    input_interval = base_interval * denominator
    if input_interval <= fuel.burn_time:
        return fuel.power
    return fuel.power * fuel.burn_time / input_interval


def analyze_splitter_complexity(denominator: int) -> BranchComplexity:
    """拆解分母, 统计 2 分 / 3 分分流器数量.

    复杂度指标用于排序: 总分流器数量更少的方案优先.
    """

    d = denominator
    c2 = 0
    c3 = 0
    while d % 2 == 0:
        c2 += 1
        d //= 2
    while d % 3 == 0:
        c3 += 1
        d //= 3
    return BranchComplexity(total=c2 + c3, two_way=c2, three_way=c3)


def build_branch_blueprint(
    three_way: int, two_way: int, exclude_belt: bool = False
) -> list[list[Part | None]]:
    """为单个分支生成 5 行蓝图布局."""

    total_columns = 1 + three_way + two_way + 1
    grid: list[list[Part | None]] = [
        [None for _ in range(total_columns)] for _ in range(5)
    ]

    # 第 3 行: InputSource -> m*三分器 -> n*二分器 -> ThermalBank
    grid[2][0] = InputSource(face=PartFace.right)
    col = 1
    for _ in range(three_way):
        grid[2][col] = Splitter(face=PartFace.right)
        grid[0][col] = Converger(face=PartFace.left)
        grid[4][col] = Converger(face=PartFace.left)
        if exclude_belt:
            grid[1][col] = Converger(face=PartFace.up)
            grid[3][col] = Converger(face=PartFace.down)
        else:
            grid[1][col] = Belt(face=PartFace.up)
            grid[3][col] = Belt(face=PartFace.down)
        col += 1
    for _ in range(two_way):
        grid[2][col] = Splitter(face=PartFace.right)
        grid[0][col] = Converger(face=PartFace.left)
        if exclude_belt:
            grid[1][col] = Converger(face=PartFace.up)
        else:
            grid[1][col] = Belt(face=PartFace.up)
        col += 1
    grid[2][col] = ThermalBank(face=PartFace.right)

    # 第 (1,1) 放置回收源, 第 5 行有设施则补回收源
    grid[0][0] = RecycleSource(face=PartFace.right)
    if any(cell is not None for cell in grid[4]):
        grid[4][0] = RecycleSource(face=PartFace.right)

    # 将第一行和第五行的最后一个汇流器替换为转向传送带
    if not exclude_belt:
        for idx in range(total_columns - 1, -1, -1):
            if isinstance(grid[0][idx], Converger):
                grid[0][idx] = LeftTurnBelt(face=PartFace.up)
                break
        for idx in range(total_columns - 1, -1, -1):
            if isinstance(grid[4][idx], Converger):
                grid[4][idx] = RightTurnBelt(face=PartFace.down)
                break

    return grid


def build_solution_output(
    *,
    base_config: BaseConfig,
    primary_fuel: Fuel,
    target_power: int,
    input_interval: int,
    battery_capacity: int,
    base_fuel_per_sec: float,
    solution: OscillatingSolution | None,
    oscillating_fuel_per_sec: float,
) -> SolutionOutput:
    """统一构建 solve() 的输出结构."""

    if solution is None:
        return SolutionOutput(
            base_config=base_config,
            base_fuel=primary_fuel,
            oscillating=None,
            oscillating_fuel=None,
            fuel=primary_fuel,
            is_primary=True,
            input_interval=input_interval,
            avg_power=base_config.total_power,
            waste=base_config.total_power - target_power,
            variance=0,
            period=0,
            min_battery=float(battery_capacity),
            min_battery_percent=100,
            branch_count=0,
            total_splitters=0,
            battery_log=[float(battery_capacity)],
            power_log=[base_config.total_power],
            burn_state_log=[],
            precise_battery_log=[float(battery_capacity)],
            precise_power_log=[base_config.total_power],
            precise_burn_state_log=[],
            fuel_consumption=FuelConsumptionSummary(
                base=FuelConsumption(
                    fuel=primary_fuel,
                    per_second=base_fuel_per_sec,
                    per_minute=base_fuel_per_sec * 60,
                    per_hour=base_fuel_per_sec * 3600,
                    per_day=base_fuel_per_sec * 86400,
                ),
                oscillating=FuelConsumption(
                    fuel=None,
                    per_second=0,
                    per_minute=0,
                    per_hour=0,
                    per_day=0,
                ),
            ),
        )

    return SolutionOutput(
        base_config=base_config,
        base_fuel=primary_fuel,
        oscillating=solution.branches,
        oscillating_fuel=solution.fuel,
        fuel=solution.fuel,
        is_primary=solution.is_primary,
        input_interval=input_interval,
        avg_power=solution.avg_power,
        waste=solution.waste,
        variance=solution.variance,
        period=solution.period,
        min_battery=solution.min_battery,
        min_battery_percent=solution.min_battery_percent,
        branch_count=solution.branch_count,
        total_splitters=solution.total_splitters,
        battery_log=solution.battery_log,
        power_log=solution.power_log,
        burn_state_log=solution.burn_state_log,
        precise_battery_log=solution.precise_battery_log,
        precise_power_log=solution.precise_power_log,
        precise_burn_state_log=solution.precise_burn_state_log,
        fuel_consumption=FuelConsumptionSummary(
            base=FuelConsumption(
                fuel=primary_fuel,
                per_second=base_fuel_per_sec,
                per_minute=base_fuel_per_sec * 60,
                per_hour=base_fuel_per_sec * 3600,
                per_day=base_fuel_per_sec * 86400,
            ),
            oscillating=FuelConsumption(
                fuel=solution.fuel,
                per_second=oscillating_fuel_per_sec,
                per_minute=oscillating_fuel_per_sec * 60,
                per_hour=oscillating_fuel_per_sec * 3600,
                per_day=oscillating_fuel_per_sec * 86400,
            ),
        ),
    )


class FactoryDesigner:
    """工厂设计器 - 计算最优发电方案."""

    def __init__(self, config: Config) -> None:
        # 统一保存配置对象, 避免重复赋值
        self.config = config
        # 周期模拟器: 负责电池与供电仿真
        self.simulator = PowerCycleSimulator(config)

    def calculate_base_power(self) -> BaseConfig:
        """计算基础发电配置.

        先用主燃料的满带发电机填补基础缺口, 作为震荡方案的起点.
        """

        fuel_power = self.config.primary_fuel.power
        input_speed = (
            1 / self.config.input_interval if self.config.input_interval > 0 else 0
        )
        gens_per_belt = input_speed * self.config.primary_fuel.burn_time
        needed = self.config.target_power - self.config.base_power
        if needed <= 0:
            return BaseConfig(
                generators=0,
                total_power=float(self.config.base_power),
                belts=0,
            )
        generators = int(math.floor(needed / fuel_power))
        total_power = self.config.base_power + generators * fuel_power
        belts = int(math.ceil(generators / gens_per_belt)) if gens_per_belt > 0 else 0
        return BaseConfig(
            generators=generators,
            total_power=total_power,
            belts=belts,
        )

    def _get_combinations(self, arr: list[int], length: int) -> list[list[int]]:
        """生成允许重复的组合 (按非递减顺序).

        与 JS 版本一致, 使用递归枚举, 便于覆盖所有分支组合.
        """

        if length == 1:
            return [[x] for x in arr]
        combs: list[list[int]] = []
        for i, v in enumerate(arr):
            for sub in self._get_combinations(arr[i:], length - 1):
                combs.append([v, *sub])
        return combs

    def calculate_oscillating_plans(
        self,
        fuel: Fuel,
        base_config: BaseConfig,
        is_primary: bool,
    ) -> list[OscillatingSolution]:
        """计算单一燃料的震荡发电方案.

        先进行理论功率过滤, 再进行周期仿真验证.
        """

        gap = self.config.target_power - base_config.total_power
        if gap <= 0:
            return []

        denominators: list[int] = []
        for x in range(0, 10):
            for y in range(0, 7):
                val = (2**x) * (3**y)
                if 1 < val <= 512:
                    denominators.append(val)
        denominators.sort()

        solutions: list[OscillatingSolution] = []
        for r in range(1, self.config.max_branches + 1):
            combos = self._get_combinations(denominators, r)
            for combo in combos:
                theory_power = sum(
                    get_oscillating_power(fuel, d, self.config.input_interval)
                    for d in combo
                )
                theory_total = base_config.total_power + theory_power
                theory_waste = theory_total - self.config.target_power
                # 快速过滤: 负溢出会掉电, 过大溢出直接不考虑
                if theory_waste < 0 or theory_waste > self.config.max_waste + 10:
                    continue

                branches = [BranchInput(denominator=d, fuel=fuel) for d in combo]
                result = self.simulator.simulate_cycle(base_config, branches, fuel)
                # 仿真通过且浪费在允许范围内才保留
                if (
                    result.success
                    and result.waste is not None
                    and 0 <= result.waste <= self.config.max_waste
                ):
                    complexity = [analyze_splitter_complexity(d) for d in combo]
                    total_splitters = sum(c.total for c in complexity)
                    solutions.append(
                        OscillatingSolution(
                            fuel=fuel,
                            is_primary=is_primary,
                            branches=[
                                BranchInfo(
                                    denominator=d,
                                    power=get_oscillating_power(
                                        fuel, d, self.config.input_interval
                                    ),
                                    complexity=complexity[i],
                                    blueprint=build_branch_blueprint(
                                        complexity[i].three_way,
                                        complexity[i].two_way,
                                        self.config.exclude_belt,
                                    ),
                                )
                                for i, d in enumerate(combo)
                            ],
                            branch_count=len(combo),
                            total_splitters=total_splitters,
                            period=result.period or 0,
                            avg_power=result.avg_power or 0,
                            waste=result.waste or 0,
                            variance=result.variance or 0,
                            min_battery=result.min_battery or 0,
                            min_battery_percent=result.min_battery_percent or 0,
                            battery_log=result.battery_log or [],
                            power_log=result.power_log or [],
                            burn_state_log=result.burn_state_log or [],
                            precise_battery_log=result.precise_battery_log or [],
                            precise_power_log=result.precise_power_log or [],
                            precise_burn_state_log=result.precise_burn_state_log or [],
                        )
                    )

        return solutions

    def solve(self) -> list[SolutionOutput]:
        """主求解函数.

        流程:
        1) 先计算基础发电
        2) 枚举震荡分支组合并仿真
        3) 排序并返回前 5 个方案
        """

        base_config = self.calculate_base_power()

        # 基础发电已经满足需求的情况
        if base_config.total_power >= self.config.target_power:
            waste = base_config.total_power - self.config.target_power
            if waste <= self.config.max_waste:
                base_fuel_per_sec = (
                    base_config.generators / self.config.primary_fuel.burn_time
                    if base_config.generators > 0
                    else 0
                )
                return [
                    build_solution_output(
                        base_config=base_config,
                        primary_fuel=self.config.primary_fuel,
                        target_power=self.config.target_power,
                        input_interval=self.config.input_interval,
                        battery_capacity=self.config.battery_capacity,
                        base_fuel_per_sec=base_fuel_per_sec,
                        solution=None,
                        oscillating_fuel_per_sec=0,
                    )
                ]

        # 震荡方案: 主燃料 + 可选副燃料
        all_solutions: list[OscillatingSolution] = []
        all_solutions.extend(
            self.calculate_oscillating_plans(
                self.config.primary_fuel, base_config, True
            )
        )
        if self.config.secondary_fuel:
            all_solutions.extend(
                self.calculate_oscillating_plans(
                    self.config.secondary_fuel, base_config, False
                )
            )

        # 排序规则: 分支少 > 方差小 > 浪费少 > 主燃料优先
        all_solutions.sort(
            key=lambda s: (
                s.branch_count,
                round(s.variance, 1),
                round(s.waste, 1),
                0 if s.is_primary else 1,
            )
        )

        top_solutions: list[SolutionOutput] = []
        for sol in all_solutions[:5]:
            base_fuel_per_sec = (
                base_config.generators / self.config.primary_fuel.burn_time
                if base_config.generators > 0
                else 0
            )
            oscillating_fuel_per_sec = (
                sum(
                    1 / (self.config.input_interval * b.denominator)
                    for b in sol.branches
                )
                if sol.branches
                else 0
            )
            top_solutions.append(
                build_solution_output(
                    base_config=base_config,
                    primary_fuel=self.config.primary_fuel,
                    target_power=self.config.target_power,
                    input_interval=self.config.input_interval,
                    battery_capacity=self.config.battery_capacity,
                    base_fuel_per_sec=base_fuel_per_sec,
                    solution=sol,
                    oscillating_fuel_per_sec=oscillating_fuel_per_sec,
                )
            )

        return top_solutions
