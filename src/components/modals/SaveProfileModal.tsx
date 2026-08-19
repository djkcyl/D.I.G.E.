import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import type { ProfileModalMode } from "../../types/profile";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ModalHeader from "../ui/ModalHeader";

export interface SaveProfileModalProps {
  show: boolean;
  mode: ProfileModalMode;
  initialName: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

const INPUT_CLASS =
  "w-full bg-endfield-black/80 border border-endfield-yellow/40 px-3 py-2 text-sm text-endfield-text-light focus:border-endfield-yellow focus:outline-none";

export default function SaveProfileModal({
  show,
  mode,
  initialName,
  onClose,
  onConfirm,
}: SaveProfileModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (show) setName(initialName);
  }, [show, initialName]);

  if (!show) return null;

  const title =
    mode === "rename" ? t("profileRenameTitle") : t("profileSaveAsTitle");
  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(trimmed.slice(0, 32));
    onClose();
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      closeOnBackdrop
      ariaLabelledby="save-profile-modal-title"
      contentClassName="!p-4 sm:!p-5 max-w-sm gap-3"
    >
      <ModalHeader
        id="save-profile-modal-title"
        icon="folder_special"
        title={title}
      />

      <div className="space-y-1">
        <label
          htmlFor="profile-name-input"
          className="text-sm text-endfield-text/70"
        >
          {t("profileNameLabel")}
        </label>
        <input
          id="profile-name-input"
          type="text"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleConfirm();
            }
          }}
          placeholder={t("profileNamePlaceholder")}
          className={INPUT_CLASS}
          autoFocus
        />
      </div>

      <Button
        onClick={handleConfirm}
        variant="primary"
        fullWidth
        disabled={!canSubmit}
      >
        {t("confirm")}
      </Button>

      <Button onClick={onClose} variant="secondary" fullWidth>
        {t("close")}
      </Button>
    </Modal>
  );
}
