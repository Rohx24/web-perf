import './index.css'
import { startIntro } from './intro/intro'
import { setIntroActive } from './perf/introState'
import { applyVibrance, readVibrance } from './perf/quality'

// the viewer's saturation preference, before anything paints
applyVibrance(readVibrance())

const root = document.getElementById('root')!

/* The title screen plays once per visit. After ENTER, coming back to the home
   page from Work, Lab or the résumé lands straight on the hero; only a reload
   (or a new tab) brings the title screen back. */
const SEEN_KEY = 'rd.introSeen'
function seenThisVisit(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return sessionStorage.getItem(SEEN_KEY) === '1' && nav?.type !== 'reload'
  } catch {
    return false
  }
}
function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    // storage blocked: the title screen just plays again next time
  }
}

const SKIP =
  typeof window !== 'undefined' &&
  (new URLSearchParams(window.location.search).get('noboot') === '1' || seenThisVisit())

if (SKIP) {
  // Straight to the portfolio (a return visit this session, dev, or a deep link).
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
    onEnter: () => {
      markSeen()
      setIntroActive(false)
    },
  })
}
