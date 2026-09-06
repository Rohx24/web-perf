import './index.css'
import { startIntro } from './intro/intro'
import { setIntroActive } from './perf/introState'
import { applyVibrance, readVibrance } from './perf/quality'

// the viewer's saturation preference, before anything paints
applyVibrance(readVibrance())

const root = document.getElementById('root')!
const SKIP =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('noboot') === '1'

if (SKIP) {
  // Straight to the portfolio (dev / deep-link).
  setIntroActive(false)
  import('./mountPortfolio').then((m) => m.mountPortfolio(root, 'enter'))
} else {
  /* The portfolio mounts NOW, underneath the title screen, not on ENTER.

     The tube shows the live hero, so the hero has to be running for there to be
     anything in it — and covering the load is what a loading screen is for.
     While it is covered it renders at INTRO_DPR, a fraction of the pixels,
     because it is being watched through a television. */
  import('./mountPortfolio').then((m) => m.mountPortfolio(root, 'enter'))
  startIntro({
    onEnter: () => setIntroActive(false),
  })
}
