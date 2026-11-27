import type { CalcParams, SolutionResult } from "../types/calc";
import type { DecisionMatrixGrid, MatrixSelection } from "../types/matrix";
import { FactoryDesigner } from "./FactoryDesigner";
import {
  type PoolPrecheckReport,
  solveWithPoolPrecheck,
} from "./poolBatteryPrecheck";

export type WorkerRequest = {
  type: "solve";
  params: CalcParams;
};

export type WorkerResponse =
  | {
      type: "result";
      solutions: SolutionResult[];
      matrix: DecisionMatrixGrid;
      defaultSelection: MatrixSelection | null;
      /** 第 3 步：自定义震荡池蓄电预检结果；null = 未触发或预检出错（fail-open） */
      poolPrecheck?: PoolPrecheckReport | null;
    }
  | { type: "error"; message: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { type, params } = event.data;
  if (type === "solve") {
    try {
      const designer = new FactoryDesigner(params);
      const candidates = designer.solveCandidates();
      const { result, report } = solveWithPoolPrecheck(
        params,
        candidates,
        designer.secondaryFuel?.id,
      );
      self.postMessage({
        type: "result",
        solutions: result.solutions,
        matrix: result.matrix,
        defaultSelection: result.defaultSelection,
        poolPrecheck: report,
      } satisfies WorkerResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: "error", message } satisfies WorkerResponse);
    }
  }
};
