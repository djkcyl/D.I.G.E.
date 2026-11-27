import { useI18n } from "../../i18n";
import type { PoolAdjustSummary } from "../../utils/factoryDesigner.worker";
import type { DiagnosisResult } from "../../utils/failureDiagnose";
import PoolAdjustTrace from "../PoolAdjustTrace";
import AlertModal from "../ui/AlertModal";

export interface ErrorStateProps {
  show: boolean;
  onDismiss: () => void;
  closeOnBackdrop?: boolean;
  diagnosis?: DiagnosisResult | null;
  /** 调整链摘要；有 trace 或 outcome 时在弹窗里列出「已尝试」 */
  poolAdjust?: PoolAdjustSummary | null;
}

export default function ErrorState({
  show,
  onDismiss,
  closeOnBackdrop = false,
  diagnosis = null,
  poolAdjust = null,
}: ErrorStateProps) {
  const { t } = useI18n();

  const trace =
    poolAdjust && (poolAdjust.trace.length > 0 || poolAdjust.outcome) ? (
      <PoolAdjustTrace
        trace={poolAdjust.trace}
        outcome={poolAdjust.outcome}
        stoppedAtStep={poolAdjust.stoppedAtStep}
      />
    ) : null;

  const message = diagnosis ? (
    <div className="space-y-3">
      <p>{diagnosis.primaryHint}</p>
      {diagnosis.secondaryHints.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider opacity-80">
            {t("diagSuggestionsHeader")}
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {diagnosis.secondaryHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {trace}
    </div>
  ) : trace ? (
    <div className="space-y-3">
      <p>{t("errorSuggestion")}</p>
      {trace}
    </div>
  ) : (
    t("errorSuggestion")
  );

  return (
    <AlertModal
      show={show}
      onClose={onDismiss}
      closeOnBackdrop={closeOnBackdrop}
      titleId="error-state-title"
      icon="error"
      tone="danger"
      title={diagnosis?.title ?? t("noSolutionFound")}
      message={message}
      actionLabel={t("dismiss")}
    />
  );
}
