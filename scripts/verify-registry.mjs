import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
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
const temp = mkdtempSync(join(tmpdir(), "ethereal-registry-smoke-"));

function run(command, args, cwd = root) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

const generatedDir = join(temp, "generated");
const fixture = join(temp, "consumer");
let server;

try {
  await run("npx", [
    "--no-install",
    "shadcn",
    "build",
    "registry.json",
    "-o",
    generatedDir,
  ]);
  const generatedPath = join(generatedDir, "ethereal.json");
  const trackedPath = join(root, "apps/site/public/r/ethereal.json");
  const generated = JSON.parse(readFileSync(generatedPath, "utf8"));
  const tracked = JSON.parse(readFileSync(trackedPath, "utf8"));
  assert.deepEqual(
    canonical(tracked),
    canonical(generated),
    "apps/site/public/r/ethereal.json is stale; run `npm run registry:build`",
  );
  const generatedIndex = JSON.parse(
    readFileSync(join(generatedDir, "registry.json"), "utf8"),
  );
  const trackedIndex = JSON.parse(
    readFileSync(join(root, "apps/site/public/r/registry.json"), "utf8"),
  );
  assert.deepEqual(
    canonical(trackedIndex),
    canonical(generatedIndex),
    "apps/site/public/r/registry.json is stale; run `npm run registry:build`",
  );

  await run("npm", ["run", "build", "-w", "@theale/ethereal"]);
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
      { cwd: root, encoding: "utf8" },
    ),
  );
  assert.equal(packed.length, 1, "npm pack should create exactly one tarball");
  const tarball = join(temp, packed[0].filename);
  const smokeItem = JSON.stringify({
    ...generated,
    dependencies: [`file:${tarball}`],
  });

  mkdirSync(fixture);
  writeFileSync(
    join(fixture, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          clsx: "2.1.1",
          react: "18.3.1",
          "react-dom": "18.3.1",
          "tailwind-merge": "3.6.0",
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
    join(fixture, "components.json"),
    JSON.stringify(
      {
        $schema: "https://ui.shadcn.com/schema.json",
        style: "base-nova",
        rsc: false,
        tsx: true,
        tailwind: {
          config: "",
          css: "src/styles.css",
          baseColor: "neutral",
          cssVariables: true,
          prefix: "",
        },
        iconLibrary: "lucide",
        aliases: {
          components: "@/components",
          utils: "@/lib/utils",
          ui: "@/components/ui",
          lib: "@/lib",
          hooks: "@/hooks",
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
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      },
      null,
      2,
    ),
  );
  mkdirSync(join(fixture, "src/lib"), { recursive: true });
  writeFileSync(
    join(fixture, "src/lib/utils.ts"),
    `import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
`,
  );
  writeFileSync(join(fixture, "src/styles.css"), "");
  writeFileSync(
    join(fixture, "src/consumer.tsx"),
    `import { EtherealButton } from "@/components/ui/ethereal-button"
export const example = <EtherealButton glow={{ state: "thinking" }}>Go</EtherealButton>
`,
  );
  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    fixture,
  );

  server = createServer((request, response) => {
    if (request.url !== "/r/ethereal.json") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(smokeItem);
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  await run("npx", [
    "--no-install",
    "shadcn",
    "add",
    `http://127.0.0.1:${address.port}/r/ethereal.json`,
    "--yes",
    "--overwrite",
    "--cwd",
    fixture,
  ]);
  await run("npx", ["--no-install", "tsc", "--noEmit"], fixture);
  console.log("Registry generation, install, and compile smoke passed.");
} finally {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(temp, { recursive: true, force: true });
}
