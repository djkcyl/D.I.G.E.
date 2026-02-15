import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { announcementLocales } from '../i18n/announcement/locales';
import Icon from './Icon';

// 已读状态版本。变更指纹算法时递增。
const CONTENT_ID_SCHEMA_VERSION = 'v1';

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildContentId(prefix, payload) {
  const serialized = stableStringify(payload);
  return `${prefix}-${CONTENT_ID_SCHEMA_VERSION}-${hashString(serialized)}`;
}

function pickLocalizedSection(sectionKey) {
  return Object.fromEntries(
    Object.entries(announcementLocales).map(([localeCode, localeData]) => [
      localeCode,
      localeData?.[sectionKey] || null,
    ]),
  );
}

// 同一文件内分段指纹：announcement 与 changelog 独立计算
const ANNOUNCEMENT_ID = buildContentId('announcement', pickLocalizedSection('announcement'));
const CHANGELOG_ID = buildContentId('changelog', pickLocalizedSection('changelog'));

const GITHUB_URL = 'https://github.com/djkcyl/D.I.G.E.';
const ISSUES_URL = 'https://github.com/djkcyl/D.I.G.E./issues';
const VIDEO_TUTORIAL_URL = 'https://www.bilibili.com/video/BV1VrfSByEBo';
const QQ_GROUP_URL = 'https://qm.qq.com/q/zL6wp3emTQ';

const LinkStyle = 'text-endfield-yellow hover:text-endfield-yellow-glow underline underline-offset-2 transition-colors';
const HeadingStyle = 'text-endfield-yellow font-bold mt-4 mb-2';
const ListStyle = 'list-disc list-inside space-y-1 text-endfield-text';

const CONTENT_LINKS = {
  tutorial: VIDEO_TUTORIAL_URL,
  github: GITHUB_URL,
  issues: ISSUES_URL,
};

function ChangelogSection({ version, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const { t } = useI18n();

  return (
    <div
      className={`border transition-colors ${
        open
          ? 'border-endfield-yellow/40 bg-endfield-gray/60'
          : 'border-endfield-gray-light/60 bg-endfield-dark/30 hover:border-endfield-text/60'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left"
        aria-expanded={open}
        aria-label={`${open ? t('collapseSection') : t('expandSection')}: ${title || version}`}
      >
        <Icon
          name="chevron_right"
          className={`text-sm leading-none transition-transform ${
            open ? 'rotate-90 text-endfield-yellow' : 'text-endfield-text/50'
          }`}
        />
        <span className={`text-sm font-semibold leading-none py-0 ${open ? 'text-endfield-text-light' : 'text-endfield-text/80'}`}>
          {title || version}
        </span>
      </button>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-250 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div
          className={`min-h-0 px-3 transition-opacity duration-150 ease-out ${
            open ? 'pt-1 pb-3 opacity-100' : 'pt-0 pb-0 opacity-0'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function RenderContentSegments({ segments = [], blockIndex }) {
  return segments.map((segment, segmentIndex) => {
    const key = `${blockIndex}-${segmentIndex}`;
    const href = segment.link ? CONTENT_LINKS[segment.link] : null;
    if (href) {
      return (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LinkStyle}>
          {segment.text}
        </a>
      );
    }
    return <span key={key}>{segment.text}</span>;
  });
}

function AnnouncementBody({ blocks = [] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <h3 key={`heading-${index}`} className={HeadingStyle}>
              {block.text}
            </h3>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={`list-${index}`} className={ListStyle}>
              {(block.items || []).map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${index}`} className={block.className || 'mb-3'}>
              {block.segments ? <RenderContentSegments segments={block.segments} blockIndex={index} /> : block.text}
            </p>
          );
        }

        return null;
      })}
    </>
  );
}

function ChangelogBody({ sections = [] }) {
  return (
    <div className="space-y-2">
      {sections.map((section, index) => (
        <ChangelogSection
          key={`${section.version}-${index}`}
          version={section.version}
          title={section.title}
          defaultOpen={section.defaultOpen}
        >
          <ul className={ListStyle}>
            {(section.items || []).map((item, itemIndex) => (
              <li key={`${section.version}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        </ChangelogSection>
      ))}
    </div>
  );
}

const ANNOUNCEMENT_DISMISSED_KEY = 'dige-announcement-dismissed';
const ANNOUNCEMENT_VIEWED_KEY = 'dige-announcement-viewed';
const CHANGELOG_VIEWED_KEY = 'dige-changelog-viewed';

// 检查是否需要自动显示公告
export function shouldShowAnnouncement() {
  const dismissedId = localStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY);
  return dismissedId !== ANNOUNCEMENT_ID;
}

// 检查公告是否有未读内容
export function hasUnreadAnnouncement() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ANNOUNCEMENT_VIEWED_KEY) !== ANNOUNCEMENT_ID;
}

