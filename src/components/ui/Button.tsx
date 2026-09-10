import { forwardRef } from "react";

const VARIANT_CLASS_MAP: Record<string, string> = {
  primary:
    "bg-endfield-yellow-bg text-endfield-ink hover:bg-endfield-yellow-glow",
  secondary:
    "bg-endfield-gray border border-endfield-gray-light text-endfield-text-light hover:border-endfield-yellow hover:text-endfield-yellow",
  danger: "bg-red-600/90 text-white hover:bg-red-500",
  none: "",
};

const SIZE_CLASS_MAP: Record<string, string> = {
  md: "h-10 min-h-10 px-3 text-sm",
  sm: "h-8 min-h-8 px-2 text-xs",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "none";
  size?: "md" | "sm";
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    type = "button",
    variant = "secondary",
    size = "md",
    fullWidth = false,
    className = "",
    children,
    ...props
  },
  ref
) {
  const variantClass =
    VARIANT_CLASS_MAP[variant] || VARIANT_CLASS_MAP.secondary;
  const sizeClass = SIZE_CLASS_MAP[size] || SIZE_CLASS_MAP.md;

  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-bold tracking-wider transition-all ${sizeClass} ${
        fullWidth ? "w-full shrink-0" : ""
      } ${variantClass} disabled:opacity-60 disabled:cursor-not-allowed ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;
