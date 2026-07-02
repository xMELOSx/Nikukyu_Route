import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary isLocal={isLocal}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
