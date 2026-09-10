import type { SolutionResult } from "./calc";

/** 冗余 Waste X 轴 3 档列枚举 */
export type WasteColumnIndex = 0 | 1 | 2;

/** 取货口数 Y 轴 3 档行枚举 (0..2 对应 1..3 路) */
export type BranchRowIndex = 0 | 1 | 2;

export const MATRIX_ROWS = 3;
export const MATRIX_COLS = 3;
/** 决策盘展示上限；求解器内部仍可搜索到 4 路，但 >3 路不入盘 */
export const MATRIX_BRANCH_MAX = 3;

/** 3 行 x 3 列决策矩阵 (null = 无解/废解，渲染红色斜线) */
export type DecisionMatrixGrid = (SolutionResult | null)[][];

/** 当前选中格子坐标 */
export interface MatrixSelection {
  row: BranchRowIndex;
  col: WasteColumnIndex;
}

export const WASTE_COLUMNS = [
  { id: 0, label: "≤100w", subLabel: "十瓦级", max: 100 },
  { id: 1, label: "100-500w", subLabel: "百瓦级", max: 500 },
  { id: 2, label: ">500w", subLabel: "千瓦级", max: Number.POSITIVE_INFINITY },
] as const;

export const SEARCH_MAX_WASTE = 1200;
export const MIN_BATTERY_CUTOFF = 5;

export function getWasteColumnIndex(waste: number): WasteColumnIndex {
  if (waste <= 100) return 0;
  if (waste <= 500) return 1;
  return 2;
}

export interface SudokuDecisionMatrix {
  matrix: DecisionMatrixGrid;
  defaultSelection: MatrixSelection | null;
  /** Flattened non-null cells in Pareto order (for SolutionList charts). */
  solutions: SolutionResult[];
}
