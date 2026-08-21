import { defineConfig } from "vitest/config"

// Site tests exercise the package's current TypeScript sources. Resolving the
// workspace dependency normally follows its package export to gitignored
// `dist/`, which lets `npm test -w site` bless a previous build.
const etherealSource = new URL(
  "../../packages/ethereal/src/index.ts",
  import.meta.url
).pathname
const etherealCoreSource = new URL(
  "../../packages/ethereal/src/core/index.ts",
  import.meta.url
).pathname
const siteSource = new URL("./src/", import.meta.url).pathname

/** Unit tests run against the site's PURE modules only, so they deliberately
 *  do NOT load `vite.config.ts`: that config boots the TanStack Start plugin,
 *  the prerenderer and the devtools console-piping transport, none of which a
 *  parser test needs and all of which make `vitest run` slow and flaky.
 *  Files that need a DOM opt in per-file with `// @vitest-environment jsdom`. */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@theale\/ethereal\/core$/, replacement: etherealCoreSource },
      { find: /^@theale\/ethereal$/, replacement: etherealSource },
      { find: /^@\//, replacement: siteSource },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
