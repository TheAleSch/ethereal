import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import appCss from "../styles.css?url"

import { cn } from "@/lib/utils"

import { SITE, abs } from "@/content/site"
import { softwareJsonLd } from "@/lib/head"
import { StarBg } from "@/components/star-bg"
import { KonamiAsteroids } from "@/components/konami-asteroids"
import { KonamiTip } from "@/components/konami-tip"
import { Footer } from "@/components/footer"

export const Route = createRootRoute({
  // Only the invariants live here. `meta` is deduped by name/property (a route's
  // entry wins), but `link` is NOT — putting the canonical here emitted two of
  // them on every child route, which is worse than having none.
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Ethereal" },
      { name: "twitter:card", content: "summary_large_image" },
      // fallbacks for the 404; every real route overrides both
      { title: SITE.title },
      { name: "description", content: SITE.tagline },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // point agents at the machine-readable reference from the markup itself,
      // not only from /llms.txt's well-known path
      {
        rel: "alternate",
        type: "text/markdown",
        href: abs("/llms-full.txt"),
        title: "Full reference (markdown)",
      },
      // Event Horizon reduced to a tab-sized mark — see public/favicon.svg and
      // the generator at scripts/build-icons.mjs. The SVG is listed first for
      // the browsers that prefer it; the .ico stays for the ones that only
      // look for /favicon.ico.
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      {
        rel: "icon",
        type: "image/x-icon",
        href: "/favicon.ico",
        sizes: "16x16 24x24 32x32 48x48 64x64",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
      },
      { rel: "manifest", href: "/manifest.json" },
    ],
    scripts: [
      { type: "application/ld+json", children: softwareJsonLd },
      // Google Analytics (gtag.js) — sitewide. SPA route changes are picked up
      // by GA4's enhanced measurement (history events), so no per-route code.
      {
        src: "https://www.googletagmanager.com/gtag/js?id=G-J9T7KWF9P6",
        async: true,
      },
      {
        children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-J9T7KWF9P6');`,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-muted-foreground">
        The requested page could not be found.
      </p>
    </main>
  ),
  shellComponent: RootDocument,
})

// px tightens below sm so the whole pill (4 items + divider) still fits a
// 320px viewport without wrapping — it has no wrap mode, it would just clip
const navLink =
  "inline-flex min-h-11 items-center rounded-full px-2.5 py-1 text-sm font-medium whitespace-nowrap text-white/80 transition-colors hover:text-white sm:px-3 [&.active]:bg-white/10 [&.active]:text-white"

function RootDocument({ children }: { children: React.ReactNode }) {
  // the playground is a fixed-height tool: its main is capped at 100svh and
  // scrolls internally, so a footer after it would add the one bit of page
  // scroll the layout exists to avoid. Its links are all in the nav pill.
  const path = useRouterState({ select: (s) => s.location.pathname })
  const chrome = !path.startsWith("/playground")
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body
        className={cn(
          // flex column so the footer is pinned to the bottom of the viewport
          // on short pages instead of floating up under the content. Every
          // other body child (StarBg, the nav pill, the konami bits) is fixed,
          // so only the page wrapper and the footer are in flow.
          "flex min-h-svh flex-col bg-background text-foreground antialiased",
          !chrome && "lg:h-svh lg:overflow-hidden"
        )}
      >
        <StarBg />
        {/* floating pill toolbar — fixed, and deliberately NOT given a spacer
            wrapper: reserving a band would push each page's top-anchored
            backdrop (the hero's ambient wash is `absolute top-0`) down and
            leave a bare stripe above it. Pages that would otherwise start
            under the pill carry their own top padding instead. */}
        <nav className="fixed top-4 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/10 bg-black/40 p-1.5 text-white backdrop-blur-md sm:top-6 sm:gap-1">
          <Link to="/" className={navLink} activeOptions={{ exact: true }}>
            Home
          </Link>
          <Link to="/playground" className={navLink}>
            Playground
          </Link>
          <Link to="/docs" className={navLink}>
            Docs
          </Link>
          <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />
          <a
            href="https://github.com/TheAleSch/ethereal"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2.5 py-1 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:px-3"
            aria-label="View on GitHub"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="currentColor"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
        {/* wrapper rather than flex-1 on each route's own <main>: it holds
            whatever the route renders, so no page has to opt in */}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        {chrome && <Footer />}
        <KonamiAsteroids />
        <KonamiTip />
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
