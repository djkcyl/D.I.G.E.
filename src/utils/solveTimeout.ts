/**
 * 第 8 步：求解 worker 超时 / 取消保护（纯逻辑，不依赖 DOM，便于自测）。
 *
 * - 到达 timeoutMs：先调 onTimeout（App 在这里 terminate worker），再以 SolveTimeoutError 结束；
 * - cancel()：新一轮计算开始时调用，旧 promise 以 SolveCancelledError 结束，
 *   保证被 terminate 的旧 worker 对应的 promise 一定会 settle，不会悬挂；
 * - 正常 resolve / reject 后清掉计时器，之后的超时 / 取消 / 重复 settle 全部忽略。
 */
export const SOLVE_TIMEOUT_MS = 10_000;

export class SolveTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Solve timed out after ${timeoutMs}ms`);
    this.name = "SolveTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class SolveCancelledError extends Error {
  constructor() {
    super("Solve cancelled by a newer run");
    this.name = "SolveCancelledError";
  }
}

export function isSolveTimeoutError(
  error: unknown,
): error is SolveTimeoutError {
  return error instanceof SolveTimeoutError;
}

export function isSolveCancelledError(
  error: unknown,
): error is SolveCancelledError {
  return error instanceof SolveCancelledError;
}

export interface SolveRun<T> {
  promise: Promise<T>;
  /** 取消本轮：以 SolveCancelledError 结束（已 settle 时无效） */
  cancel: () => void;
  /** 是否已 settle（resolve / reject / 超时 / 取消任一） */
  isSettled: () => boolean;
}

export interface SolveRunOptions {
  timeoutMs?: number;
  /** 超时时、promise 结束前调用；抛错不影响 promise 以 SolveTimeoutError 结束 */
  onTimeout?: () => void;
}

export function runWithSolveTimeout<T>(
  executor: (
    resolve: (value: T) => void,
    reject: (error: unknown) => void,
  ) => void,
  options: SolveRunOptions = {},
): SolveRun<T> {
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
      ? (options.timeoutMs as number)
      : SOLVE_TIMEOUT_MS;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let outerResolve: (value: T) => void = () => {};
  let outerReject: (error: unknown) => void = () => {};

  const finish = () => {
    settled = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const promise = new Promise<T>((resolve, reject) => {
    outerResolve = resolve;
    outerReject = reject;
  });

  timer = setTimeout(() => {
    if (settled) return;
    finish();
    try {
      options.onTimeout?.();
    } catch {
      // onTimeout 出错不影响超时结论
    }
    outerReject(new SolveTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    executor(
      (value) => {
        if (settled) return;
        finish();
        outerResolve(value);
      },
      (error) => {
        if (settled) return;
        finish();
        outerReject(error);
      },
    );
  } catch (error) {
    if (!settled) {
      finish();
      outerReject(error);
    }
  }

  return {
    promise,
    cancel: () => {
      if (settled) return;
      finish();
      outerReject(new SolveCancelledError());
    },
    isSettled: () => settled,
  };
}
