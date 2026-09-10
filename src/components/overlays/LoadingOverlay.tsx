import { useI18n } from "../../i18n";
import Icon from "../ui/Icon";

export interface LoadingOverlayProps {
  isLoading: boolean;
}

export default function LoadingOverlay({ isLoading }: LoadingOverlayProps) {
  const { t } = useI18n();

  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 bg-[var(--ef-scrim)] backdrop-blur z-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Icon name="settings" className="text-endfield-yellow animate-spin" />
        <span className="text-endfield-yellow tracking-[0.3em] text-sm uppercase">
          {t("calculating")}
        </span>
      </div>
    </div>
  );
}
