import { useI18n } from '../../../i18n';
import type { CalcParams } from '../../../types/calc';
import { PARAM_LIMITS } from '../../../utils/constants';
import RangeField from '../../ui/RangeField';
import SidebarSection from './SidebarSection';

export interface ConstraintsFieldProps {
  params: CalcParams;
  onChange: (key: keyof CalcParams | string, value: unknown) => void;
  onCalculate?: () => void;
}

/** 主区约束：仅 minBatteryPercent + maxBranches */
export default function ConstraintsField({ params, onChange, onCalculate }: ConstraintsFieldProps) {
  const { t } = useI18n();

  const handleMinBattery = (val: number) => {
    const clamped = Math.min(100, Math.max(0, val));
    onChange('minBatteryPercent', clamped);
  };

  return (
    <SidebarSection icon="tune" title={t('constraints')} className="space-y-4">
      <div className="space-y-2">
        <RangeField
          id="min-battery-input"
          label={t('minBatteryPercent')}
          value={params.minBatteryPercent}
          min={0}
          max={100}
          onChange={(nextValue) => onChange('minBatteryPercent', nextValue)}
          ariaLabel={t('minBatteryPercent')}
          rightSlot={
            <div className="flex items-center">
              <input
                type="number"
                min="0"
                max="100"
                value={params.minBatteryPercent}
                onChange={(e) => handleMinBattery(parseInt(e.target.value, 10) || 0)}
                onKeyDown={(e) => e.key === 'Enter' && onCalculate?.()}
                className="w-12 bg-transparent border-b border-endfield-gray-light px-1 py-0.5 text-sm text-endfield-text-light text-right focus:border-endfield-yellow focus:outline-none"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={params.minBatteryPercent}
              />
              <span className="text-sm text-endfield-text-light">%</span>
            </div>
          }
        />
      </div>

      <RangeField
        id="max-branches-input"
        label={t('maxBranches')}
        value={params.maxBranches ?? 3}
        min={PARAM_LIMITS.MIN_BRANCHES}
        max={PARAM_LIMITS.MAX_BRANCHES}
        step={1}
        onChange={(nextValue) => onChange('maxBranches', nextValue)}
        ariaLabel={t('maxBranches')}
        rightSlot={
          <span className="text-sm text-endfield-text-light" aria-live="polite">
            {params.maxBranches ?? 3}
          </span>
        }
        ticks={Array.from({ length: PARAM_LIMITS.MAX_BRANCHES }, (_, i) => i + 1)}
      />
    </SidebarSection>
  );
}
