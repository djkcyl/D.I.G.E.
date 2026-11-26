import { useI18n } from "../../i18n";
import { qaLocales } from "../../i18n/qa/locales";
import Button from "../ui/Button";
import ExpandableCard from "../ui/ExpandableCard";
import Modal from "../ui/Modal";
import ModalHeader from "../ui/ModalHeader";

export interface QAModalProps {
  show: boolean;
  onClose: () => void;
  closeOnBackdrop?: boolean;
}

export default function QAModal({
  show,
  onClose,
  closeOnBackdrop = false,
}: QAModalProps) {
  const { t, locale } = useI18n();

  if (!show) return null;

  const localeContent = qaLocales[locale] || qaLocales.en;
  const qaItems =
    (localeContent?.items as { question: string; answer: string }[]) || [];

  return (
    <Modal
      show={show}
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      ariaLabelledby="qa-modal-title"
      title={
        <ModalHeader
          id="qa-modal-title"
          icon="help_center"
          title={t("qa")}
          bordered={false}
        />
      }
      contentClassName="max-w-2xl max-h-[90vh]"
    >
      <div className="min-h-0 text-sm text-endfield-text-light leading-relaxed mb-6 overflow-y-auto scrollbar-gutter-stable flex-1 pr-2 space-y-2">
        {qaItems.map((item, index) => (
          <ExpandableCard
            key={item.question}
            title={item.question}
            defaultOpen={index === 0}
          >
            <p className="text-endfield-text leading-relaxed pl-5">
              {item.answer}
            </p>
          </ExpandableCard>
        ))}
      </div>

      <Button onClick={onClose} variant="primary" fullWidth>
        {t("close")}
      </Button>
    </Modal>
  );
}
