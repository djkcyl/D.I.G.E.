### WIP

import math

from ..models.parts_real import Generator, Parts


def _lcm(a: int, b: int) -> int:
	# 计算最小公倍数，用于对齐各分支的供料周期
	if a == 0 or b == 0:
		return 0
	return abs(a * b) // math.gcd(a, b)


def simulate_real(
	*,
	parts: list[Parts],
	ticks: int,
	start_tick: int = 0,
) -> dict[str, object]:
	# 真实模拟：按 tick 驱动元件，逐步计算物品移动与燃烧
	if ticks <= 0:
		return {
			"ticks": 0,
			"generatorEnergy": {},
			"totalEnergy": 0.0,
			"finalCaches": [],
		}

	gen_before: dict[int, float] = {
		id(part): getattr(part, "generated_energy_j", 0.0)
		for part in parts
		if isinstance(part, Generator)
	}

	for tick in range(start_tick, start_tick + ticks):
		for part in parts:
			part.step(tick)

	gen_after: dict[int, float] = {}
	gen_total = 0.0
	for part in parts:
		if isinstance(part, Generator):
			energy = getattr(part, "generated_energy_j", 0.0)
			gen_after[id(part)] = energy - gen_before.get(id(part), 0.0)
			gen_total += gen_after[id(part)]

	final_caches: list[dict[str, object]] = []
	for part in parts:
		cache_item = getattr(part, "_cache_item", None)
		if cache_item is not None:
			final_caches.append({"partId": part.id, "itemId": cache_item.id})
		elif isinstance(part, Generator):
			final_caches.append(
				{
					"partId": part.id,
					"fuelId": getattr(part._cached_fuel, "id", None),
					"fuelCount": part._cached_count,
				}
			)

	return {
		"ticks": ticks,
		"generatorEnergy": gen_after,
		"totalEnergy": gen_total,
		"finalCaches": final_caches,
	}

