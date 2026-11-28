import Icon from "./Icon";

export interface ModalHeaderProps {
  id?: string;
  icon?: string;
  title?: React.ReactNode;
  bordered?: boolean;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
}

export default function ModalHeader({
  id,
  icon,
  title,
  bordered = true,
  className = "",
  iconClassName = "text-endfield-yellow",
  titleClassName = "",
}: ModalHeaderProps) {
  const content = (
    <>
      {icon && <Icon name={icon} className={iconClassName} />}
      <h2
        id={id}
        className={`text-base font-bold text-endfield-text-light uppercase tracking-wider ${titleClassName}`.trim()}
      >
        {title}
      </h2>
    </>
  );

  if (!bordered) {
    return content;
  }

  return (
    <div
      className={`flex items-center gap-2 pb-3 border-b border-endfield-gray-light ${className}`.trim()}
    >
      {content}
    </div>
  );
}
