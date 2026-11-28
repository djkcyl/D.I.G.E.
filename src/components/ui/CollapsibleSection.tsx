import Icon from "./Icon";

export interface CollapsibleSectionProps {
  title?: string;
  collapsed: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  icon?: string;
  expandLabel?: string;
  collapseLabel?: string;
  className?: string;
}

export default function CollapsibleSection({
  title,
  collapsed,
  onToggle,
  children,
  icon,
  expandLabel,
  collapseLabel,
  className = "",
}: CollapsibleSectionProps) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full min-h-8 sm:min-h-9 flex items-center gap-2 text-left"
        aria-expanded={!collapsed}
      >
        {icon && (
          <Icon name={icon} className="text-endfield-yellow leading-none" />
        )}
        <span className="text-sm font-bold text-endfield-text uppercase tracking-widest leading-none">
          {title}
        </span>
        <span className="ml-auto text-xs text-endfield-text/70 leading-none">
          {collapsed ? expandLabel : collapseLabel}
        </span>
        <Icon
          name={collapsed ? "expand_more" : "expand_less"}
          className="text-endfield-text leading-none"
        />
      </button>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows,margin,opacity] duration-300 ease-out ${
          collapsed
            ? "grid-rows-[0fr] mt-0 opacity-0"
            : "grid-rows-[1fr] mt-3 opacity-100"
        }`}
        inert={collapsed || undefined}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
