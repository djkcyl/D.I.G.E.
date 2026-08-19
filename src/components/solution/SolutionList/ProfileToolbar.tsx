import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../i18n";
import type { PowerGridProfile } from "../../../types/profile";
import Icon from "../../ui/Icon";

export interface ProfileToolbarProps {
  profiles: PowerGridProfile[];
  activeProfileId: string;
  isUrlSession?: boolean;
  onSelectProfile: (id: string) => void;
  onSaveAs: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  /** URL 分享会话：将当前参数写入本地新存档 */
  onSaveUrlSessionToLocal?: () => void;
  /** 打开电网蓝图码 / 链接导入 */
  onImportCode?: () => void;
}

export default function ProfileToolbar({
  profiles,
  activeProfileId,
  isUrlSession = false,
  onSelectProfile,
  onSaveAs,
  onRename,
  onDelete,
  onSaveUrlSessionToLocal,
  onImportCode,
}: ProfileToolbarProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const active =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const canDelete = profiles.length > 1;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const close = () => setOpen(false);

  return (
    <div
      className="relative flex items-center gap-1.5 shrink-0 ml-auto"
      ref={containerRef}
    >
      {isUrlSession && onSaveUrlSessionToLocal ? (
        <button
          type="button"
          onClick={() => {
            onSaveUrlSessionToLocal();
            close();
          }}
          className="h-10 px-2.5 bg-endfield-gray border border-endfield-yellow/60 hover:border-endfield-yellow text-endfield-yellow text-xs font-bold tracking-wider transition-colors inline-flex items-center gap-1"
          title={t("profileSaveUrlToLocal")}
        >
          <Icon name="save" className="!w-5 !h-5" />
          <span className="hidden sm:inline">{t("profileSaveUrlToLocal")}</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-10 min-w-[10rem] max-w-[16rem] bg-endfield-gray border border-endfield-gray-light hover:border-endfield-yellow transition-colors flex items-center justify-between gap-2 px-3 text-sm text-endfield-text-light"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("profileToolbarAria")}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon name="folder" className="!w-5 !h-5 shrink-0" />
          <span className="truncate">
            {isUrlSession
              ? t("profileUrlSession")
              : active?.name ?? t("noSolutionsTitle")}
          </span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-[min(100vw-2rem,20rem)] bg-endfield-gray border border-endfield-gray-light z-50 max-h-72 overflow-y-auto shadow-lg"
        >
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfileId && !isUrlSession;
            return (
              <div
                key={profile.id}
                className={`flex items-stretch border-b border-endfield-gray-light/60 last:border-b-0 ${
                  isActive ? "bg-endfield-yellow/10" : ""
                }`}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectProfile(profile.id);
                    close();
                  }}
                  className={`flex-1 min-w-0 px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-endfield-gray-light transition-colors ${
                    isActive
                      ? "text-endfield-yellow"
                      : "text-endfield-text-light"
                  }`}
                >
                  {isActive ? (
                    <Icon name="check" className="!w-4 !h-4 shrink-0" />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <span className="truncate">{profile.name}</span>
                </button>
                <button
                  type="button"
                  className="px-2 text-endfield-text/70 hover:text-endfield-yellow hover:bg-endfield-gray-light transition-colors"
                  title={t("profileRename")}
                  aria-label={t("profileRename")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(profile.id);
                    close();
                  }}
                >
                  <Icon name="edit" className="!w-4 !h-4" />
                </button>
                <button
                  type="button"
                  className={`px-2 transition-colors ${
                    canDelete
                      ? "text-endfield-text/70 hover:text-red-400 hover:bg-endfield-gray-light"
                      : "text-endfield-text/30 cursor-not-allowed"
                  }`}
                  title={t("profileDelete")}
                  aria-label={t("profileDelete")}
                  disabled={!canDelete}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canDelete) return;
                    onDelete(profile.id);
                    close();
                  }}
                >
                  <Icon name="delete" className="!w-4 !h-4" />
                </button>
              </div>
            );
          })}

          {onImportCode ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onImportCode();
                close();
              }}
              className="w-full px-3 py-2.5 text-left text-sm text-endfield-text-light hover:bg-endfield-gray-light transition-colors flex items-center gap-2 border-t border-endfield-gray-light"
            >
              <Icon name="download" className="!w-4 !h-4" />
              <span>{t("importCodeMenu")}</span>
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSaveAs();
              close();
            }}
            className="w-full px-3 py-2.5 text-left text-sm text-endfield-yellow hover:bg-endfield-gray-light transition-colors flex items-center gap-2 border-t border-endfield-gray-light"
          >
            <Icon name="add" className="!w-4 !h-4" />
            <span>{t("profileSaveAsNew")}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
