import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import * as Sentry from "@sentry/react";
import { clarity } from "react-microsoft-clarity";
import { initPWA } from "./pwa";

const clarityId = import.meta.env.VITE_CLARITY_ID;
if (clarityId) {
  clarity.init(clarityId);
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const replaysSessionSampleRate = 0.1;
const replaysOnErrorSampleRate = 1.0;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: __APP_VERSION__,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
        maskAllInputs: true,
      }),
    ],
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
  });
}

initPWA();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

ReactDOM.createRoot(rootElement).render(
  <Sentry.ErrorBoundary fallback={<div>Something went wrong.</div>}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </Sentry.ErrorBoundary>,
);
