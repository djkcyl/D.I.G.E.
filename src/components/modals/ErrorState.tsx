import { useI18n } from "../../i18n";
import type { DiagnosisResult } from "../../utils/failureDiagnose";
import AlertModal from "../ui/AlertModal";

export interface ErrorStateProps {
  show: boolean;
  onDismiss: () => void;
  closeOnBackdrop?: boolean;
  diagnosis?: DiagnosisResult | null;
}

export default function ErrorState({
  show,
  onDismiss,
  closeOnBackdrop = false,
  diagnosis = null,
}: ErrorStateProps) {
  const { t } = useI18n();

  const message = diagnosis ? (
    <div className="space-y-3">
      <p>{diagnosis.primaryHint}</p>
      {diagnosis.secondaryHints.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wider opacity-80">
            {t("diagSuggestionsHeader")}
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {diagnosis.secondaryHints.map((hint, i) => (
              <li key={i}>{hint}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
      title={t("noSolutionFound")}
      message={message}
      actionLabel={t("dismiss")}
    />
  );
}
