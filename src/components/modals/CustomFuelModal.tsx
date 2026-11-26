import { useId, useState } from "react";
import { useI18n } from "../../i18n";
import { PARAM_LIMITS } from "../../utils/constants";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ModalHeader from "../ui/ModalHeader";

export interface CustomFuelModalProps {
  show: boolean;
  onClose: () => void;
  currentValues: { power: number; burnTime: number };
  onConfirm: (power: number, burnTime: number) => void;
}

const INPUT_CLASS =
  "w-full bg-endfield-black/80 border border-endfield-yellow/40 px-3 py-2 text-sm text-endfield-text-light focus:border-endfield-yellow focus:outline-none";

export default function CustomFuelModal({
  show,
  onClose,
  currentValues,
  onConfirm,
}: CustomFuelModalProps) {
  const { t } = useI18n();
  const powerId = useId();
  const burnTimeId = useId();
  const [power, setPower] = useState(currentValues.power);
  const [burnTime, setBurnTime] = useState(currentValues.burnTime);

  if (!show) return null;

  const handleConfirm = () => {
    onConfirm(
      Math.max(1, Math.min(PARAM_LIMITS.MAX_TARGET_POWER, power)),
      Math.max(1, Math.min(PARAM_LIMITS.MAX_BURN_TIME, burnTime)),
    );
    onClose();
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      closeOnBackdrop
      ariaLabelledby="custom-fuel-modal-title"
      contentClassName="!p-4 sm:!p-5 max-w-sm gap-3"
    >
      <ModalHeader
        id="custom-fuel-modal-title"
        icon="tune"
        title={t("customFuelSettings")}
      />

      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={powerId} className="text-sm text-endfield-text/70">
            {t("power")} (w)
          </label>
          <input
            id={powerId}
            type="number"
            min={1}
            max={PARAM_LIMITS.MAX_TARGET_POWER}
            value={power}
            onChange={(e) =>
              setPower(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            className={INPUT_CLASS}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={burnTimeId} className="text-sm text-endfield-text/70">
            {t("burnTime")} (s)
          </label>
          <input
            id={burnTimeId}
            type="number"
            min={1}
            max={PARAM_LIMITS.MAX_BURN_TIME}
            value={burnTime}
            onChange={(e) =>
              setBurnTime(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <Button onClick={handleConfirm} variant="primary" fullWidth>
        {t("confirm")}
      </Button>

      <Button onClick={onClose} variant="secondary" fullWidth>
        {t("close")}
      </Button>
    </Modal>
  );
}
