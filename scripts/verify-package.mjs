import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "ethereal-package-smoke-"));

// npm run exports the caller's npm config as npm_config_* env vars; nested
// npm treats those as CLI flags and rejects ones like allow-scripts, so
// child processes get a scrubbed environment.
// (npx would re-read user config and re-export it to its children, undoing
// the scrub — so local bins are invoked directly instead of through npx.)
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("npm_config_")),
);

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: cleanEnv,
    ...options,
  });
}

try {
  run("npm", ["run", "build", "-w", "ethereal-glow"]);

  const packed = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "-w",
        "ethereal-glow",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        temp,
      ],
      { cwd: root, encoding: "utf8", env: cleanEnv },
    ),
  );
  assert.equal(packed.length, 1, "npm pack should create exactly one tarball");
  const tarball = join(temp, packed[0].filename);
  const fixture = join(temp, "consumer");

  mkdirSync(fixture);
  writeFileSync(
    join(fixture, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "ethereal-glow": `file:${tarball}`,
          react: "18.3.1",
          "react-dom": "18.3.1",
        },
        devDependencies: {
          "@types/react": "18.3.12",
          "@types/react-dom": "18.3.1",
          jsdom: "28.1.0",
          typescript: "5.9.3",
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(fixture, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ["consumer.tsx"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(fixture, "consumer.tsx"),
    `import {
  Ethereal,
  EtherealWrap,
  EventHorizon,
  EventHorizonWrap,
  EtherealDither,
  EtherealDitherWrap,
  type EtherealProps,
} from "ethereal-glow"
import { mergeConfig, subscribe, type Theme } from "ethereal-glow/core"

const props: EtherealProps = { path: "around", state: "thinking" }
const theme: Theme = "dark"
void theme
void mergeConfig
void subscribe
export const effects = [
  <Ethereal {...props} />,
  <EtherealWrap><button>one</button></EtherealWrap>,
  <EventHorizon />,
  <EventHorizonWrap><button>two</button></EventHorizonWrap>,
  <EtherealDither />,
  <EtherealDitherWrap><button>three</button></EtherealDitherWrap>,
]
`,
  );
  writeFileSync(
    join(fixture, "runtime.mjs"),
    `import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import * as root from "ethereal-glow"
import * as core from "ethereal-glow/core"

assert.equal(root.setTickRate, core.setTickRate, "root and core must share the ticker exports")
assert.equal(root.getTickRate, core.getTickRate, "root and core must share ticker state")
const previous = root.getTickRate()
core.setTickRate(37)
assert.equal(root.getTickRate(), 37, "a core write must be visible through the root entry")
root.setTickRate(previous)

for (const component of [root.Ethereal, root.EventHorizon, root.EtherealDither]) {
  assert.match(renderToString(createElement("button", null, createElement(component))), /<button/)
}

for (const entry of ["index.js", "core.js"]) {
  const source = readFileSync(new URL(\`./node_modules/ethereal-glow/dist/\${entry}\`, import.meta.url), "utf8")
  assert.match(source, /^['\"]use client['\"];?/, \`\${entry} must preserve the client boundary\`)
}
`,
  );

  // The SSR smoke above never runs an effect, an observer, a ticker frame or
  // an unmount — a React-19-only CLIENT lifecycle assumption would sail
  // through it. Mount and unmount the packed components under React 18's
  // real client runtime (jsdom DOM, driven rAF frames) as well.
  writeFileSync(
    join(fixture, "runtime-client.mjs"),
    `import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM('<main id="app"></main>', { url: "https://consumer.test/", pretendToBeVisual: true })
const g = globalThis
g.window = dom.window
g.document = dom.window.document
g.HTMLElement = dom.window.HTMLElement
g.HTMLCanvasElement = dom.window.HTMLCanvasElement
g.Element = dom.window.Element
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
g.IS_REACT_ACT_ENVIRONMENT = true
let pendingFrame = null
g.requestAnimationFrame = (cb) => { pendingFrame = cb; return 1 }
g.cancelAnimationFrame = () => { pendingFrame = null }
g.matchMedia = (media) => ({
  media, matches: false, onchange: null,
  addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {},
  dispatchEvent: () => false,
})
class Noop { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } }
g.ResizeObserver = Noop
g.IntersectionObserver = Noop
g.MutationObserver = dom.window.MutationObserver
// the package reads these off window, not the global object
dom.window.matchMedia = g.matchMedia
dom.window.ResizeObserver = Noop
dom.window.IntersectionObserver = Noop
dom.window.requestAnimationFrame = g.requestAnimationFrame
dom.window.cancelAnimationFrame = g.cancelAnimationFrame
dom.window.HTMLCanvasElement.prototype.getContext = () => null

const { createElement, act } = await import("react")
const { createRoot } = await import("react-dom/client")
const pkg = await import("ethereal-glow")

const host = dom.window.document.getElementById("app")
for (const name of ["EtherealWrap", "EventHorizonWrap", "EtherealDitherWrap"]) {
  const container = dom.window.document.createElement("div")
  host.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(pkg[name], null, createElement("button", null, name)))
  })
  assert.ok(
    container.querySelectorAll("*").length > 2,
    name + " must build its client layers on mount under React 18"
  )
  // drive one ticker frame through the mounted instance
  if (pendingFrame) await act(async () => { pendingFrame(16) })
  await act(async () => { root.unmount() })
  assert.equal(container.childNodes.length, 0, name + " must unmount cleanly")
}
console.log("client runtime mounted, ticked and unmounted all wrappers")
`,
  );
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: fixture,
  });
  run(join(fixture, "node_modules/.bin/tsc"), ["--noEmit"], { cwd: fixture });
  run("node", ["runtime.mjs"], { cwd: fixture });
  run("node", ["runtime-client.mjs"], { cwd: fixture });
  console.log("Packed React 18 consumer smoke passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
