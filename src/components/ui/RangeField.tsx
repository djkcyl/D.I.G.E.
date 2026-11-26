export interface RangeFieldProps {
  id?: string;
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  rightSlot?: React.ReactNode;
  ticks?: (string | number)[] | null;
  className?: string;
}

export default function RangeField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  rightSlot = null,
  ticks,
  className = "space-y-2",
}: RangeFieldProps) {
  return (
    <div className={className}>
      <div className="flex justify-between items-center">
        <label htmlFor={id} className="text-sm text-endfield-text">
          {label}
        </label>
        {rightSlot}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        aria-label={ariaLabel || label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      {ticks && Array.isArray(ticks) && ticks.length > 0 && (
        <div className="flex justify-between text-xs text-endfield-text/50 px-0.5">
          {ticks.map((tick) => (
            <span key={String(tick)}>{tick}</span>
          ))}
        </div>
      )}
    </div>
  );
}
