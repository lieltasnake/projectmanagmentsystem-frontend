import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './index.css'

// Apply saved accent before first render to avoid flash
try {
  const raw = localStorage.getItem('pms_appearance');
  if (raw) {
    const parsed = JSON.parse(raw);
    document.documentElement.dataset.accent = parsed?.accentColor || 'purple';
  } else {
    document.documentElement.dataset.accent = 'purple';
  }
} catch {
  document.documentElement.dataset.accent = 'purple';
}

import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
