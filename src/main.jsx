import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import * as Sentry from '@sentry/react'
import { clarity } from 'react-microsoft-clarity';

const clarityId = import.meta.env.VITE_CLARITY_ID
if (clarityId) {
  clarity.init(clarityId)
}

const sentryDsn = import.meta.env.VITE_SENTRY_DSN
const replaysSessionSampleRate = 0.1
const replaysOnErrorSampleRate = 1.0
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: __APP_VERSION__,
    sendDefaultPii: true,
    integrations: [Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
      maskAllInputs: false,
    })],
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={<div>Something went wrong.</div>}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </Sentry.ErrorBoundary>,
)
