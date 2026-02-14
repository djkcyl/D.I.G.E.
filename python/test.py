from src.general.draw import (
	Belt,
	Converger,
	InputSource,
	LeftTurnBelt,
	PartFace,
	RecycleSource,
	RightTurnBelt,
	Splitter,
	ThermalBank,
)
from src.general.items import WulingLow
from src.general.result import BranchInfo, SolutionOutput
from src.simple.calculation import FactoryDesigner
from src.simple.config import Config


def _face_to_arrow(face: PartFace) -> str:
	"""Map part face to ASCII arrow."""

	return {
		PartFace.up: "^",
		PartFace.down: "v",
		PartFace.left: "<",
		PartFace.right: ">",
	}[face]


def _part_to_token(part) -> str:
	"""Render a part as ASCII token with orientation."""

	arrow = _face_to_arrow(part.face)
	if isinstance(part, Splitter):
		return f"S{arrow}"
	if isinstance(part, Converger):
		return f"M{arrow}"
	if isinstance(part, InputSource):
		return f"I{arrow}"
	if isinstance(part, ThermalBank):
		return f"T{arrow}"
	if isinstance(part, RecycleSource):
		return f"R{arrow}"
	if isinstance(part, LeftTurnBelt):
		return f"L{arrow}"
	if isinstance(part, RightTurnBelt):
		return f"R{arrow}"
	if isinstance(part, Belt):
		return f"{arrow}"
	return "?"


def render_blueprint(branch: BranchInfo) -> str:
	"""Render a branch blueprint using tab-separated ASCII tokens."""

	lines = []
	for row in branch.blueprint:
		cells = []
		for cell in row:
			if cell is None:
				cells.append(".")
			else:
				cells.append(_part_to_token(cell))
		lines.append("\t".join(cells))
	return "\n".join(lines)


def run_basic_test() -> list[SolutionOutput]:
	"""Run a minimal solve flow and validate output structure."""

	config = Config(
		target_power=2000,
		primary_fuel=WulingLow(),
		secondary_fuel=None,
		min_battery_percent=10,
		max_waste=50,
		max_branches=3,
		input_interval=2,
	)

	designer = FactoryDesigner(config)
	solutions = designer.solve()

	assert isinstance(solutions, list)
	assert solutions, "solve() should return at least one solution"
	assert isinstance(solutions[0], SolutionOutput)
	assert solutions[0].avg_power >= 0
	assert solutions[0].fuel_consumption.base.per_second >= 0

	return solutions


if __name__ == "__main__":
	outputs = run_basic_test()
	print(f"Solutions: {len(outputs)}")
	for sol_index, solution in enumerate(outputs[:5], start=1):
		print(
			"Solution"
			f" {sol_index}: avg={solution.avg_power:.2f}"
			f", period={solution.period}"
			f", min_batt={solution.min_battery_percent:.2f}%"
			f", variance={solution.variance:.2f}"
		)
		if solution.oscillating:
			for idx, branch in enumerate(solution.oscillating, start=1):
				print(f"Branch {idx} (denominator={branch.denominator}):")
				print(render_blueprint(branch))
				print()
