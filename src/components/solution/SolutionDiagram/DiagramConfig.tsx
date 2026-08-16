import { useI18n } from '../../../i18n';
import type { SolutionResult } from '../../../types/calc';
import type { Fuel } from '../../../utils/constants';
import Icon from '../../ui/Icon';

export interface DiagramConfigProps {
  solution: SolutionResult;
  locale: string;
}

export default function DiagramConfig({ solution, locale }: DiagramConfigProps) {
  const { t } = useI18n();

  const getFuelName = (fuel: Fuel | undefined) => {
    if (!fuel) return '-';
    return fuel.name?.[locale] || fuel.name?.en || '';
  };

  const baseConfig = solution.baseConfig ?? { generators: 0, totalPower: 200, belts: 0 };
  const baseFuelData = solution.baseFuel ?? solution.fuel;
  const details = solution.baseDetails;

  if (details) {
    const parts: string[] = [`${details.corePower}w`];
    for (const line of details.manualLines) {
      if (line.count > 0) {
        parts.push(`${line.count}×${getFuelName(line.fuel)}(${line.power}w)`);
      }
    }
    if (details.autoBaseCount > 0 && details.autoBaseFuel) {
      const autoPower = details.autoBaseCount * details.autoBaseFuel.power;
      parts.push(
        `${details.autoBaseCount}×${getFuelName(details.autoBaseFuel)}(${autoPower}w)`
      );
    }

    const hasExtra =
      details.manualLines.some((l) => l.count > 0) || details.autoBaseCount > 0;

    return (
      <div className="flex flex-wrap items-center gap-2 p-3 bg-endfield-gray border border-endfield-gray-light">
        <Icon name="factory" className="text-endfield-yellow" />
        <span className="text-sm text-endfield-text uppercase">{t('basePowerShort')}:</span>
        {hasExtra ? (
          <>
            <span className="text-sm font-bold text-endfield-yellow">
              {details.totalBasePower}w
            </span>
            <span className="text-xs text-endfield-text/70">
              ({parts.join(' + ')})
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-bold text-endfield-yellow">
              {details.corePower}w
            </span>
            <span className="text-xs text-endfield-text/70">({t('baseOnlyHint')})</span>
          </>
        )}
      </div>
    );
  }

  // 降级：旧 200w + n×primary
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-endfield-gray border border-endfield-gray-light">
      <Icon name="factory" className="text-endfield-yellow" />
      <span className="text-sm text-endfield-text uppercase">{t('basePowerShort')}:</span>
      {baseConfig.generators > 0 ? (
        <>
          <span className="text-sm font-bold text-endfield-text-light">
            {baseConfig.generators}
          </span>
          <span className="text-sm text-endfield-text">x {getFuelName(baseFuelData)}</span>
          <span className="text-sm text-endfield-text">=</span>
          <span className="text-sm font-bold text-endfield-yellow">{baseConfig.totalPower}w</span>
          <span className="text-xs text-endfield-text/70">
            (200w + {baseConfig.generators * (baseFuelData?.power ?? 0)}w)
          </span>
        </>
      ) : (
        <>
          <span className="text-sm font-bold text-endfield-yellow">200w</span>
          <span className="text-xs text-endfield-text/70">({t('baseOnlyHint')})</span>
        </>
      )}
    </div>
  );
}
