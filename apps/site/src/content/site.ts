// Site-wide identity, in one place. Consumed by the route <head>s, the JSON-LD
// block, the sitemap and the generated markdown — every one of which was a
// separate opportunity to write a different URL or description.

export const SITE = {
  url: "https://ethereal.ale.design",
  repo: "https://github.com/TheAleSch/ethereal",
  pkg: "@theale/ethereal",
  author: "Alexandre Schrammel",
  authorUrl: "https://ale.design",
  license: "MIT",
  title: "Ethereal — travelling-light glow components for React",
  /** one sentence; used as the meta description and the llms.txt blockquote */
  tagline:
    "Travelling-light borders and black-hole accretion glows as React components — pure CSS gradients and masks by default, with a dithered-canvas renderer alongside, all driven by one shared 60fps loop for every mounted instance.",
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
    title: "Documentation — @theale/ethereal",
    description:
      "Full API reference for <Ethereal>, <EventHorizon> and <EtherealDither>: every prop, the named-state and per-theme config system, theme resolution, and the host contract.",
    priority: 0.9,
  },
  {
    path: "/playground",
    title: "Playground — @theale/ethereal",
    description:
      "Tune Ethereal and Event Horizon glow effects live, copy the exact JSX, and share the configuration by URL.",
    priority: 0.8,
  },
]

export const abs = (path: string) => SITE.url + (path === "/" ? "" : path)
