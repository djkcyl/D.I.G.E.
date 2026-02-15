import { useI18n } from '../i18n';
import Icon from './Icon';

export default function PrivacyPolicyModal({ show, onClose }) {
  const { t } = useI18n();

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-endfield-black/95 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="bg-endfield-gray border border-endfield-yellow/30 p-6 max-w-2xl w-full relative max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-endfield-gray-light">
          <Icon name="policy" className="text-endfield-yellow" />
          <h2 className="text-base font-bold text-endfield-text-light uppercase tracking-wider">
            {t('privacyPolicyTitle')}
          </h2>
        </div>

        <div className="text-sm text-endfield-text-light leading-relaxed mb-6 overflow-y-auto scrollbar-gutter-stable flex-1 pr-2">
          <p className="mb-4">{t('privacyNoticeBody')}</p>
          <p>
            {t('privacyThirdPartyLabel')}{' '}
            <a
              href="https://privacy.microsoft.com/privacystatement"
              target="_blank"
              rel="noopener noreferrer"
              className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2"
            >
              {t('microsoftPrivacyStatement')}
            </a>
            {' '}·{' '}
            <a
              href="https://sentry.io/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2"
            >
              {t('sentryPrivacyStatement')}
            </a>
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full h-10 bg-endfield-yellow hover:bg-endfield-yellow-glow text-endfield-black font-bold tracking-wider transition-all flex items-center justify-center gap-2 text-sm"
        >
          {t('close')}
        </button>
      </div>
    </div>
  );
}
