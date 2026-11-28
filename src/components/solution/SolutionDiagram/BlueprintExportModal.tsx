import type { OscillatingBranch } from "../../../types/calc";
import Button from "../../ui/Button";
import Icon from "../../ui/Icon";
import Modal from "../../ui/Modal";
import ModalHeader from "../../ui/ModalHeader";

function BranchExportRow({
  t,
  branch,
  index,
  onExportJson,
  onExportPng,
}: {
  t: (key: string) => string;
  branch: OscillatingBranch;
  index: number;
  onExportJson: (index: number) => void;
  onExportPng: (index: number) => Promise<void>;
}) {
  return (
    <div className="w-full border border-endfield-gray-light bg-endfield-gray/40 px-3 py-2 flex items-center gap-2 transition-colors hover:border-endfield-yellow/70 hover:bg-endfield-gray/70">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-endfield-text-light">
          {t("branch")} {index + 1}
        </div>
        <div className="text-xs text-endfield-text/80">
          1/{branch.denominator} | {branch.power.toFixed(0)}w
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onExportJson(index)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-endfield-gray-light text-endfield-text-light bg-endfield-gray/80 hover:text-endfield-yellow hover:border-endfield-yellow transition-colors"
          title={t("formatJson")}
          aria-label={t("formatJson")}
        >
          <Icon name="download" className="w-4 h-4" />
          {t("formatJson")}
        </button>
        <button
          type="button"
          onClick={() => void onExportPng(index)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-endfield-gray-light text-endfield-text-light bg-endfield-gray/80 hover:text-endfield-yellow hover:border-endfield-yellow transition-colors"
          title={t("formatPng")}
          aria-label={t("formatPng")}
        >
          <Icon name="image" className="w-4 h-4" />
          {t("formatPng")}
        </button>
      </div>
    </div>
  );
}

export interface BlueprintExportModalProps {
  show: boolean;
  t: (key: string) => string;
  branches: OscillatingBranch[];
  onClose: () => void;
  onExportJson: (index: number) => void;
  onExportPng: (index: number) => Promise<void>;
  onExportAllZip: () => Promise<void>;
  onExportCompleteImage: () => Promise<void>;
  preparingCompleteImage: boolean;
}

export default function BlueprintExportModal({
  show,
  t,
  branches,
  onClose,
  onExportJson,
  onExportPng,
  onExportAllZip,
  onExportCompleteImage,
  preparingCompleteImage,
}: BlueprintExportModalProps) {
  if (!Array.isArray(branches) || branches.length === 0) {
    return null;
  }

  return (
    <Modal
      show={show}
      onClose={onClose}
      ariaLabelledby="export-blueprint-title"
      title={
        <ModalHeader
          id="export-blueprint-title"
          icon="download"
          title={t("exportBlueprintJson")}
          bordered={false}
        />
      }
      contentClassName="max-w-md max-h-[calc(100dvh-2rem)] overflow-hidden"
    >
      <div className="flex min-h-0 flex-col gap-3">
        <p className="text-xs text-endfield-text/70">
          {t("selectExportBranch")}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
          {branches.map((branch, index) => (
            <BranchExportRow
              key={`${branch.denominator}-${branch.power}-${branch.phaseOffsetCells ?? 0}-${index}`}
              t={t}
              branch={branch}
              index={index}
              onExportJson={onExportJson}
              onExportPng={onExportPng}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <Button
            type="button"
            onClick={() => void onExportAllZip()}
            variant="primary"
          >
            <Icon name="folder_zip" className="w-4 h-4" />
            {t("downloadAllBranchesZip")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (preparingCompleteImage) return;
              void onExportCompleteImage();
            }}
            aria-disabled={preparingCompleteImage}
            disabled={preparingCompleteImage}
            variant="primary"
            className={`disabled:opacity-100 ${preparingCompleteImage ? "cursor-wait" : ""}`}
          >
            <Icon name="inventory_2" className="w-4 h-4" />
            {preparingCompleteImage
              ? t("completeImageGenerating")
              : t("previewCompleteExportImage")}
          </Button>
        </div>

        <Button type="button" onClick={onClose} variant="secondary" fullWidth>
          {t("close")}
        </Button>
      </div>
    </Modal>
  );
}
