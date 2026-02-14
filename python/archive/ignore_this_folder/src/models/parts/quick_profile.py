from __future__ import annotations

from collections import defaultdict
from collections import deque

from pydantic import BaseModel, ConfigDict, Field

from .predictive import DoubleSplitter, SimplePrimeSplitter, TripleSplitter


PRIME_COMPONENTS: tuple[int, ...] = (
    5,
    7,
    11,
    17,
    23,
    31,
    47,
    53,
    71,
    107,
    127,
    191,
    383,
    431,
    647,
    863,
    971,
)


class QuickProfile(BaseModel):
    model_config = ConfigDict(frozen=True)

    part_id: str
    prime_p: int
    factor_m: int
    factor_n: int
    available_outputs: list[str] = Field(default_factory=list)
    output_count_by_port: dict[str, int] = Field(default_factory=dict)
    output_ratio_by_port: dict[str, float] = Field(default_factory=dict)
    notes: str = ""


class _ChainNode(BaseModel):
    outputs: dict[str, int | str]
    pointer_index: int = 0

    def dispatch(self) -> int | str:
        scan_order = ("up", "right", "down")
        for step in range(3):
            index = (self.pointer_index + step) % 3
            direction = scan_order[index]
            if direction not in self.outputs:
                continue
            self.pointer_index = (index + 1) % 3
            return self.outputs[direction]
        raise RuntimeError("no available output for chain node")


def _counts_to_ratio(counts: dict[str, int], total_input: int) -> dict[str, float]:
    if total_input <= 0:
        return {port_id: 0.0 for port_id in counts}
    return {
        port_id: count / total_input
        for port_id, count in sorted(counts.items(), key=lambda item: item[0])
    }


def _simulate_single_splitter(part_id: str, output_ports: list[str]) -> QuickProfile:
    total_input = len(output_ports)
    counts: dict[str, int] = {}
    for port in output_ports:
        counts[port] = counts.get(port, 0) + 1
    ratio = _counts_to_ratio(counts, total_input)
    return QuickProfile(
        part_id=part_id,
        prime_p=total_input,
        factor_m=0,
        factor_n=0,
        available_outputs=sorted(counts.keys()),
        output_count_by_port=dict(sorted(counts.items(), key=lambda item: item[0])),
        output_ratio_by_port=ratio,
        notes="quick profile for base splitter",
    )


def build_base_splitter_profiles() -> list[QuickProfile]:
    double_splitter = DoubleSplitter()
    triple_splitter = TripleSplitter()
    return [
        _simulate_single_splitter(
            part_id=double_splitter.part_id,
            output_ports=["out.main", "out.recycle_up"],
        ),
        _simulate_single_splitter(
            part_id=triple_splitter.part_id,
            output_ports=["out.main", "out.recycle_up", "out.recycle_down"],
        ),
    ]


def _build_prime_chain_nodes(m: int, n: int) -> list[_ChainNode]:
    splitter_count = m + n
    nodes: list[_ChainNode] = []

    for splitter_index in range(splitter_count):
        is_last = splitter_index == splitter_count - 1
        is_triple_zone = splitter_index < n

        if is_triple_zone:
            outputs: dict[str, int | str] = {
                "up": f"s{splitter_index}.up",
                "down": f"s{splitter_index}.down",
            }
            if not is_last:
                outputs["right"] = splitter_index + 1
            nodes.append(_ChainNode(outputs=outputs))
            continue

        if is_last:
            outputs = {"down": f"s{splitter_index}.down"}
            nodes.append(_ChainNode(outputs=outputs))
            continue

        outputs = {
            "up": f"s{splitter_index}.up",
            "right": splitter_index + 1,
            "down": "feedback",
        }
        nodes.append(_ChainNode(outputs=outputs))

    return nodes


def build_prime_splitter_quick_profile(prime_value: int) -> QuickProfile:
    factors = SimplePrimeSplitter.factor_prime(prime_value)
    if factors is None:
        raise ValueError(f"prime {prime_value} is not constructible by 2^m * 3^n - 1")

    m, n = factors
    prime_splitter = SimplePrimeSplitter(prime_value)
    chain_nodes = _build_prime_chain_nodes(m=m, n=n)
    if not chain_nodes:
        raise ValueError(f"prime {prime_value} has empty chain nodes")

    output_count_by_port: dict[str, int] = defaultdict(int)
    processing_queue = deque([0 for _ in range(prime_value)])
    safety_limit = prime_value * 200000
    processed_steps = 0

    while processing_queue:
        processed_steps += 1
        if processed_steps > safety_limit:
            raise RuntimeError(
                f"prime {prime_value} simulation exceeds safety limit {safety_limit}"
            )

        _ = processing_queue.popleft()
        current_index = 0
        while True:
            target = chain_nodes[current_index].dispatch()
            if isinstance(target, int):
                current_index = target
                continue
            if target == "feedback":
                processing_queue.append(0)
                break
            output_count_by_port[target] += 1
            break

    normalized_counts = dict(sorted(output_count_by_port.items(), key=lambda item: item[0]))
    output_ratio_by_port = _counts_to_ratio(normalized_counts, prime_value)

    return QuickProfile(
        part_id=prime_splitter.part_id,
        prime_p=prime_value,
        factor_m=m,
        factor_n=n,
        available_outputs=sorted(normalized_counts.keys()),
        output_count_by_port=normalized_counts,
        output_ratio_by_port=output_ratio_by_port,
        notes="quick profile from sequential p-input + feedback drain simulation without LT",
    )


def build_all_quick_profiles() -> list[QuickProfile]:
    profiles = build_base_splitter_profiles()
    for prime_value in PRIME_COMPONENTS:
        profiles.append(build_prime_splitter_quick_profile(prime_value))
    return profiles
