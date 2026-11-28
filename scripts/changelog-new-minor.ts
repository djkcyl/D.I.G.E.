/**
 * 将最新小节的 5 条更新迁到新的四位版本小节。
 * 现有 changelog CLI 仅支持往既有小节追加，不能新开小节。
 * 只用 Node 内置模块；先读完并校验全部 8 语言，再统一写出，避免手工编辑错位。
 * 用法（仓库根目录）：pnpm exec tsx scripts/changelog-new-minor.ts -- 1.12.1.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface ChangelogSection {
  version: string;
  title: string;
  defaultOpen?: boolean;
  items: string[];
}
interface AnnouncementData {
  changelog: { sections: ChangelogSection[] };
}
interface PendingFile {
  path: string;
  content: string;
}

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("请输入四段纯数字版本，例如 1.12.1.0，不能缩写成 1.12.1");
}
const target = `v${version}`;
const locales = ["zh", "en", "ja", "ko", "ru", "fr", "de", "id"];
const pending: PendingFile[] = [];

for (const locale of locales) {
  const path = join("src", "i18n", "announcement", `locales.${locale}.json`);
  const data = JSON.parse(readFileSync(path, "utf8")) as AnnouncementData;
  const sections = data.changelog?.sections;
  const previous = sections?.[0];
  if (!sections || !previous || !Array.isArray(previous.items)) {
    throw new Error(`${locale}: 找不到可迁移的最新 changelog 小节`);
  }
  if (sections.some((section) => section.version === target)) {
    throw new Error(`${locale}: ${target} 已存在，不能重复创建`);
  }
  if (previous.items.length !== 9) {
    throw new Error(
      `${locale}: 预期原小节 9 条（4 条历史 + 5 条本轮），实际 ${previous.items.length}`,
    );
  }
  const items = previous.items.slice(-5);
  const nextTitle = previous.title.replace(previous.version, target);
  if (!nextTitle.includes(target)) {
    throw new Error(`${locale}: 小节标题缺少版本号 ${previous.version}`);
  }
  const updated: AnnouncementData = {
    ...data,
    changelog: {
      ...data.changelog,
      sections: [
        {
          version: target,
          title: nextTitle,
          defaultOpen: true,
          items,
        },
        { ...previous, items: previous.items.slice(0, 4), defaultOpen: false },
        ...sections.slice(1),
      ],
    },
  };
  pending.push({ path, content: `${JSON.stringify(updated, null, 2)}\n` });
}

for (const file of pending) writeFileSync(file.path, file.content, "utf8");
console.log(
  `✓ ${target}: ${pending.length} locales; 旧小节各 4 条，新小节各 5 条。`,
);
