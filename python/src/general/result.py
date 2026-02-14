from pydantic import BaseModel, ConfigDict

from .draw import Part
from .items import Fuel


class BranchComplexity(BaseModel):
	model_config = ConfigDict(frozen=True)
	total: int
	two_way: int
	three_way: int


class BranchInfo(BaseModel):
	model_config = ConfigDict(frozen=True)
	denominator: int
	power: float
	complexity: BranchComplexity
	blueprint: list[list[Part | None]]


class BranchInput(BaseModel):
	model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)
	denominator: int
	fuel: Fuel


class BaseConfig(BaseModel):
	model_config = ConfigDict(frozen=True)
	generators: int
	total_power: float
	belts: int


class FuelConsumption(BaseModel):
	model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)
	fuel: Fuel | None
	per_second: float
	per_minute: float
	per_hour: float
	per_day: float


class FuelConsumptionSummary(BaseModel):
	model_config = ConfigDict(frozen=True)
	base: FuelConsumption
	oscillating: FuelConsumption


class SimulationResult(BaseModel):
	model_config = ConfigDict(frozen=True)
	success: bool
	reason: str | None = None
	period: int | None = None
	avg_power: float | None = None
	waste: float | None = None
	variance: float | None = None
	min_battery: float | None = None
	min_battery_percent: float | None = None
	battery_log: list[float] | None = None
	power_log: list[float] | None = None
	burn_state_log: list[list[int]] | None = None
	precise_battery_log: list[float] | None = None
	precise_power_log: list[float] | None = None
	precise_burn_state_log: list[list[int]] | None = None


class OscillatingSolution(BaseModel):
	model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)
	fuel: Fuel
	is_primary: bool
	branches: list[BranchInfo]
	branch_count: int
	total_splitters: int
	period: int
	avg_power: float
	waste: float
	variance: float
	min_battery: float
	min_battery_percent: float
	battery_log: list[float]
	power_log: list[float]
	burn_state_log: list[list[int]]
	precise_battery_log: list[float]
	precise_power_log: list[float]
	precise_burn_state_log: list[list[int]]


class SolutionOutput(BaseModel):
	model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)
	base_config: BaseConfig
	base_fuel: Fuel
	oscillating: list[BranchInfo] | None
	oscillating_fuel: Fuel | None
	fuel: Fuel
	is_primary: bool
	input_interval: int
	avg_power: float
	waste: float
	variance: float
	period: int
	min_battery: float
	min_battery_percent: float
	branch_count: int
	total_splitters: int
	battery_log: list[float]
	power_log: list[float]
	burn_state_log: list[list[int]]
	precise_battery_log: list[float]
	precise_power_log: list[float]
	precise_burn_state_log: list[list[int]]
	fuel_consumption: FuelConsumptionSummary