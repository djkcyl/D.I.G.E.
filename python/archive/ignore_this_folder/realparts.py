from typing import Literal

from pydantic import BaseModel, PrivateAttr

from ..items import Fuel, Item


class Parts(BaseModel):
    # 元件基础属性，只定义连接关系与基础参数，不处理状态
    id: str
    face: Literal["up", "down", "left", "right"]
    ips: float = 0.5
    perv_parts: "Parts" | list["Parts"] | None
    next_parts: "Parts" | list["Parts"] | None
    _recursion_lock: bool = PrivateAttr(default=False)

    def step(self, tick: int) -> None:
        # 基类不处理具体逻辑，留给子类实现
        return

    def can_push(self) -> bool:
        # 抽象方法：主动方是否有物品待发
        raise NotImplementedError

    def try_push(self, target: "Parts" | list["Parts"] | None) -> bool:
        # 抽象方法：主动方尝试将物品推入目标
        raise NotImplementedError

    def can_pull(self) -> bool:
        # 抽象方法：被动方是否能接收物品
        raise NotImplementedError

    def try_pull(self, source: "Parts") -> bool:
        # 抽象方法：主动方尝试从源头拉取物品
        raise NotImplementedError

    def _take_item(self) -> Item | None:
        # 抽象方法：从自身取出一个物品
        raise NotImplementedError


class LogisticsPart(Parts):
    # 物流类元件通用实现，具备单物品缓存与流转逻辑
    max_cache: int = 1
    _cache_item: Item | None = PrivateAttr(default=None)

    def _take_item(self) -> Item | None:
        # 取出缓存中的物品
        if self._cache_item is None:
            return None
        item = self._cache_item
        self._cache_item = None
        return item

    def can_push(self) -> bool:
        # 有缓存即可推送
        return self._cache_item is not None

    def _try_push_no_lock(self, target: "Parts" | list["Parts"] | None) -> bool:
        # 内部推送实现，不触发递归锁
        if not self.can_push() or target is None:
            return False
        if isinstance(target, list):
            for part in target:
                if part.can_pull() and part.try_pull(self):
                    return True
            return False
        if target.can_pull() and target.try_pull(self):
            return True
        return False

    def try_push(self, target: "Parts" | list["Parts"] | None) -> bool:
        # 主动推送物品，触发递归保护
        if self._recursion_lock:
            return False
        self._recursion_lock = True
        try:
            return self._try_push_no_lock(target)
        finally:
            self._recursion_lock = False

    def can_pull(self) -> bool:
        # 若为空直接可拉取；若已满则尝试推送疏通
        if self._recursion_lock:
            return False
        self._recursion_lock = True
        try:
            if self._cache_item is None:
                return True
            return self._try_push_no_lock(self.next_parts)
        finally:
            self._recursion_lock = False

    def try_pull(self, source: "Parts") -> bool:
        # 从源头拉取物品
        if self._recursion_lock:
            return False
        self._recursion_lock = True
        try:
            if not self.can_pull():
                return False
            if not source.can_push():
                return False
            item = source._take_item()
            if item is None:
                return False
            self._cache_item = item
            return True
        finally:
            self._recursion_lock = False

    def step(self, tick: int) -> None:
        # 约定 tick 为当前仿真秒数，物流件仅在 0 和正偶数秒工作
        if int(tick) % 2 != 0:
            return
        if self._cache_item is None:
            return
        if not self.try_push(self.next_parts):
            return
        self._cache_item = None


# === 单块零件 ===
# 二分分流器
class DoubleSplitter(LogisticsPart):
    id: str = "double_splitter"
    perv_parts: "Parts"  # 上游必须有且只能有一个输入
    next_parts: list["Parts"] # 下游必须有且只能有两个输出
    _state_idx: int = PrivateAttr(default=0)

    def try_push(self, target: "Parts" | list["Parts"] | None) -> bool:
        # 二分器按轮询方式分配输出口
        if self._recursion_lock:
            return False
        self._recursion_lock = True
        try:
            if not self.can_push():
                return False
            if not isinstance(self.next_parts, list) or len(self.next_parts) != 2:
                return False
            for _ in range(2):
                index = self._state_idx % 2
                if self.next_parts[index].can_pull() and self.next_parts[
                    index
                ].try_pull(self):
                    self._state_idx = (index + 1) % 2
                    return True
                self._state_idx = (self._state_idx + 1) % 2
            return False
        finally:
            self._recursion_lock = False

    def step(self, tick: int) -> None:
        # 分流器仅在偶数秒尝试按轮询推送
        if int(tick) % 2 != 0:
            return
        if not self.can_push():
            return
        self.try_push(self.next_parts)


