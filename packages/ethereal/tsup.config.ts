import { defineConfig } from 'tsup';

// ESM-only. CJS is deliberately not shipped: esbuild cannot code-split CJS,
// so a `core.cjs` would hold its own full copy of the ticker/theme/state
// singletons — a CJS consumer touching both specifiers would run two tickers,
// with `setTickRate` governing only one of them. Code splitting across the
// two ESM entries is what makes "one rAF loop no matter how many entry points
// a page pulls in" true rather than intended.
export default defineConfig({
  entry: { index: 'src/index.ts', core: 'src/core/index.ts' },
  format: ['esm'],
  dts: true,
  // esbuild drops 'use client' from bundled non-entry modules — without this
  // banner the published files lose the directive and Next.js App Router
  // consumers crash importing from a server component
  banner: { js: "'use client'" },
  clean: true,
  external: ['react', 'react/jsx-runtime'],
  target: 'es2020',
});
