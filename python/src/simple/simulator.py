import math

from ..general.items import Fuel
from ..general.result import BaseConfig, BranchInput, SimulationResult
from .config import Config


class PowerCycleSimulator:
	"""周期仿真器 - 负责供电与电池状态模拟."""

	def __init__(self, config: Config) -> None:
		# 目标功率与电池约束
		self.target_power = config.target_power
		self.min_battery_percent = config.min_battery_percent
		self.battery_capacity = config.battery_capacity
		# 输入间隔用于计算分支的实际供料节奏
		self.input_interval = config.input_interval

	def _gcd(self, a: int, b: int) -> int:
		"""最大公约数."""

		return a if b == 0 else self._gcd(b, a % b)

	def _lcm(self, a: int, b: int) -> int:
		"""最小公倍数."""

		if a == 0 or b == 0:
			return 0
		return abs(a * b) // self._gcd(a, b)

	def _get_cycle_period(self, denominators: list[int]) -> int:
		"""计算周期长度 (秒).

		周期取所有分支输入间隔的最小公倍数, 便于循环模拟.
		"""

		if not denominators:
			return self.input_interval
		intervals = [self.input_interval * d for d in denominators]
		period = self.input_interval
		for interval in intervals:
			period = self._lcm(period, interval)
		return period

	def simulate_cycle(
		self,
		base_config: BaseConfig,
		oscillating_branches: list[BranchInput],
		fuel: Fuel,
	) -> SimulationResult:
		"""模拟一个周期的供电与电池状态.

		使用 1 秒粒度, 先预热再进入最后一个周期进行统计.
		"""

		period = self._get_cycle_period([b.denominator for b in oscillating_branches])
		if period > 100000:
			return SimulationResult(success=False, reason="period_too_long")

		num_cycles = 3
		total_duration = period * num_cycles
		timeline_size = int(math.ceil(total_duration))

		# 每秒功率、每分支燃烧状态记录 (0/1)
		power_timeline = [0.0 for _ in range(timeline_size)]
		branch_burn_timeline = [
			[0 for _ in range(timeline_size)] for _ in oscillating_branches
		]

		# 逐分支模拟燃烧区间: 输入到达即点燃, 直到燃烧结束
		for branch_index, branch in enumerate(oscillating_branches):
			input_interval = self.input_interval * branch.denominator
			last_burn_end = 0.0
			for t in range(0, total_duration, input_interval):
				burn_start = max(t, last_burn_end)
				burn_end = burn_start + fuel.burn_time
				last_burn_end = burn_end
				for i in range(int(math.floor(burn_start)), min(int(math.ceil(burn_end)), total_duration)):
					power_timeline[i] += fuel.power
					branch_burn_timeline[branch_index][i] = 1

		# 校验周期内的平均功率: 只统计最后一个完整周期
		check_start = int(math.floor(total_duration - period))
		cycle_power = power_timeline[check_start:total_duration]

		# 电池模拟参数: 初始视为满电
		min_batt_required = self.battery_capacity * self.min_battery_percent / 100
		battery = float(self.battery_capacity)
		min_battery = battery
		battery_log: list[float] = []
		power_log: list[float] = []
		burn_state_log: list[list[int]] = [[] for _ in oscillating_branches]
		precise_battery_log: list[float] = []
		precise_power_log: list[float] = []
		precise_burn_state_log: list[list[int]] = [[] for _ in oscillating_branches]

		# 预热阶段: 让电池在前两轮周期内达到稳态
		for t in range(0, check_start):
			supply = base_config.total_power + power_timeline[t]
			battery += supply - self.target_power
			if battery > self.battery_capacity:
				battery = float(self.battery_capacity)
			if battery < 0:
				return SimulationResult(success=False, reason="battery_depleted_preheat")

		# 正式周期: 逐秒更新电池并记录采样
		sample_step = int(math.ceil(period / 500)) if period >= 2000 else 1
		for t in range(check_start, total_duration):
			supply = base_config.total_power + power_timeline[t]
			battery += supply - self.target_power

			if battery > self.battery_capacity:
				battery = float(self.battery_capacity)
			if battery < min_battery:
				min_battery = battery

			if period < 2000 or ((t - check_start) % sample_step == 0):
				battery_log.append(battery)
				power_log.append(supply)
				for i in range(len(burn_state_log)):
					burn_state_log[i].append(branch_burn_timeline[i][t])

			precise_battery_log.append(battery)
			precise_power_log.append(supply)
			for i in range(len(precise_burn_state_log)):
				precise_burn_state_log[i].append(branch_burn_timeline[i][t])

			if battery < min_batt_required:
				return SimulationResult(
					success=False,
					reason="battery_below_min",
					min_battery=min_battery,
				)

		# 统计平均功率与方差
		avg_power = (sum(cycle_power) / len(cycle_power)) + base_config.total_power
		variance = (
			sum((p - (avg_power - base_config.total_power)) ** 2 for p in cycle_power)
			/ len(cycle_power)
		)
		waste = avg_power - self.target_power

		return SimulationResult(
			success=True,
			period=period,
			avg_power=avg_power,
			waste=waste,
			variance=variance,
			min_battery=min_battery,
			min_battery_percent=(min_battery / self.battery_capacity) * 100,
			battery_log=battery_log,
			power_log=power_log,
			burn_state_log=burn_state_log,
			precise_battery_log=precise_battery_log,
			precise_power_log=precise_power_log,
			precise_burn_state_log=precise_burn_state_log,
		)
