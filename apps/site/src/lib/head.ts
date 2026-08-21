// Per-route <head> built from ROUTES, so the title/description/canonical/OG
// set can never disagree with the sitemap or llms.txt — they all read the same
// table in src/content/site.ts.

import { ROUTES, SITE, abs } from "@/content/site"

/** Meta + links for one route. Spread into a route's `head()`. */
export function pageHead(path: string) {
  const route = ROUTES.find((r) => r.path === path)
  const title = route?.title ?? SITE.title
  const description = route?.description ?? SITE.tagline
  const url = abs(path)

  return {
    meta: [
      { title },
      { name: "description", content: description },
      // Open Graph — what gets shown when the link is pasted anywhere.
      // og:type / og:site_name / twitter:card are invariant and live on the
      // root route instead.
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: url }],
  }
}

/**
 * Schema.org description of the package. Gives a model (or a search engine)
 * the identity, license and repo without having to infer them from prose.
 */
export const softwareJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: SITE.pkg,
  description: SITE.tagline,
  codeRepository: SITE.repo,
  url: SITE.url,
  programmingLanguage: "TypeScript",
  runtimePlatform: "React",
  license: "https://opensource.org/licenses/MIT",
  author: { "@type": "Person", name: SITE.author, url: SITE.authorUrl },
  keywords: [
    "react",
    "css",
    "animation",
    "glow",
    "border-beam",
    "shadcn",
    "ui-components",
  ],
})
