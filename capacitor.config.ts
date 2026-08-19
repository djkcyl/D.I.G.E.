import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android package aligned with official site dige.aunly.cn.
 * webDir must match Vite default outDir (`dist`).
 */
const config: CapacitorConfig = {
  appId: "cn.aunly.dige",
  appName: "D.I.G.E.",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
