/**
 * Live download count for a GitHub repo: the sum of every release asset's
 * download_count, read straight from the public API (CORS-open, no token).
 *
 * Cached in sessionStorage so a visitor costs one request, not one per render --
 * the unauthenticated limit is 60 an hour per IP. Resolves to null on any
 * failure, and the caller shows its fallback instead.
 */
const TTL = 30 * 60 * 1000

export async function releaseDownloads(repo: string): Promise<number | null> {
  const key = `rd.dl.${repo}`
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { n: number; t: number } | null
    if (hit && Date.now() - hit.t < TTL) return hit.n
  } catch {
    // storage blocked: fall through to the network
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const releases = (await res.json()) as { assets?: { download_count?: number }[] }[]
    const n = releases.reduce(
      (sum, r) => sum + (r.assets ?? []).reduce((s, a) => s + (a.download_count ?? 0), 0),
      0,
    )
    try {
      sessionStorage.setItem(key, JSON.stringify({ n, t: Date.now() }))
    } catch {
      // storage blocked: the count still shows, it just is not cached
    }
    return n
  } catch {
    return null
  }
}

/**
 * When a user last pushed to any public repo, as an ISO timestamp, or null.
 * Same cache and failure rules as releaseDownloads.
 */
export async function lastPush(user: string): Promise<string | null> {
  const key = `rd.push.${user}`
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { v: string; t: number } | null
    if (hit && Date.now() - hit.t < TTL) return hit.v
  } catch {
    // storage blocked: fall through to the network
  }
  try {
    const res = await fetch(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=1`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const [repo] = (await res.json()) as { pushed_at?: string }[]
    const v = repo?.pushed_at ?? null
    if (v) {
      try {
        sessionStorage.setItem(key, JSON.stringify({ v, t: Date.now() }))
      } catch {
        // not cached, still shown
      }
    }
    return v
  } catch {
    return null
  }
}
