import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import {
  parseImportInput,
  suggestImportProfileBaseName,
  suggestImportProfileBaseNameZh,
  type ImportParseResult,
} from "../../utils/gridCode";
import type { ShareParams } from "../../utils/shareParams";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ModalHeader from "../ui/ModalHeader";

export interface ImportProfileModalProps {
  show: boolean;
  onClose: () => void;
  /** 确认导入：名称 + 解析后的分享参数 + 是否前缀不一致 */
  onConfirm: (payload: {
    name: string;
    params: ShareParams;
    prefixMismatch: boolean;
    actualPower?: number;
  }) => void;
}

const INPUT_CLASS =
  "w-full bg-endfield-black/80 border border-endfield-yellow/40 px-3 py-2 text-sm text-endfield-text-light focus:border-endfield-yellow focus:outline-none";

const TEXTAREA_CLASS =
  "w-full min-h-[6.5rem] bg-endfield-black/80 border border-endfield-yellow/40 px-3 py-2 text-[11px] sm:text-sm text-endfield-yellow/90 font-mono leading-snug focus:border-endfield-yellow focus:outline-none resize-y";

export default function ImportProfileModal({
  show,
  onClose,
  onConfirm,
}: ImportProfileModalProps) {
  const { t, locale } = useI18n();
  const [raw, setRaw] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);

  useEffect(() => {
    if (!show) return;
    setRaw("");
    setName("");
    setError("");
    setParsed(null);
  }, [show]);

  const preview = useMemo(() => {
    if (!raw.trim()) return null;
    return parseImportInput(raw);
  }, [raw]);

  useEffect(() => {
    setParsed(preview);
    if (!preview) {
      if (raw.trim()) setError(t("importCodeInvalid"));
      else setError("");
      return;
    }
    setError("");
    const base =
      locale === "zh"
        ? suggestImportProfileBaseNameZh(preview.params)
        : suggestImportProfileBaseName(preview.params);
    const suffix = t("importProfileNameSuffix");
    setName(`${base}${suffix ? ` ${suffix}` : ""}`.slice(0, 32));
  }, [preview, locale, t, raw]);

  if (!show) return null;

  const trimmedName = name.trim();
  const canSubmit = Boolean(parsed && trimmedName.length > 0);

  const handleConfirm = () => {
    if (!parsed || !trimmedName) return;
    onConfirm({
      name: trimmedName.slice(0, 32),
      params: parsed.params,
      prefixMismatch: parsed.prefixMismatch,
      actualPower:
        parsed.kind === "grid" ? parsed.actualPower : parsed.params.targetPower,
    });
    onClose();
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      closeOnBackdrop
      ariaLabelledby="import-profile-modal-title"
      contentClassName="!p-4 sm:!p-5 max-w-lg gap-3"
    >
      <ModalHeader
        id="import-profile-modal-title"
        icon="download"
        title={t("importCodeTitle")}
      />

      <div className="space-y-1">
        <label
          htmlFor="import-code-input"
          className="text-sm text-endfield-text/70"
        >
          {t("importCodeLabel")}
        </label>
        <textarea
          id="import-code-input"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={t("importCodePlaceholder")}
          className={TEXTAREA_CLASS}
          spellCheck={false}
          autoFocus
        />
        {error ? (
          <p className="text-xs text-red-300/90">{error}</p>
        ) : parsed ? (
          <p className="text-xs text-endfield-text/60">
            {parsed.kind === "grid"
              ? t("importCodeKindGrid")
              : parsed.kind === "url"
                ? t("importCodeKindUrl")
                : t("importCodeKindToken")}
            {parsed.prefixMismatch ? (
              <span className="block text-endfield-yellow mt-1">
                {t("importCodePrefixMismatch").replace(
                  "{power}",
                  String(
                    parsed.kind === "grid" && parsed.actualPower != null
                      ? Math.round(parsed.actualPower)
                      : parsed.params.targetPower ?? "—"
                  )
                )}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label
          htmlFor="import-profile-name"
          className="text-sm text-endfield-text/70"
        >
          {t("profileNameLabel")}
        </label>
        <input
          id="import-profile-name"
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
        />
      </div>

      <Button
        onClick={handleConfirm}
        variant="primary"
        fullWidth
        disabled={!canSubmit}
      >
        {t("importCodeConfirm")}
      </Button>

      <Button onClick={onClose} variant="secondary" fullWidth>
        {t("close")}
      </Button>
    </Modal>
  );
}
