/**
 * PoolAdjustTrace —— 诊断弹窗里的「已尝试」列表。
 * 每行一步：冗余上限 · 投料 · 候选数 before→after；
 * 结尾行按 outcome 写「全部无解」或「超时，停在第 N 步」。
 * 只消费 props 注入的 trace，不依赖求解器内部；颜色继承外层弹窗（AlertModal message）。
 */
import { useI18n } from "../i18n";
import { formatPoolAdjustRate, formatPoolAdjustWatt } from "./PoolAdjustNotice";

export type PoolAdjustTraceKind = "wasteRelax" | "down" | "up";

export interface PoolAdjustTraceStep {
  kind: PoolAdjustTraceKind;
  maxWaste: number;
  ratePerMin: number;
  before: number;
  after: number;
}

export type PoolAdjustTraceOutcome = "exhausted" | "timeout";

export interface PoolAdjustTraceProps {
  trace: PoolAdjustTraceStep[];
  /** 结尾行；缺省不写结尾行 */
  outcome?: PoolAdjustTraceOutcome;
  /** outcome=timeout 时停在第几步（从 1 开始）；缺省取 trace.length */
  stoppedAtStep?: number;
  className?: string;
}

const KIND_LABEL_KEY: Record<PoolAdjustTraceKind, string> = {
  wasteRelax: "poolAdjustTraceKindWasteRelax",
  down: "poolAdjustTraceKindDown",
  up: "poolAdjustTraceKindUp",
};

export default function PoolAdjustTrace({
  trace,
  outcome,
  stoppedAtStep,
  className = "",
}: PoolAdjustTraceProps) {
  const { t } = useI18n();

  if (trace.length === 0 && !outcome) return null;

  const outcomeText =
    outcome === "timeout"
      ? t("poolAdjustTraceTimeout", {
          step: Math.max(1, stoppedAtStep ?? trace.length),
        })
      : outcome === "exhausted"
        ? t("poolAdjustTraceExhausted")
        : null;

  return (
    <div className={`space-y-1.5 ${className}`.trim()}>
      <p className="text-xs uppercase tracking-wider opacity-80">
        {t("poolAdjustTraceTitle")}
      </p>
      {trace.length > 0 ? (
        <ol className="list-decimal pl-5 space-y-1 tabular-nums">
          {trace.map((step, index) => (
            <li
              key={`${index}-${step.kind}-${step.maxWaste}-${step.ratePerMin}`}
            >
              <span className="opacity-80">
                [{t(KIND_LABEL_KEY[step.kind])}]
              </span>{" "}
              {t("poolAdjustTraceStep", {
                waste: formatPoolAdjustWatt(step.maxWaste),
                rate: formatPoolAdjustRate(step.ratePerMin),
                before: step.before,
                after: step.after,
              })}
            </li>
          ))}
        </ol>
      ) : null}
      {outcomeText ? <p className="font-bold">{outcomeText}</p> : null}
    </div>
  );
}
