import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { aiEndpoints } from "./vite-ai-endpoints"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // TanStack Start prerenders through a temporary Vite preview server. Bind
  // it explicitly to IPv4 so Node does not resolve `localhost` to ::1 while
  // the preview listener is on 127.0.0.1 (a repeatable macOS build failure).
  preview: { host: "127.0.0.1" },
  plugins: [
    // Console piping relays every browser console call to the dev server, and
    // the server's own log back to the browser — which re-logs it, which pipes
    // it again. One console.error (Base UI's uncontrolled-Accordion warning on
    // /playground) is enough to start an exponential echo that pegs the CPU,
    // floods the terminal until the dev server gets killed, and times out
    // unrelated clicks in the e2e. Opt-in only.
    devtools({
      consolePiping: { enabled: Boolean(process.env.ETHEREAL_CONSOLE_PIPING) },
    }),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        // crawlLinks follows every same-origin href, including the /docs.md
        // link in the "Copy as Markdown" menu — those are static files in
        // public/, not routes, and asking the prerenderer to render one hangs
        // the build. Anything with a file extension is an asset.
        filter: ({ path }: { path: string }) => !/\.[a-z0-9]+$/i.test(path),
      },
    }),
    viteReact(),
    // last: it only writes files, and slotting a plugin ahead of
    // tanstackStart() perturbs the ordering its prerender step depends on
    aiEndpoints(),
  ],
})

export default config
