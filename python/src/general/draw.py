from enum import StrEnum

from pydantic import BaseModel


class PartFunction(StrEnum):
    """元件在整体中的功能类型"""

    input = "INPUT"
    output = "OUTPUT"
    recycle = "RECYCLE"


class PartFace(StrEnum):
    """元件的朝向"""

    up = "UP"
    down = "DOWN"
    left = "LEFT"
    right = "RIGHT"


class Part(BaseModel):
    part_id: str
    face: PartFace
    function: PartFunction | None = None


class Splitter(Part):
    part_id: str = "splitter"


class Converger(Part):
    part_id: str = "converger"


class Belt(Part):
    part_id: str = "belt"


class LeftTurnBelt(Part):
    part_id: str = "left_turn_belt"


class RightTurnBelt(Part):
    part_id: str = "right_turn_belt"


class BeltBridge(Part):
    part_id: str = "belt_bridge"


class RecycleSource(Part):
    part_id: str = "recycle_source"
    function: PartFunction = PartFunction.recycle


class InputSource(Part):
    part_id: str = "input_source"
    function: PartFunction = PartFunction.input


class ThermalBank(Part):
    part_id: str = "thermal_bank"
    function: PartFunction = PartFunction.output
