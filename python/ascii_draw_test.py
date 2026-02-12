from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

from models.parts.draw import (  # noqa: E402
    PartFace,
    Belt,
    BeltBridge,
    Converger,
    LeftTurnBelt,
    Part,
    RightTurnBelt,
    Splitter,
)
from models.parts.predictive import (  # noqa: E402
    SplitterPart,
    SimplePrimeSplitter,
)


def _face_arrow(face: PartFace) -> str:
    return {
        PartFace.up: "^",
        PartFace.down: "v",
        PartFace.left: "<",
        PartFace.right: ">",
    }[face]


def _pad(cell: str, width: int = 2) -> str:
    if len(cell) >= width:
        return cell[:width]
    return cell + " " * (width - len(cell))


def _symbol_for_part(part: Part) -> str:
    if isinstance(part, Splitter):
        return "S "
    if isinstance(part, Converger):
        return "C "
    if isinstance(part, BeltBridge):
        return "+ "
    if isinstance(part, LeftTurnBelt):
        return "L" + _face_arrow(part.face)
    if isinstance(part, RightTurnBelt):
        return "R" + _face_arrow(part.face)
    if isinstance(part, Belt):
        return _face_arrow(part.face) + " "
    return "? "


def render_blueprint(splitter: SplitterPart) -> str:
    if splitter.blueprint is None:
        return "(no blueprint)"
    lines = []
    for row in splitter.blueprint:
        cells = []
        for part in row:
            if part is None:
                cells.append(_pad(".."))
            else:
                cells.append(_pad(_symbol_for_part(part)))
        lines.append(" ".join(cells))
    return "\n".join(lines)


def show_splitter(prime_value: int) -> None:
    factors = SimplePrimeSplitter.factor_prime(prime_value)
    try:
        splitter = SimplePrimeSplitter(prime_value)
    except ValueError:
        splitter = None
    if splitter is None or factors is None:
        print(f"{prime_value}: not constructible")
        return
    m, n = factors
    print(f"{prime_value}: m={m}, n={n} (2^{m}*3^{n}-1)")
    print(render_blueprint(splitter))
    print()


def main(args: Iterable[str]) -> None:
    if args:
        primes = [int(value) for value in args]
    else:
        primes = [7,11, 17, 23, 71]

    print("Legend: S=Splitter, C=Converger, B=Bridge, L=LeftTurn, R=RightTurn")
    print("        ^ v < > are belt directions; .. is empty")
    print()

    for prime_value in primes:
        show_splitter(prime_value)


if __name__ == "__main__":
    main(sys.argv[1:])
