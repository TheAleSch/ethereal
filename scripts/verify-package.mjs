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
  run("npm", ["run", "build", "-w", "@theale/ethereal"]);

  const packed = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "-w",
        "@theale/ethereal",
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
          "@theale/ethereal": `file:${tarball}`,
          react: "18.3.1",
          "react-dom": "18.3.1",
        },
        devDependencies: {
          "@types/react": "18.3.12",
          "@types/react-dom": "18.3.1",
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
} from "@theale/ethereal"
import { mergeConfig, subscribe, type Theme } from "@theale/ethereal/core"

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
import * as root from "@theale/ethereal"
import * as core from "@theale/ethereal/core"

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
  const source = readFileSync(new URL(\`./node_modules/@theale/ethereal/dist/\${entry}\`, import.meta.url), "utf8")
  assert.match(source, /^['\"]use client['\"];?/, \`\${entry} must preserve the client boundary\`)
}
`,
  );

  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: fixture,
  });
  run(join(fixture, "node_modules/.bin/tsc"), ["--noEmit"], { cwd: fixture });
  run("node", ["runtime.mjs"], { cwd: fixture });
  console.log("Packed React 18 consumer smoke passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
