from pydantic import BaseModel, ConfigDict
from .items import Fuel,WulingLow

class Config(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    # 可修改的参数
    target_power: int
    """目标功率, 单位瓦特"""
    primary_fuel: type[Fuel] = WulingLow
    """主供燃料类型"""
    secondary_fuel: type[Fuel]|None = None
    """备选燃料类型, 若不指定则不使用备选燃料"""

    min_battery_percent: int = 10
    """最小电池容量百分比, 单位百分比"""
    max_waste: int = 50
    """最大允许浪费功率, 单位瓦特"""
    max_length: int = 15
    """最大方案长度, 超过可能过于复杂"""
    max_branches: int = 3
    """最大分支数量, 过多分支会增加复杂度和成本"""
    allow_parts: list[str] | None = None
    """允许使用的元件列表, None表示不限制"""

    input_rate: float = 0.5
    """输入速率, 仓库为0.5ips, 封装机为0.1ips"""

    # 内部计算参数
    base_power: int = 200
    """基地发电功率, 200w"""
    battery_capacity: int = 100000
    """电池容量, 100,000J"""
