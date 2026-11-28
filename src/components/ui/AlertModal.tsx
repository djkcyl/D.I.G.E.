import Button from "./Button";
import Modal from "./Modal";
import ModalHeader from "./ModalHeader";

const TONE_STYLE_MAP: Record<
  string,
  {
    iconClassName: string;
    messageClassName: string;
    contentClassName: string;
    actionVariant: string;
  }
> = {
  danger: {
    iconClassName: "text-red-300",
    messageClassName: "text-red-200",
    contentClassName: "!border-red-900/50 corner-mark",
    actionVariant: "danger",
  },
  warning: {
    iconClassName: "text-red-300",
    messageClassName: "text-red-200",
    contentClassName: "!border-red-900/50 corner-mark",
    actionVariant: "danger",
  },
  neutral: {
    iconClassName: "text-endfield-yellow",
    messageClassName: "text-endfield-text-light",
    contentClassName: "",
    actionVariant: "secondary",
  },
};

export interface AlertModalProps {
  show: boolean;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  titleId?: string;
  title?: React.ReactNode;
  message?: React.ReactNode;
  actionLabel?: React.ReactNode;
  icon?: string;
  tone?: "danger" | "warning" | "neutral";
  contentClassName?: string;
}

export default function AlertModal({
  show,
  onClose,
  closeOnBackdrop = false,
  titleId,
  title,
  message,
  actionLabel,
  icon = "warning",
  tone = "danger",
  contentClassName = "",
}: AlertModalProps) {
  if (!show) return null;

  const toneStyle = TONE_STYLE_MAP[tone] || TONE_STYLE_MAP.danger;

  return (
    <Modal
      show={show}
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      ariaLabelledby={titleId}
      title={
        <ModalHeader
          id={titleId}
          icon={icon}
          iconClassName={toneStyle.iconClassName}
          title={title}
          bordered={false}
        />
      }
      contentClassName={`max-w-lg gap-4 ${toneStyle.contentClassName} ${contentClassName}`.trim()}
    >
      <div className={`text-sm leading-relaxed ${toneStyle.messageClassName}`}>
        {message}
      </div>
      <Button
        variant={toneStyle.actionVariant as "danger" | "secondary"}
        fullWidth
        onClick={onClose}
      >
        {actionLabel}
      </Button>
    </Modal>
  );
}
