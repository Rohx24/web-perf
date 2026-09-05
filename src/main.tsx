import './index.css'
import { startIntro } from './intro/intro'

const root = document.getElementById('root')!
const SKIP =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('noboot') === '1'

if (SKIP) {
  // Straight to the portfolio (dev / deep-link).
  import('./mountPortfolio').then((m) => m.mountPortfolio(root, 'enter'))
} else {
  // The CRT title screen shows first; the portfolio is mounted lazily on ENTER,
  // so nothing of the heavy site loads until the visitor chooses to enter.
  startIntro({
    onEnter: (target) => import('./mountPortfolio').then((m) => m.mountPortfolio(root, target)),
  })
}
