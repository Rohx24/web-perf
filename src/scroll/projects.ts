/**
 * The work shown in the project void, front to back.
 *
 * Titles are Rohit's real projects. Blurbs and tech tags are a first pass — copy,
 * meant to be edited here without touching any layout code. `accent` drives the
 * card art and glow; keep them roughly even in luminance. `launchUrl` is the
 * live site (wired to a "Visit" affordance once each is confirmed).
 */

export type Project = {
  index: string
  title: string
  categoryTag: string
  blurb: string
  tech: string[]
  accent: string
  launchUrl?: string
  /**
   * Preview screenshot shown on the project pane (and echoed, blurred, onto the
   * wall behind it). A path under public/. Omit for a project whose art is not
   * ready — the pane then draws a generated accent placeholder instead, so the
   * slot still works and a real image can be dropped in here later.
   */
  image?: string
}

export const PROJECTS: Project[] = [
  {
    index: '01',
    title: 'Satark.ai',
    categoryTag: 'AI · Safety',
    blurb: 'Real-time scam and fraud detection that flags malicious calls, links and messages before they land.',
    tech: ['Python', 'NLP', 'Transformers', 'FastAPI'],
    accent: '#10b981',
    launchUrl: 'https://adaptive-honeypot-agent.vercel.app/',
    image: '/previews/satark.webp',
  },
  {
    index: '02',
    title: 'BhashaBuddy',
    categoryTag: 'AI · Language',
    blurb: 'A conversational language companion that adapts to the learner, turning practice into a natural dialogue.',
    tech: ['LLMs', 'Speech', 'React', 'Python'],
    // Light/pastel site — warm coral is its strongest colour.
    accent: '#FB8C6B',
    launchUrl: 'https://parampara-one.vercel.app/',
    image: '/previews/bhashabuddy.webp',
  },
  {
    index: '03',
    title: 'Parallel Risk-Assessment Agents',
    categoryTag: 'AI · Agents',
    blurb: 'A swarm of agents evaluating a decision from many angles at once, then reconciling into a single risk read.',
    tech: ['Multi-Agent', 'LLMs', 'Orchestration'],
    accent: '#8b5cf6',
    launchUrl: 'https://prism-risk-rho.vercel.app/',
    image: '/previews/parallel-risk.webp',
  },
  {
    index: '04',
    title: 'AI Boardroom',
    categoryTag: 'AI · Agents',
    blurb: 'A panel of AI personas that pressure-tests an idea like a real board — CEO, VC and engineers arguing it out.',
    tech: ['LLMs', 'Agents', 'Prompt Systems'],
    // Dark site with warm gold/amber accents.
    accent: '#D6A34E',
    launchUrl: 'https://ai-boardroom-umber.vercel.app/',
    image: '/previews/ai-boardroom.webp',
  },
]
