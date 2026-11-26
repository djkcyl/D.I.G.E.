import { useI18n } from "../i18n";
import CloseButton from "./ui/CloseButton";

export interface FooterProps {
  show: boolean;
  onDismiss: () => void;
  onOpenPrivacyPolicy: () => void;
}

export default function Footer({
  show,
  onDismiss,
  onOpenPrivacyPolicy,
}: FooterProps) {
  const { t } = useI18n();

  if (!show) return null;

  return (
    <footer className="shrink-0 relative border-t border-endfield-gray-light bg-endfield-dark px-3 py-2 text-[11px] sm:text-xs text-endfield-text leading-relaxed">
      <div className="pr-8 text-center">
        {t("privacyFooterNotice")}{" "}
        <button
          type="button"
          onClick={onOpenPrivacyPolicy}
          className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2 cursor-pointer"
        >
          {t("privacyPolicyDetails")}
        </button>{" "}
        |{" "}
        <a
          href="https://privacy.microsoft.com/privacystatement"
          target="_blank"
          rel="noopener noreferrer"
          className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2"
        >
          {t("microsoftPrivacyStatement")}
        </a>{" "}
        |{" "}
        <a
          href="https://sentry.io/privacy/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2"
        >
          {t("sentryPrivacyStatement")}
        </a>
      </div>

      <CloseButton
        onClick={onDismiss}
        label={t("close")}
        sizeClass="w-5 h-5"
        className="absolute right-3 top-1/2 -translate-y-1/2"
      />
    </footer>
  );
}
