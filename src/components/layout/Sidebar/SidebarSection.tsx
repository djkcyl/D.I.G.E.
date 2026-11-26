import Icon from "../../ui/Icon";

export interface SidebarSectionProps {
  icon?: string;
  title?: React.ReactNode;
  /** 标题行右侧的附加控件（开关等） */
  right?: React.ReactNode;
  className?: string;
  legendClassName?: string;
  children?: React.ReactNode;
}

export default function SidebarSection({
  icon,
  title,
  right,
  className = "space-y-4",
  legendClassName = "",
  children,
}: SidebarSectionProps) {
  return (
    <fieldset className={`border-none p-0 m-0 ${className}`.trim()}>
      <legend
        className={`w-full text-sm font-bold text-endfield-text uppercase tracking-widest flex items-center gap-2 p-0 ${legendClassName}`.trim()}
      >
        {icon && <Icon name={icon} className="text-endfield-yellow" />}
        {title}
        {right ? <span className="ml-auto">{right}</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}
