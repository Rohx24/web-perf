import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BootGate } from './boot/BootGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BootGate>
      <App />
    </BootGate>
  </StrictMode>,
)
