/**
 * 站点/仓库配置集中处。
 *
 * 这份 fork 之后可能合并回上游，所有「换个仓库就要改一堆硬编码」的东西都收在这里：
 * 仓库地址、Issues、QQ 群、教程视频、站点域名、应用名与版本。
 * 合并 PR 后只需要改这一个文件即可。
 */

export const SITE_CONFIG = {
  appName: "D.I.G.E.",
  appSlug: "dige",
  /** 本仓库（fork / 合并后的主仓库） */
  repoUrl: "https://github.com/VincentHDLee/D.I.G.E.",
  repoBranch: "main",
  issuesUrl: "https://github.com/VincentHDLee/D.I.G.E./issues",
  /** 上游原仓库，仅用于致谢与差异说明 */
  upstreamUrl: "https://github.com/djkcyl/D.I.G.E.",
  /** 用户群（仅中文界面展示） */
  qqGroupUrl: "https://qm.qq.com/q/zL6wp3emTQ",
  qqGroupLocale: "zh",
  /** 视频教程（上游录制，功能有版本差） */
  tutorialUrl: "https://www.bilibili.com/video/BV1mjZwBaEXi",
  /** 线上站点：分享链接在 localhost / Capacitor 下回落到这里 */
  canonicalOrigin: "https://dige-2st.pages.dev",
} as const;

export type SiteConfig = typeof SITE_CONFIG;
