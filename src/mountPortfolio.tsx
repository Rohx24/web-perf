import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'

/**
 * Mounts the real portfolio into `container`. Imported lazily (from the intro's
 * ENTER) so none of the portfolio's heavy assets/bundle load until the visitor
 * actually enters — the CRT title screen shows first, instantly.
 */
export function mountPortfolio (container: HTMLElement, target: string) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  if (target === 'contact') {
    // Jump to the contact section once the scene is up.
    window.setTimeout(() => window.scrollTo(0, document.documentElement.scrollHeight), 600)
  }
}
