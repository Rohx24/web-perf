import { BootScreen } from './BootScreen'

/**
 * Shows the CRT start screen over the site. Persistent for now — no automatic
 * transition (its purpose/interaction is still to be defined). The real site
 * mounts behind it so it's warm when we eventually reveal it.
 *
 * `?noboot=1` bypasses the start screen to view the site directly.
 */

const SKIP =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('noboot') === '1'

export function BootGate ({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {!SKIP && <BootScreen />}
    </>
  )
}
