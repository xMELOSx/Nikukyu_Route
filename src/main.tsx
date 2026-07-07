import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GlobalDataService } from './utils/GlobalDataService'

const isLocal = GlobalDataService.getInstance().isLocal

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary isLocal={isLocal}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
