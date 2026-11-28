/**
 * 第 8 步：求解 worker 超时 / 取消保护自测。
 * Prefer: pnpm exec tsx scripts/selftest-solve-timeout.mjs
 *
 * - SOLVE_TIMEOUT_MS = 10s；非法 timeoutMs 回落到默认值
 * - 正常 resolve：不触发 onTimeout，计时器清掉
 * - 超时：先调 onTimeout（App 在这里 terminate worker），再以 SolveTimeoutError 结束；之后的迟到 resolve 被忽略
 * - cancel()：旧 promise 以 SolveCancelledError 结束（被 terminate 的旧 worker 不会让 promise 悬挂）
 * - executor 抛错 / onTimeout 抛错 都能正常 settle
 * - App.tsx 接线：新一轮先 cancel 旧 run；超时分支不清空上一次结果；cancel 分支不动状态
 * - 8 语言 i18n 键 diagSolveTimeout（含 {{seconds}}）与 solveTimeoutTitle
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSolveCancelledError,
  isSolveTimeoutError,
  runWithSolveTimeout,
  SOLVE_TIMEOUT_MS,
  SolveCancelledError,
  SolveTimeoutError,
} from "../src/utils/solveTimeout.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outcome = (p) =>
  p.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );

// ── 1. 常量 ─────────────────────────────────────────────────────
assert.equal(SOLVE_TIMEOUT_MS, 10_000, "solve-timeout: default must be 10s");
console.log("  ✓ SOLVE_TIMEOUT_MS = 10000");

// ── 2. 正常 resolve，不触发超时 ───────────────────────────────────
{
  let timedOut = 0;
  const run = runWithSolveTimeout(
    (resolve) => setTimeout(() => resolve("ok"), 5),
    { timeoutMs: 80, onTimeout: () => timedOut++ },
  );
  assert.equal(run.isSettled(), false, "resolve: not settled before result");
  const r = await outcome(run.promise);
  assert.deepEqual(
    r,
    { ok: true, value: "ok" },
    "resolve: value passes through",
  );
  assert.equal(run.isSettled(), true, "resolve: settled");
  await sleep(120);
  assert.equal(timedOut, 0, "resolve: onTimeout must not fire after resolve");
  run.cancel(); // 已 settle 后 cancel 无效、不抛错
  console.log("  ✓ resolve before timeout");
}

// ── 3. 超时：onTimeout 先于 reject，迟到 resolve 被忽略 ─────────────
{
  const order = [];
  let lateResolve = null;
  const run = runWithSolveTimeout(
    (resolve) => {
      lateResolve = resolve;
    },
    { timeoutMs: 20, onTimeout: () => order.push("terminate") },
  );
  const r = await outcome(run.promise.finally(() => order.push("finally")));
  assert.equal(r.ok, false, "timeout: must reject");
  assert.ok(r.error instanceof SolveTimeoutError, "timeout: SolveTimeoutError");
  assert.ok(isSolveTimeoutError(r.error), "timeout: type guard");
  assert.ok(!isSolveCancelledError(r.error), "timeout: not a cancel");
  assert.equal(r.error.timeoutMs, 20, "timeout: carries timeoutMs");
  assert.deepEqual(
    order,
    ["terminate", "finally"],
    "timeout: terminate then finally",
  );
  assert.equal(run.isSettled(), true, "timeout: settled");
  lateResolve("late"); // 被 terminate 的 worker 不可能再回消息，但即便回了也必须忽略
  await sleep(5);
  console.log("  ✓ timeout → onTimeout → SolveTimeoutError → finally");
}

// ── 4. cancel：旧 promise 一定 settle ─────────────────────────────
{
  let timedOut = 0;
  const run = runWithSolveTimeout(() => {}, {
    timeoutMs: 60,
    onTimeout: () => timedOut++,
  });
  let finallyRan = false;
  const pending = outcome(run.promise.finally(() => (finallyRan = true)));
  run.cancel();
  const r = await pending;
  assert.equal(r.ok, false, "cancel: must reject");
  assert.ok(
    r.error instanceof SolveCancelledError,
    "cancel: SolveCancelledError",
  );
  assert.ok(isSolveCancelledError(r.error), "cancel: type guard");
  assert.ok(!isSolveTimeoutError(r.error), "cancel: not a timeout");
  assert.equal(finallyRan, true, "cancel: finally runs");
  await sleep(100);
  assert.equal(timedOut, 0, "cancel: timer cleared, onTimeout never fires");
  console.log("  ✓ cancel settles the old promise");
}

// ── 5. 异常路径 ─────────────────────────────────────────────────
{
  const boom = new Error("boom");
  const r1 = await outcome(
    runWithSolveTimeout(
      () => {
        throw boom;
      },
      { timeoutMs: 50 },
    ).promise,
  );
  assert.equal(r1.error, boom, "executor throw: rejects with the thrown error");

  const r2 = await outcome(
    runWithSolveTimeout((_, reject) => reject(new Error("worker error")), {
      timeoutMs: 50,
    }).promise,
  );
  assert.equal(r2.error.message, "worker error", "reject: passes through");

  const r3 = await outcome(
    runWithSolveTimeout(() => {}, {
      timeoutMs: 10,
      onTimeout: () => {
        throw new Error("terminate failed");
      },
    }).promise,
  );
  assert.ok(
    isSolveTimeoutError(r3.error),
    "onTimeout throw: still SolveTimeoutError",
  );

  for (const bad of [0, -1, Number.NaN, undefined]) {
    const run = runWithSolveTimeout((resolve) => resolve(1), {
      timeoutMs: bad,
    });
    const r = await outcome(run.promise);
    assert.equal(r.ok, true, `invalid timeoutMs ${bad}: falls back, resolves`);
  }
  console.log(
    "  ✓ executor throw / reject / onTimeout throw / invalid timeoutMs",
  );
}

// ── 6. App.tsx 接线（源码级） ─────────────────────────────────────
{
  const app = fs.readFileSync(path.join(here, "../src/App.tsx"), "utf8");
  const cancelAt = app.indexOf("solveRunRef.current?.cancel()");
  const newWorkerAt = app.indexOf("new Worker(");
  assert.ok(cancelAt > 0, "App: cancels previous run");
  assert.ok(
    cancelAt < newWorkerAt,
    "App: cancel before creating the new worker",
  );
  assert.match(
    app,
    /onTimeout:\s*\(\)\s*=>\s*worker\.terminate\(\)/,
    "App: timeout terminates worker",
  );
  assert.match(
    app,
    /timeoutMs:\s*SOLVE_TIMEOUT_MS/,
    "App: uses SOLVE_TIMEOUT_MS",
  );

  const branch = (guard) => {
    const start = app.indexOf(`if (${guard}(error))`);
    assert.ok(start > 0, `App: has ${guard} branch`);
    const end = app.indexOf("return;", start);
    return app.slice(start, end);
  };
  const timeoutBranch = branch("isSolveTimeoutError");
  assert.ok(
    !/setSolutions|setMatrix|setDefaultSelection/.test(timeoutBranch),
    "App: timeout keeps last valid result",
  );
  assert.match(
    timeoutBranch,
    /setIsLoading\(false\)/,
    "App: timeout clears loading",
  );
  assert.match(timeoutBranch, /solveTimeoutTitle/, "App: timeout title");
  assert.match(timeoutBranch, /diagSolveTimeout/, "App: timeout hint");
  const cancelBranch = branch("isSolveCancelledError");
  assert.ok(
    !/set[A-Z]\w*\(/.test(cancelBranch),
    "App: cancelled run touches no state",
  );
  console.log("  ✓ App wiring");
}

// ── 7. i18n 键 ─────────────────────────────────────────────────
{
  const dir = path.join(here, "../src/i18n");
  for (const loc of ["zh", "en", "de", "fr", "id", "ja", "ko", "ru"]) {
    const dict = JSON.parse(
      fs.readFileSync(path.join(dir, `locales.${loc}.json`), "utf8"),
    );
    assert.equal(
      typeof dict.diagSolveTimeout,
      "string",
      `i18n ${loc}.diagSolveTimeout`,
    );
    assert.ok(
      dict.diagSolveTimeout.includes("{{seconds}}"),
      `i18n ${loc} seconds var`,
    );
    assert.equal(
      typeof dict.solveTimeoutTitle,
      "string",
      `i18n ${loc}.solveTimeoutTitle`,
    );
    assert.ok(dict.solveTimeoutTitle.length > 0, `i18n ${loc} title non-empty`);
  }
  console.log("  ✓ i18n keys");
}

console.log("selftest-solve-timeout: all passed");
