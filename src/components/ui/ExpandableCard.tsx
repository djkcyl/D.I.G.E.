import { useState } from "react";
import { useI18n } from "../../i18n";
import Icon from "./Icon";

export interface ExpandableCardProps {
  title?: string;
  version?: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

export default function ExpandableCard({
  title,
  version,
  defaultOpen = false,
  children,
}: ExpandableCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { t } = useI18n();

  return (
    <div
      className={`border transition-colors ${
        open
          ? "border-endfield-yellow/40 bg-endfield-gray/60"
          : "border-endfield-gray-light/60 bg-endfield-dark/30 hover:border-endfield-text/60"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
        aria-expanded={open}
        aria-label={`${open ? t("collapseSection") : t("expandSection")}: ${title || version}`}
      >
        <Icon
          name="chevron_right"
          className={`text-sm leading-none shrink-0 transition-transform ${
            open ? "rotate-90 text-endfield-yellow" : "text-endfield-text/50"
          }`}
        />
        <span
          className={`text-sm font-semibold leading-none py-0 ${open ? "text-endfield-text-light" : "text-endfield-text/80"}`}
        >
          {title || version}
        </span>
      </button>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-250 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div
          className={`min-h-0 px-3 transition-opacity duration-150 ease-out ${
            open ? "pt-1 pb-3 opacity-100" : "pt-0 pb-0 opacity-0"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
