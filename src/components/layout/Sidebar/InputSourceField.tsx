import { useI18n } from '../../../i18n';
import type { CalcParams } from '../../../types/calc';
import type { InputSource } from '../../../utils/constants';
import {
  DEFAULT_INPUT_SOURCE_ID,
  INPUT_SOURCE_OPTIONS,
  INPUT_SOURCES,
} from '../../../utils/constants';
import Icon from '../../ui/Icon';
import SidebarSection from './SidebarSection';

export interface InputSourceFieldProps {
  params: CalcParams;
  onChange: (key: keyof CalcParams | string, value: unknown) => void;
  locale: string;
  onShowInputWarning: () => void;
}

export default function InputSourceField({
  params,
  onChange,
  locale,
  onShowInputWarning,
}: InputSourceFieldProps) {
  const { t } = useI18n();

  const selectedInputSourceId = params.inputSourceId ?? DEFAULT_INPUT_SOURCE_ID;
  const inputSource =
    INPUT_SOURCES[selectedInputSourceId] || INPUT_SOURCES[DEFAULT_INPUT_SOURCE_ID];
  const getInputSourceName = (source: InputSource | undefined) =>
    source?.name?.[locale] || source?.name?.en || '';

  const handleSourceChange = (sourceId: string) => {
    onChange('inputSourceId', sourceId);
  };

  const speed = inputSource.speed;

  return (
    <SidebarSection icon="input" title={t('inputSource')} className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {INPUT_SOURCE_OPTIONS.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => handleSourceChange(source.id)}
            className={`h-10 px-2 border text-xs sm:text-sm transition-colors ${
              selectedInputSourceId === source.id
                ? 'text-endfield-yellow border-endfield-yellow bg-endfield-yellow/10'
                : 'text-endfield-text-light border-endfield-gray-light hover:border-endfield-text'
            }`}
          >
            {getInputSourceName(source)}
            <span className="ml-1 opacity-60">({source.speed}/s)</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-endfield-text/50">
        <span className="leading-normal">
          {t('inputSpeed')}: {speed.toFixed(speed < 0.1 ? 3 : 2)} {t('itemPerSec')}
          {selectedInputSourceId === 'packer' ? ` (${t('inputHintPacker')})` : ''}
        </span>
        {selectedInputSourceId === 'packer' && (
          <button
            type="button"
            onClick={onShowInputWarning}
            className="w-5 h-5 inline-flex items-center justify-center leading-none text-endfield-text/50 hover:text-endfield-yellow transition-colors"
            title={t('inputWarningPacker')}
            aria-label={t('inputWarningPacker')}
            aria-haspopup="dialog"
          >
            <Icon name="info" className="leading-none" />
          </button>
        )}
      </div>
    </SidebarSection>
  );
}
