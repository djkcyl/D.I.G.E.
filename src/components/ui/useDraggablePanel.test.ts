/** 悬浮面板的纯边界测试；不引入 DOM 测试依赖。 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampPanelPosition } from "./useDraggablePanel";

const viewport = { width: 390, height: 844 };
const panelWidth = 352;

describe("clampPanelPosition", () => {
  it("视口内的位置保持不变", () => {
    assert.deepEqual(
      clampPanelPosition({ x: 12, y: 120 }, panelWidth, viewport),
      { x: 12, y: 120 },
    );
  });

  it("左侧和顶部越界时保留 8px 边距", () => {
    assert.deepEqual(
      clampPanelPosition({ x: -60, y: -20 }, panelWidth, viewport),
      { x: 8, y: 8 },
    );
  });

  it("右侧和底部越界时保留面板与标题栏可操作区域", () => {
    assert.deepEqual(
      clampPanelPosition({ x: 3000, y: 3000 }, panelWidth, viewport),
      { x: 30, y: 802 },
    );
  });

  it("窄于面板的视口也不会产生负数坐标", () => {
    assert.deepEqual(
      clampPanelPosition({ x: 200, y: 900 }, 380, {
        width: 320,
        height: 480,
      }),
      { x: 8, y: 438 },
    );
  });
});
