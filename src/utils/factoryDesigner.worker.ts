import type {
  CalcParams,
  PoolAdjustTraceStep,
  SolutionResult,
} from "../types/calc";
import type { DecisionMatrixGrid, MatrixSelection } from "../types/matrix";
import { FactoryDesigner } from "./FactoryDesigner";
import {
  type PoolAdjustAttempt,
  type PoolAdjustChainResult,
  solveWithPoolAdjustChain,
} from "./poolAdjustChain";
import {
  attachPoolAdjust,
  filterByPoolBattery,
  type PoolPrecheckReport,
} from "./poolBatteryPrecheck";

export type WorkerRequest = {
  type: "solve";
  params: CalcParams;
};

export type PoolAdjustOutcome = "exhausted" | "timeout";

/** 调度链摘要（诊断弹窗用）；没进调整链时 worker 回传 null */
export interface PoolAdjustSummary {
  triggered: true;
  /** 调整链的每一步（不含初次求解） */
  trace: PoolAdjustTraceStep[];
  /** 链走完仍无解 / 共用 deadline 到期；找到解时缺省 */
  outcome?: PoolAdjustOutcome;
  /** outcome=timeout 时停在第几步（trace 内从 1 开始） */
  stoppedAtStep?: number;
  /** 采用那次预检给出的最低富余（W，向上取整）；没有时缺省 */
  requiredSurplusW?: number;
  /** 链内回调抛错（fail-open 退回原结果）时的错误信息 */
  error?: string;
}

export type WorkerResponse =
  | {
      type: "result";
      solutions: SolutionResult[];
      matrix: DecisionMatrixGrid;
      defaultSelection: MatrixSelection | null;
      /** 第 3 步：自定义震荡池蓄电预检结果；null = 未触发或预检出错（fail-open） */
      poolPrecheck?: PoolPrecheckReport | null;
      /** 预检剔光后的调整链摘要；null = 没进调整链 */
      poolAdjust?: PoolAdjustSummary | null;
    }
  | { type: "error"; message: string };

/** 调整链尝试记录 → 诊断弹窗的 trace 行（去掉 initial） */
function toTraceSteps(trace: PoolAdjustAttempt[]): PoolAdjustTraceStep[] {
  const steps: PoolAdjustTraceStep[] = [];
  for (const attempt of trace) {
    if (attempt.kind === "initial") continue;
    steps.push({
      kind: attempt.kind,
      maxWaste: attempt.maxWaste,
      ratePerMin: attempt.ratePerMin,
      before: attempt.candidatesBefore,
      after: attempt.candidatesAfter,
    });
  }
  return steps;
}

function summarizePoolAdjust(
  chain: PoolAdjustChainResult,
): PoolAdjustSummary | null {
  if (!chain.triggered) return null;
  const trace = toTraceSteps(chain.trace);
  const outcome: PoolAdjustOutcome | undefined = chain.timedOut
    ? "timeout"
    : chain.exhausted
      ? "exhausted"
      : undefined;
  const required = Number(chain.report?.requiredWaste);
  const summary: PoolAdjustSummary = { triggered: true, trace };
  if (outcome) summary.outcome = outcome;
  if (outcome === "timeout") summary.stoppedAtStep = Math.max(1, trace.length);
  if (Number.isFinite(required) && required > 0) {
    summary.requiredSurplusW = Math.ceil(required);
  }
  if (chain.error) summary.error = chain.error;
  return summary;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { type, params } = event.data;
  if (type === "solve") {
    try {
      // 初次求解 + 预检；预检把候选剔光时按「放宽冗余上限 → 降投料 → 升投料」重试
      const chain = solveWithPoolAdjustChain(params, {
        solve: (p) => {
          const designer = new FactoryDesigner(p);
          return {
            candidates: designer.solveCandidates(),
            secondaryId: designer.secondaryFuel?.id,
          };
        },
        precheck: (p, candidates) => filterByPoolBattery(p, candidates),
      });
      const poolAdjust = summarizePoolAdjust(chain);
      if (poolAdjust && chain.result.solutions.length > 0) {
        // poolAdjust / wasteRelax 已由调整链挂上，这里补 trace 与富余提示
        attachPoolAdjust(chain.result, {
          poolAdjustTrace: poolAdjust.trace,
          requiredSurplusW: poolAdjust.requiredSurplusW,
        });
      }
      self.postMessage({
        type: "result",
        solutions: chain.result.solutions,
        matrix: chain.result.matrix,
        defaultSelection: chain.result.defaultSelection,
        poolPrecheck: chain.report,
        poolAdjust,
      } satisfies WorkerResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: "error", message } satisfies WorkerResponse);
    }
  }
};
