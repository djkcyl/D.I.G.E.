from pydantic import BaseModel, ConfigDict, Field

from .draw import (
    PartFace,
    PartFunction,
    Part,
    Converger,
    Splitter,
    Belt,
    RightTurnBelt,
    BeltBridge,
)


class SplitterPart(BaseModel):
    part_id: str
    model_config = ConfigDict(frozen=True)
    is_complex: bool = False
    """是否为复杂分流器, 如 1/5 分流器"""
    max_input_ips: float = 0.5
    """安全的最大输入速率, 超过可能导致堵塞"""
    input_cycle_count: int = 1
    """输入多少个物品完成一个周期"""
    # 绘图用属性, 为一个二维矩阵，每个元素表示此格内
    # 1. 元件的属性: 元件类型、朝向
    # 2. 在整个分流器内的属性: 输入口、输出口、回收口
    blueprint: list[list[Part | None]] | None = None
    """分流器的蓝图, 用于绘制和路径规划, 不参与计算"""


# 基础分流器
class DoubleSplitter(SplitterPart):
    part_id: str = "double_splitter"
    is_complex: bool = False
    max_input_ips: float = 0.5
    input_cycle_count: int = 2

    blueprint: list[list[Part | None]] = [
        [Belt(face=PartFace.up, function=[PartFunction.recycle])],
        [
            Splitter(
                face=PartFace.right,
                function=[PartFunction.input, PartFunction.output],
            )
        ],
    ]


class TripleSplitter(SplitterPart):
    part_id: str = "triple_splitter"
    is_complex: bool = False
    max_input_ips: float = 0.5
    input_cycle_count: int = 3

    blueprint: list[list[Part | None]] = [
        [Belt(face=PartFace.up, function=[PartFunction.recycle])],
        [
            Splitter(
                face=PartFace.right,
                function=[PartFunction.input, PartFunction.output],
            )
        ],
        [Belt(face=PartFace.down, function=[PartFunction.recycle])],
    ]


# 复杂分流器
class SimplePrimeSplitter(SplitterPart):
    part_id: str = "simple_prime_splitter"
    is_complex: bool = True
    max_input_ips: float = 0.25

    @staticmethod
    def factor_prime(prime_value: int) -> tuple[int, int] | None:
        target = prime_value + 1
        if target <= 1:
            return None
        m = 0
        while target % 2 == 0:
            target //= 2
            m += 1
        n = 0
        while target % 3 == 0:
            target //= 3
            n += 1
        if target != 1:
            return None
        return m, n

    @staticmethod
    def build_blueprint(m: int, n: int) -> list[list[Part | None]]:
        splitter_count = m + n
        width = 1 + splitter_count
        if width <= 1:
            return [[None]]

        # 顶行, 为二分器和三分器的回收口
        top_row: list[Part | None] = [None]
        for _ in range(width - 2):
            top_row.append(Belt(face=PartFace.up, function=[PartFunction.recycle]))
        top_row.append(None)

        # 底行, 为三分器的回收口和回流传送带
        # 第一个为汇入汇流器的转弯传送带
        bottom_row: list[Part | None] = [RightTurnBelt(face=PartFace.left)]
        for index in range(splitter_count):
            # 最后一个为输出口的转弯传送带
            if index == splitter_count - 1:
                bottom_row.append(RightTurnBelt(face=PartFace.down))
            # index < n 的为三分器的回收口, 需要物流桥
            elif index < n:
                bottom_row.append(
                    BeltBridge(face=PartFace.left, function=[PartFunction.recycle])
                )
            # 其他为回流传送带
            else:
                bottom_row.append(Belt(face=PartFace.left))

        middle_row: list[Part | None] = [
            Converger(
                face=PartFace.right,
                function=[PartFunction.input],
            )
        ]
        for index in range(splitter_count):
            functions = None
            if index == splitter_count - 1:
                functions = [PartFunction.output]
            middle_row.append(
                Splitter(
                    face=PartFace.right,
                    function=functions,
                )
            )

        return [top_row, middle_row, bottom_row]

    def __init__(self, prime_value: int) -> None:
        if prime_value < 5:
            raise ValueError(f"prime {prime_value} must be >= 5")
        factors = self.factor_prime(prime_value)
        if factors is None:
            raise ValueError(f"prime {prime_value} is not constructible")
        m, n = factors
        blueprint = self.build_blueprint(m, n)
        super().__init__(
            part_id=f"one_{prime_value}_splitter",
            is_complex=True,
            max_input_ips=0.25,
            input_cycle_count=prime_value,
            blueprint=blueprint,
        )
