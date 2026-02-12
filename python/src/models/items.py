from pydantic import BaseModel, ConfigDict


class Item(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str


class Fuel(Item):
    power: float
    burn_time: float
    burn_time: float


class Ore(Fuel):
    id: str = "ore"
    power: float = 50
    burn_time: float = 8


class ValleyLow(Fuel):
    id: str = "valleyLow"
    power: float = 220
    burn_time: float = 40


class ValleyMid(Fuel):
    id: str = "valleyMid"
    power: float = 420
    burn_time: float = 40


class ValleyHigh(Fuel):
    id: str = "valleyHigh"
    power: float = 1100
    burn_time: float = 40


class WulingLow(Fuel):
    id: str = "wulingLow"
    power: float = 1600
    burn_time: float = 40