# 三分分流器
class TripleSplitter(LogisticsPart):
    id: str = "triple_splitter"
    perv_parts: "Parts"  # 上游必须有且只能有一个输入
    next_parts: list["Parts"]  # 下游必须有且只能有三个输出
    _state_idx: int = PrivateAttr(default=0)

    def try_push(self, target: "Parts" | list["Parts"] | None) -> bool:
        # 三分器按轮询方式分配输出口
        if self._recursion_lock:
            return False
        self._recursion_lock = True
        try:
            if not self.can_push():
                return False
            if not isinstance(self.next_parts, list) or len(self.next_parts) != 3:
                return False
            for _ in range(3):
                index = self._state_idx % 3
                if self.next_parts[index].can_pull() and self.next_parts[
                    index
                ].try_pull(self):
                    self._state_idx = (index + 1) % 3
                    return True
                self._state_idx = (self._state_idx + 1) % 3
            return False
        finally:
            self._recursion_lock = False

    def step(self, tick: int) -> None:
        # 分流器仅在偶数秒尝试按轮询推送
        if int(tick) % 2 != 0:
            return
        if not self.can_push():
            return
        self.try_push(self.next_parts)


# 二分汇流器
class DoubleConverger(LogisticsPart):
    id: str = "double_converger"
    perv_parts: list["Parts"]  # 上游必须有且只能有两个输入
    next_parts: "Parts"  # 下游必须有且只能有一个输出
    _state_idx: int = PrivateAttr(default=0)
    _allow_pull: bool = PrivateAttr(default=False)

    def can_pull(self) -> bool:
        # 禁止传送带类上游通过 Push 强行插入
        if not self._allow_pull and isinstance(self.perv_parts, list):
            if any(isinstance(part, Belt) for part in self.perv_parts):
                return False
        return super().can_pull()

    def try_pull(self, source: "Parts") -> bool:
        # 主动拉取时允许忽略上游类型限制
        self._allow_pull = True
        try:
            return super().try_pull(source)
        finally:
            self._allow_pull = False

    def step(self, tick: int) -> None:
        # 轮询上游，主动拉取物品
        if int(tick) % 2 != 0:
            return
        if self._cache_item is not None:
            return
        if not isinstance(self.perv_parts, list) or len(self.perv_parts) != 2:
            return
        for _ in range(2):
            index = self._state_idx % 2
            source = self.perv_parts[index]
            if source.can_push() and self.try_pull(source):
                self._state_idx = (index + 1) % 2
                return
            self._state_idx = (self._state_idx + 1) % 2


# 三分汇流器
class TripleConverger(LogisticsPart):
    id: str = "triple_converger"
    perv_parts: list["Parts"]  # 上游必须有且只能有三个输入
    next_parts: "Parts"  # 下游必须有且只能有一个输出
    _state_idx: int = PrivateAttr(default=0)
    _allow_pull: bool = PrivateAttr(default=False)

    def can_pull(self) -> bool:
        # 禁止传送带类上游通过 Push 强行插入
        if not self._allow_pull and isinstance(self.perv_parts, list):
            if any(isinstance(part, Belt) for part in self.perv_parts):
                return False
        return super().can_pull()

    def try_pull(self, source: "Parts") -> bool:
        # 主动拉取时允许忽略上游类型限制
        self._allow_pull = True
        try:
            return super().try_pull(source)
        finally:
            self._allow_pull = False

    def step(self, tick: int) -> None:
        # 轮询上游，主动拉取物品
        if int(tick) % 2 != 0:
            return
        if self._cache_item is not None:
            return
        if not isinstance(self.perv_parts, list) or len(self.perv_parts) != 3:
            return
        for _ in range(3):
            index = self._state_idx % 3
            source = self.perv_parts[index]
            if source.can_push() and self.try_pull(source):
                self._state_idx = (index + 1) % 3
                return
            self._state_idx = (self._state_idx + 1) % 3


# 直线传送带
class Belt(LogisticsPart):
    id: str = "belt"
    perv_parts: "Parts"  # 上游必须有且只能有一个输入
    next_parts: "Parts"  # 下游必须有且只能有一个输出


# 左转传送带
class LeftTurnBelt(Belt):
    id: str = "left_turn_belt"


# 右转传送带
class RightTurnBelt(Belt):
    id: str = "right_turn_belt"


