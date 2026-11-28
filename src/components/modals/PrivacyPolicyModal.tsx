import { useI18n } from "../../i18n";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ModalHeader from "../ui/ModalHeader";

export interface PrivacyPolicyModalProps {
  show: boolean;
  onClose: () => void;
  closeOnBackdrop?: boolean;
}

export default function PrivacyPolicyModal({
  show,
  onClose,
  closeOnBackdrop = false,
}: PrivacyPolicyModalProps) {
  const { t } = useI18n();

  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      ariaLabelledby="privacy-policy-modal-title"
      title={
        <ModalHeader
          id="privacy-policy-modal-title"
          icon="policy"
          title={t("privacyPolicyTitle")}
          bordered={false}
        />
      }
      contentClassName="max-w-2xl max-h-[90vh]"
    >
      <div className="min-h-0 text-sm text-endfield-text-light leading-relaxed mb-6 overflow-y-auto scrollbar-gutter-stable flex-1 pr-2">
        <p className="mb-4">{t("privacyNoticeBody")}</p>
        <p>
          {t("privacyThirdPartyLabel")}{" "}
          <a
            href="https://privacy.microsoft.com/privacystatement"
            target="_blank"
            rel="noopener noreferrer"
            className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2"
          >
            {t("microsoftPrivacyStatement")}
          </a>{" "}
          路{" "}
          <a
            href="https://sentry.io/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2"
          >
            {t("sentryPrivacyStatement")}
          </a>
        </p>
      </div>

      <Button onClick={onClose} variant="primary" fullWidth>
        {t("close")}
      </Button>
    </Modal>
  );
}
