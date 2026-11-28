import { useI18n } from "../../i18n";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export interface DirtyOverlayProps {
  show: boolean;
  canRestore: boolean;
  onCalculate: () => void;
  onRestore: () => void;
  onDismiss: () => void;
}

export default function DirtyOverlay({
  show,
  canRestore,
  onCalculate,
  onRestore,
  onDismiss,
}: DirtyOverlayProps) {
  const { t } = useI18n();

  if (!show) return null;

  return (
    <div className="absolute inset-0 z-40 bg-[var(--ef-scrim)] backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <Icon name="sync_problem" className="text-endfield-yellow" />
      <p className="text-lg font-bold text-endfield-text-light tracking-wider">
        {t("paramsChanged")}
      </p>
      <p className="text-sm text-endfield-text">
        {t("clickCalculateToUpdate")}
      </p>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 w-72 sm:w-md">
        <Button
          onClick={onCalculate}
          variant="primary"
          className="hover:-translate-y-0.5 uppercase glow-yellow"
        >
          <span className="inline-flex items-center gap-2">
            <Icon name="calculate" />
            {t("calculate")}
          </span>
        </Button>
        {canRestore && (
          <Button
            onClick={onRestore}
            variant="none"
            className="border border-endfield-yellow/40 text-endfield-yellow hover:bg-endfield-yellow/10 hover:-translate-y-0.5 uppercase"
          >
            <span className="inline-flex items-center gap-2">
              <Icon name="undo" />
              {t("restoreParams")}
            </span>
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-endfield-text hover:text-endfield-text-light transition-colors tracking-wider"
      >
        {t("ignoreWarning")}
      </button>
    </div>
  );
}
