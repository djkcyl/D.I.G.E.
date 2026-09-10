import type { SolutionResult } from "../types/calc";
import type {
  BranchRowIndex,
  DecisionMatrixGrid,
  MatrixSelection,
  SudokuDecisionMatrix,
  WasteColumnIndex,
} from "../types/matrix";
import {
  getWasteColumnIndex,
  MATRIX_BRANCH_MAX,
  MATRIX_COLS,
  MATRIX_ROWS,
} from "../types/matrix";

const WASTE_TOLERANCE = 5;

/**
 * Five-level Pareto: waste (5W tol) → splitters → branchCount →
 * secondary osc rate → variance. Matches FactoryDesigner.solve historical order.
 */
export function compareSolutions(
  a: SolutionResult,
  b: SolutionResult,
  secondaryId?: string | null
): number {
  const wasteDiff = a.waste - b.waste;
  if (Math.abs(wasteDiff) > WASTE_TOLERANCE) return wasteDiff;
  if (a.totalSplitters !== b.totalSplitters) {
    return a.totalSplitters - b.totalSplitters;
  }
  if (a.branchCount !== b.branchCount) {
    return a.branchCount - b.branchCount;
  }
  if (secondaryId && secondaryId !== "none") {
    const aSubRate =
      a.fuelBOM?.find((f) => f.fuelId === secondaryId)?.oscRatePerMin ?? 0;
    const bSubRate =
      b.fuelBOM?.find((f) => f.fuelId === secondaryId)?.oscRatePerMin ?? 0;
    if (Math.abs(aSubRate - bSubRate) > 1e-4) {
      return aSubRate - bSubRate;
    }
  }
  return a.variance - b.variance;
}

/** 右下角 (3路 × 千瓦级) 物理无意义，固定废解 */
function isDeadCorner(row: BranchRowIndex, col: WasteColumnIndex): boolean {
  return row === MATRIX_ROWS - 1 && col === MATRIX_COLS - 1;
}
function isPureBase(sol: SolutionResult): boolean {
  return (
    sol.branchCount === 0 || !sol.oscillating || sol.oscillating.length === 0
  );
}

/** 0-branch / empty oscillating maps to row0 (1-port). Never drop branchCount < 1. */
function toRowIndex(branchCount: number): BranchRowIndex | null {
  if (branchCount < 0 || branchCount > MATRIX_BRANCH_MAX) return null;
  return (Math.max(1, branchCount) - 1) as BranchRowIndex;
}

export function buildSudokuDecisionMatrix(
  solutions: SolutionResult[],
  secondaryId?: string | null
): SudokuDecisionMatrix {
  const matrix: DecisionMatrixGrid = Array.from({ length: MATRIX_ROWS }, () =>
    Array(MATRIX_COLS).fill(null)
  ) as DecisionMatrixGrid;

  const sorted = [...solutions].sort((a, b) =>
    compareSolutions(a, b, secondaryId)
  );

  for (const sol of sorted) {
    const row = toRowIndex(sol.branchCount);
    if (row === null) continue;
    const col = getWasteColumnIndex(sol.waste);

    if (isDeadCorner(row, col)) continue;

    if (!matrix[row][col]) {
      matrix[row][col] = sol;
    }
  }

  // (0,2) 右上角：纯常驻硬顶特权。只要存在 0 路/无震荡候选，即覆盖该千瓦格，
  // 即使浪费大于同格 1 路震荡混编（7665W: 9800/+2135 覆盖 8200/+535）。
  const KW_COL = (MATRIX_COLS - 1) as WasteColumnIndex;
  const PORT1_ROW = 0 as BranchRowIndex;
  if (!isDeadCorner(PORT1_ROW, KW_COL)) {
    const privileged = sorted.find(
      (sol) => isPureBase(sol) && getWasteColumnIndex(sol.waste) === KW_COL
    );
    if (privileged) {
      matrix[PORT1_ROW][KW_COL] = privileged;
    }
  }

  let defaultSelection: MatrixSelection | null = null;
  for (const topSol of sorted) {
    const topRow = toRowIndex(topSol.branchCount);
    if (topRow === null) continue;
    const topCol = getWasteColumnIndex(topSol.waste);
    if (isDeadCorner(topRow, topCol)) continue;
    if (matrix[topRow][topCol]) {
      defaultSelection = { row: topRow, col: topCol };
      break;
    }
  }

  const flattened: SolutionResult[] = [];
  const seen = new Set<SolutionResult>();
  for (let r = 0; r < MATRIX_ROWS; r += 1) {
    for (let c = 0; c < MATRIX_COLS; c += 1) {
      const cell = matrix[r][c];
      if (cell && !seen.has(cell)) {
        seen.add(cell);
        flattened.push(cell);
      }
    }
  }
  flattened.sort((a, b) => compareSolutions(a, b, secondaryId));

  return {
    matrix,
    defaultSelection,
    solutions: flattened,
  };
}

export function findSelectionForSolution(
  matrix: DecisionMatrixGrid,
  solution: SolutionResult | undefined
): MatrixSelection | null {
  if (!solution) return null;
  for (let r = 0; r < MATRIX_ROWS; r += 1) {
    for (let c = 0; c < MATRIX_COLS; c += 1) {
      if (matrix[r][c] === solution) {
        return { row: r as BranchRowIndex, col: c as WasteColumnIndex };
      }
    }
  }
  return null;
}
