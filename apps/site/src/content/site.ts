// Site-wide identity, in one place. Consumed by the route <head>s, the JSON-LD
// block, the sitemap and the generated markdown — every one of which was a
// separate opportunity to write a different URL or description.

export const SITE = {
  url: "https://ethereal.ale.design",
  repo: "https://github.com/TheAleSch/ethereal",
  pkg: "ethereal-glow",
  author: "Alexandre Schrammel",
  authorUrl: "https://ale.design",
  license: "MIT",
  title: "Ethereal — glow effects for React",
  /** one sentence; used as the meta description and the llms.txt blockquote */
  tagline:
    "React components for animated glow borders and black-hole light effects. Pure CSS, zero dependencies, SSR-safe, one shared 60fps loop. Install from npm or the shadcn registry.",
} as const

export type RouteMeta = {
  path: string
  title: string
  description: string
  /** relative priority for sitemap.xml */
  priority: number
}

export const ROUTES: RouteMeta[] = [
  {
    path: "/",
    title: SITE.title,
    description: SITE.tagline,
    priority: 1,
  },
  {
    path: "/docs",
    title: "Documentation — ethereal-glow",
    description:
      "Full API reference for <Ethereal>, <EventHorizon> and <EtherealDither>: every prop, the named-state and per-theme config system, theme resolution, and the host contract.",
    priority: 0.9,
  },
  {
    path: "/playground",
    title: "Playground — ethereal-glow",
    description:
      "Tune Ethereal and Event Horizon glow effects live, copy the exact JSX, and share the configuration by URL.",
    priority: 0.8,
  },
]

export const abs = (path: string) => SITE.url + (path === "/" ? "" : path)
