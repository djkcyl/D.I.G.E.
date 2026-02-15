import { useI18n } from '../i18n';
import Icon from './Icon';

export default function ErrorState({ show, onDismiss }) {
  const { t } = useI18n();
  
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-endfield-black/95 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="bg-endfield-gray border border-red-900/50 p-6 max-w-lg w-full relative flex flex-col gap-4 corner-mark">
        <div className="flex items-center gap-2 pb-3 border-b border-red-900/50">
          <Icon name="error" className="text-red-300" />
          <h2 className="text-base font-bold text-endfield-text-light uppercase tracking-wider">
            {t('noSolutionFound')}
          </h2>
        </div>
        <p className="text-sm text-red-200 leading-relaxed">
          {t('errorSuggestion')}
        </p>
        <button
          onClick={onDismiss}
          className="w-full h-10 bg-red-600/90 hover:bg-red-500 text-white font-bold tracking-wider transition-all flex items-center justify-center gap-2 text-sm"
        >
          {t('dismiss')}
        </button>
      </div>
    </div>
  );
}