# 输入源
class InputSource(LogisticsPart):
    id: str = "input_source"
    perv_parts: None = None  # 输入源没有上游输入
    next_parts: "Parts"  # 下游必须有且只能有一个输出

    output_item: Item | None = PrivateAttr(default=None)

    def set_output_item(self, item: Item) -> None:
        # 设置输入源持续输出的物品类型
        self.output_item = item

    def step(self, tick: int) -> None:
        # 约定 tick 为当前仿真秒数，输入源每 2 秒生成 1 个物品
        if self.output_item is None:
            return
        if int(tick) % 2 != 0:
            return
        if self._cache_item is None:
            self._cache_item = self.output_item
        if not self.try_push(self.next_parts):
            return
        self._cache_item = None


# 输出源
class OutputSource(LogisticsPart):
    id: str = "output_source"
    perv_parts: "Parts"  # 上游必须有且只能有一个输入
    next_parts: None = None  # 输出源没有下游输出

    def can_pull(self) -> bool:
        # 输出源永远可拉取
        return True

    def try_pull(self, source: "Parts") -> bool:
        # 主动从源头拉取并销毁物品
        if self._recursion_lock:
            return False
        self._recursion_lock = True
        try:
            if not source.can_push():
                return False
            item = source._take_item()
            if item is None:
                return False
            return True
        finally:
            self._recursion_lock = False

    def step(self, tick: int) -> None:
        # 输出源无处理流程
        return


# 发电机
class Generator(Parts):
    id: str = "generator"
    perv_parts: "Parts"  # 上游必须有且只能有一个输入
    next_parts: None = None  # 发电机没有下游输出
    max_cache: int = 50
    generated_energy_j: float = 0.0
    _process_time_left: int = PrivateAttr(default=0)
    _cached_fuel: Fuel | None = PrivateAttr(default=None)
    _cached_count: int = PrivateAttr(default=0)
    _current_fuel: Fuel | None = PrivateAttr(default=None)
    _current_power_w: float = PrivateAttr(default=0.0)

    def _take_item(self) -> Item | None:
        # 发电机自身不会被其他元件拉取
        return None

    def can_push(self) -> bool:
        # 发电机没有输出口
        return False

    def try_push(self, target: "Parts" | list["Parts"] | None) -> bool:
        # 发电机没有输出口
        return False

    def can_pull(self) -> bool:
        # 缓存未满即可接收，满则尝试疏通（无下游时直接失败）
        if self._recursion_lock:
            return False
        self._recursion_lock = True
        try:
            if self._cached_count < self.max_cache:
                return True
            return self.try_push(self.next_parts)
        finally:
            self._recursion_lock = False

    def try_pull(self, source: "Parts") -> bool:
        # 主动拉取燃料并写入缓存
        if self._recursion_lock:
            return False
        self._recursion_lock = True
        try:
            if not self.can_pull():
                return False
            if not source.can_push():
                return False
            item = source._take_item()
            if item is None or not isinstance(item, Fuel):
                return False
            if self._cached_fuel is None:
                self._cached_fuel = item
            elif item.id != self._cached_fuel.id:
                return False
            self._cached_count += 1
            return True
        finally:
            self._recursion_lock = False

    def _pop_cache(self) -> Fuel | None:
        # 从缓存中取出一个燃料用于燃烧
        if self._cached_count <= 0 or self._cached_fuel is None:
            return None
        self._cached_count -= 1
        fuel = self._cached_fuel
        if self._cached_count == 0:
            self._cached_fuel = None
        return fuel

    def _start_processing(self) -> None:
        # 取出燃料并使用其燃烧时间与功率
        if self._process_time_left > 0:
            return
        fuel = self._pop_cache()
        if fuel is None:
            return
        self._current_fuel = fuel
        self._current_power_w = fuel.power
        self._process_time_left = int(fuel.burn_time)

    def process(self, tick: int) -> None:
        # 发电机在燃烧期间持续输出功率并累计能量
        self._start_processing()
        if self._process_time_left <= 0:
            return
        elapsed = min(tick, self._process_time_left)
        self.generated_energy_j += self._current_power_w * elapsed
        self._process_time_left = max(0, self._process_time_left - tick)
        if self._process_time_left == 0:
            self._current_fuel = None
            self._current_power_w = 0.0

    def step(self, tick: int) -> None:
        # 单次仿真步进：仅处理燃烧，不做物流输出
        self.process(tick)


# === 组合零件 ===
# 待续
