import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import Icon from './Icon';

export default function ShareModal({ show, shareUrl, onClose, onCopy, onShare }) {
  const { t } = useI18n();
  const firstLinkRef = useRef(null);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const selectLinkText = (el) => {
    if (!el || typeof window === 'undefined') return;
    const range = window.document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  useEffect(() => {
    if (!show) return;
    const handle = window.requestAnimationFrame(() => {
      if (!firstLinkRef.current) return;
      firstLinkRef.current.focus();
      selectLinkText(firstLinkRef.current);
    });
    return () => window.cancelAnimationFrame(handle);
  }, [show, shareUrl]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-endfield-black/95 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="bg-endfield-gray border border-endfield-yellow/30 p-4 sm:p-5 max-w-xl w-full relative flex flex-col gap-2.5">
        <div className="flex items-center gap-2 pb-3 border-b border-endfield-gray-light">
          <Icon name="share" className="text-endfield-yellow" />
          <h2 className="text-base font-bold text-endfield-text-light uppercase tracking-wider">
            {t('shareLinkTitle')}
          </h2>
        </div>

        <div className="space-y-2">
          <div
            ref={firstLinkRef}
            role="textbox"
            aria-readonly="true"
            aria-label={t('shareLinkLabel')}
            tabIndex={0}
            onClick={(e) => selectLinkText(e.currentTarget)}
            onFocus={(e) => selectLinkText(e.currentTarget)}
            className="w-full bg-endfield-black/80 border border-endfield-yellow/40 px-3 py-2 text-[11px] sm:text-sm text-endfield-yellow/90 font-mono leading-snug break-all focus:border-endfield-yellow focus:outline-none shadow-[0_0_0_1px_rgba(255,250,0,0.08),0_12px_30px_rgba(0,0,0,0.45)] flex items-center justify-center text-center"
          >
            {shareUrl || ''}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={onCopy}
            className="h-10 bg-endfield-yellow hover:bg-endfield-yellow-glow text-endfield-black font-bold tracking-wider transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Icon name="content_copy" />
            {t('copyLink')}
          </button>

          <button
            onClick={onShare}
            disabled={!canShare}
            className={`h-10 border border-endfield-gray-light transition-all flex items-center justify-center gap-2 text-sm ${
              canShare
                ? 'bg-endfield-gray hover:border-endfield-yellow text-endfield-text-light hover:text-endfield-yellow'
                : 'bg-endfield-gray/40 text-endfield-text/40 cursor-not-allowed'
            }`}
          >
            <Icon name="ios_share" />
            {t('shareSystem')}
          </button>
        </div>

        {!canShare && (
          <p className="text-xs text-endfield-text/60">
            {t('shareUnavailable')}
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full h-10 bg-endfield-gray hover:border-endfield-yellow border border-endfield-gray-light text-endfield-text-light font-bold tracking-wider transition-all flex items-center justify-center gap-2 text-sm"
        >
          {t('close')}
        </button>
      </div>
    </div>
  );
}
