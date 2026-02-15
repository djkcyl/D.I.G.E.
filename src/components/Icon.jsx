import { Icon as IconifyIcon } from '@iconify/react';

const ICON_SET = 'material-symbols';

// Iconify material-symbols 使用 kebab-case，将下划线转为连字符
const toIconName = (name) => name.replace(/_/g, '-');

/**
 * 图标组件，统一使用 material-symbols 图标集（实心样式）
 * 默认 24x24。传 icon 可用其他图标集（如 mdi:github）
 */
export default function Icon({ name, icon: iconOverride, className = '', ...props }) {
  const icon = iconOverride ?? `${ICON_SET}:${toIconName(name)}`;
  return (
    <IconifyIcon
      icon={icon}
      width={24}
      height={24}
      className={`inline-block shrink-0 ${className}`.trim()}
      aria-hidden="true"
      {...props}
    />
  );
}
