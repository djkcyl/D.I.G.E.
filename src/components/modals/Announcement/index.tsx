import { useEffect, useState } from "react";
import { SITE_CONFIG } from "../../../config/site";
import { useI18n } from "../../../i18n";
import { announcementLocales } from "../../../i18n/announcement/locales";
import {
  ANNOUNCEMENT_DISMISSED_KEY,
  ANNOUNCEMENT_ID,
  ANNOUNCEMENT_VIEWED_KEY,
  CHANGELOG_ID,
  CHANGELOG_VIEWED_KEY,
} from "../../../utils/announcement";
import Button from "../../ui/Button";
import Icon from "../../ui/Icon";
import Modal from "../../ui/Modal";
import ModalHeader from "../../ui/ModalHeader";
import UnreadDot from "../../ui/UnreadDot";
import AnnouncementBody from "./AnnouncementBody";
import ChangelogBody from "./ChangelogBody";

const QQ_GROUP_URL = SITE_CONFIG.qqGroupUrl;

export function shouldShowAnnouncement(): boolean {
  if (typeof window === "undefined") return false;
  const dismissedId = localStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY);
  return dismissedId !== ANNOUNCEMENT_ID;
}

export function hasUnreadAnnouncement(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ANNOUNCEMENT_VIEWED_KEY) !== ANNOUNCEMENT_ID;
}

export function hasUnreadChangelog(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CHANGELOG_VIEWED_KEY) !== CHANGELOG_ID;
}

export function hasUnreadAnnouncementOrChangelog(): boolean {
  return hasUnreadAnnouncement() || hasUnreadChangelog();
}

export interface AnnouncementProps {
  show: boolean;
  initialTab?: string;
  onClose: () => void;
  closeOnBackdrop?: boolean;
}

export default function Announcement({
  show,
  initialTab = "announcement",
  onClose,
  closeOnBackdrop = false,
}: AnnouncementProps) {
  const { t, locale } = useI18n();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [announcementUnread, setAnnouncementUnread] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ANNOUNCEMENT_VIEWED_KEY) !== ANNOUNCEMENT_ID;
  });
  const [changelogUnread, setChangelogUnread] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CHANGELOG_VIEWED_KEY) !== CHANGELOG_ID;
  });

  useEffect(() => {
    if (show) {
      setActiveTab(initialTab);
    }
  }, [show, initialTab]);

  useEffect(() => {
    if (!show) return;
    if (announcementUnread && initialTab === "announcement") {
      setAnnouncementUnread(false);
      localStorage.setItem(ANNOUNCEMENT_VIEWED_KEY, ANNOUNCEMENT_ID);
    }
  }, [show, announcementUnread, initialTab]);

  useEffect(() => {
    if (!show) return;
    if (changelogUnread && initialTab === "changelog") {
      setChangelogUnread(false);
      localStorage.setItem(CHANGELOG_VIEWED_KEY, CHANGELOG_ID);
    }
  }, [show, changelogUnread, initialTab]);

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
  const isAnnouncement = activeTab === "announcement";

  return (
    <Modal
      show={show}
      onClose={handleClose}
      closeOnBackdrop={closeOnBackdrop}
      ariaLabelledby="announcement-modal-title"
      contentClassName="max-w-xl h-[90vh]"
    >
      <ModalHeader
        id="announcement-modal-title"
        icon={isAnnouncement ? "campaign" : "history"}
        title={isAnnouncement ? t("announcement") : t("changelog")}
        className="mb-4"
      />

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            setActiveTab("announcement");
            if (announcementUnread) {
              setAnnouncementUnread(false);
              localStorage.setItem(ANNOUNCEMENT_VIEWED_KEY, ANNOUNCEMENT_ID);
            }
          }}
          className={`relative h-9 border text-sm tracking-wider transition-colors ${
            isAnnouncement
              ? "text-endfield-yellow border-endfield-yellow bg-endfield-yellow/10"
              : "text-endfield-text-light border-endfield-gray-light hover:border-endfield-text"
          }`}
        >
          {t("announcement")}
          {announcementUnread && <UnreadDot />}
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("changelog");
            if (changelogUnread) {
              setChangelogUnread(false);
              localStorage.setItem(CHANGELOG_VIEWED_KEY, CHANGELOG_ID);
            }
          }}
          className={`relative h-9 border text-sm tracking-wider transition-colors ${
            !isAnnouncement
              ? "text-endfield-yellow border-endfield-yellow bg-endfield-yellow/10"
              : "text-endfield-text-light border-endfield-gray-light hover:border-endfield-text"
          }`}
        >
          {t("changelog")}
          {changelogUnread && <UnreadDot />}
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
        <span className="text-sm text-endfield-text group-hover:text-endfield-text-light transition-colors">
          {t("dontShowAgain")}
        </span>
      </label>

      {locale === "zh" && (
        <a
          href={QQ_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 flex w-full items-center justify-center gap-2 h-10 bg-endfield-gray/60 border border-endfield-yellow/30 hover:border-endfield-yellow transition-colors text-endfield-yellow text-sm"
        >
          <Icon name="group" />
          <span>{t("joinQQGroup")}</span>
        </a>
      )}

      <Button type="button" onClick={handleClose} variant="primary" fullWidth>
        {t("understood")}
      </Button>
    </Modal>
  );
}
