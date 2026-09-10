import type { CalcParams, SolutionResult } from "../types/calc";
import type { DecisionMatrixGrid, MatrixSelection } from "../types/matrix";
import { FactoryDesigner } from "./FactoryDesigner";

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
    }
  | { type: "error"; message: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { type, params } = event.data;
  if (type === "solve") {
    try {
      const designer = new FactoryDesigner(params);
      const result = designer.solve();
      self.postMessage({
        type: "result",
        solutions: result.solutions,
        matrix: result.matrix,
        defaultSelection: result.defaultSelection,
      } satisfies WorkerResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: "error", message } satisfies WorkerResponse);
    }
  }
};