// 检查更新日志是否有未读内容
export function hasUnreadChangelog() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(CHANGELOG_VIEWED_KEY) !== CHANGELOG_ID;
}

// 入口红点：公告或更新日志任一未读
export function hasUnreadAnnouncementOrChangelog() {
  return hasUnreadAnnouncement() || hasUnreadChangelog();
}

export default function Announcement({ show, onClose }) {
  const { t, locale } = useI18n();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [activeTab, setActiveTab] = useState('announcement');
  const [announcementUnread, setAnnouncementUnread] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ANNOUNCEMENT_VIEWED_KEY) !== ANNOUNCEMENT_ID;
  });
  const [changelogUnread, setChangelogUnread] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(CHANGELOG_VIEWED_KEY) !== CHANGELOG_ID;
  });

  useEffect(() => {
    if (show) {
      setActiveTab('announcement');
    }
  }, [show]);

  useEffect(() => {
    if (!show) return;
    if (announcementUnread) {
      setAnnouncementUnread(false);
      localStorage.setItem(ANNOUNCEMENT_VIEWED_KEY, ANNOUNCEMENT_ID);
    }
  }, [show, announcementUnread]);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(ANNOUNCEMENT_DISMISSED_KEY, ANNOUNCEMENT_ID);
    }
    setDontShowAgain(false);
    onClose();
  };

  if (!show) return null;

  const localeContent = announcementLocales[locale] || announcementLocales.en;
  const announcementBlocks = localeContent?.announcement?.blocks || [];
  const changelogSections = localeContent?.changelog?.sections || [];
  const isAnnouncement = activeTab === 'announcement';

  return (
    <div className="fixed inset-0 bg-endfield-black/95 backdrop-blur z-50 flex items-center justify-center p-4">
      <div className="bg-endfield-gray border border-endfield-yellow/30 p-6 max-w-xl w-full relative h-[90vh] flex flex-col">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-endfield-gray-light">
          <Icon name={isAnnouncement ? 'campaign' : 'history'} className="text-endfield-yellow" />
          <h2 className="text-base font-bold text-endfield-text-light uppercase tracking-wider">
            {isAnnouncement ? t('announcement') : t('changelog')}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setActiveTab('announcement');
              if (announcementUnread) {
                setAnnouncementUnread(false);
                localStorage.setItem(ANNOUNCEMENT_VIEWED_KEY, ANNOUNCEMENT_ID);
              }
            }}
            className={`relative h-9 border text-sm tracking-wider transition-colors ${
              isAnnouncement
                ? 'text-endfield-yellow border-endfield-yellow bg-endfield-yellow/10'
                : 'text-endfield-text-light border-endfield-gray-light hover:border-endfield-text'
            }`}
          >
            {t('announcement')}
            {announcementUnread && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('changelog');
              if (changelogUnread) {
                setChangelogUnread(false);
                localStorage.setItem(CHANGELOG_VIEWED_KEY, CHANGELOG_ID);
              }
            }}
            className={`relative h-9 border text-sm tracking-wider transition-colors ${
              !isAnnouncement
                ? 'text-endfield-yellow border-endfield-yellow bg-endfield-yellow/10'
                : 'text-endfield-text-light border-endfield-gray-light hover:border-endfield-text'
            }`}
          >
            {t('changelog')}
            {changelogUnread && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>

        <div className="text-sm text-endfield-text-light leading-relaxed mb-6 overflow-y-auto scrollbar-gutter-stable flex-1 pr-2">
          {isAnnouncement ? (
            <AnnouncementBody blocks={announcementBlocks} />
          ) : (
            <ChangelogBody sections={changelogSections} />
          )}
        </div>

        <label className="flex items-center gap-3 mb-4 cursor-pointer select-none group">
          <div className="relative w-4 h-4 border border-endfield-gray-light group-hover:border-endfield-yellow transition-colors flex items-center justify-center">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            {dontShowAgain && (
              <Icon name="check" className="text-endfield-yellow" />
            )}
          </div>
          <span className="text-sm text-endfield-text group-hover:text-endfield-text-light transition-colors">{t('dontShowAgain')}</span>
        </label>

        {locale === 'zh' && (
          <a
            href={QQ_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 flex w-full items-center justify-center gap-2 h-10 bg-endfield-gray/60 border border-endfield-yellow/30 hover:border-endfield-yellow transition-colors text-endfield-yellow text-sm"
          >
            <Icon name="group" />
            <span>{t('joinQQGroup')}</span>
          </a>
        )}

        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 w-full h-10 min-h-10 bg-endfield-yellow hover:bg-endfield-yellow-glow text-endfield-black font-bold tracking-wider transition-all flex items-center justify-center gap-2 text-sm"
        >
          {t('understood')}
        </button>
      </div>
    </div>
  );
}
