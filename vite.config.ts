import { readFileSync } from "node:fs";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  version: string;
};
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryEnabled = Boolean(sentryAuthToken && sentryOrg && sentryProject);

const isDockerDev = process.env.DOCKER_DEV === "1";

export default defineConfig({
  // Windows Hyper-V/WSL often reserves 5145–5244 (includes Vite default 5173 → EACCES).
  // Host `pnpm dev` uses 3000; Docker compose maps host 3000 → container 5173.
  server: {
    host: isDockerDev ? "0.0.0.0" : "127.0.0.1",
    port: isDockerDev ? 5173 : 3000,
    strictPort: isDockerDev,
    watch: isDockerDev
      ? {
          // Docker Desktop bind mounts on Windows do not emit inotify.
          usePolling: true,
          interval: 300,
        }
      : undefined,
    hmr: isDockerDev
      ? {
          // Browser talks to host:3000; without clientPort HMR opens :5173 and stalls.
          protocol: "ws",
          host: "localhost",
          clientPort: 3000,
        }
      : undefined,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifestFilename: "manifest.json",
      includeAssets: ["favicon.png", "icon-512.png", "robots.txt"],
      manifest: {
        id: "/",
        name: "D.I.G.E. - Dijiang Integrated Generator Efficiency",
        short_name: "D.I.G.E.",
        description:
          "Thermal Pool power generation optimizer for Arknights: Endfield.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        background_color: "#1a1a2e",
        theme_color: "#1a1a2e",
        orientation: "any",
        lang: "zh-CN",
        dir: "ltr",
        categories: ["games", "utilities"],
        icons: [
          {
            src: "/favicon.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,json}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
    sentryEnabled
      ? sentryVitePlugin({
          org: sentryOrg,
          project: sentryProject,
          authToken: sentryAuthToken,
          release: { name: pkg.version },
          sourcemaps: {
            filesToDeleteAfterUpload: ["./dist/**/*.map"],
          },
        })
      : null,
  ].filter(Boolean),
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (
            id.includes("i18n") &&
            (id.includes("locales") || id.endsWith(".json"))
          )
            return "i18n";
          if (id.includes("node_modules")) {
            if (
              id.includes("@sentry/") ||
              id.includes("react-microsoft-clarity")
            )
              return "monitoring";
            if (
              (id.includes("node_modules/react/") ||
                id.includes("node_modules/react-dom/")) &&
              !id.includes("react-chartjs") &&
              !id.includes("@sentry")
            )
              return "core";
            if (id.includes("chart.js") || id.includes("react-chartjs"))
              return "vendor";
            if (id.includes("@iconify/react")) return "vendor";
            if (id.includes("qrcode.react")) return "vendor";
          }
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
