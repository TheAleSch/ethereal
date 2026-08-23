import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  buildAndVerifyRegistry,
  commandOutput,
  createConsumerFixture,
  installAndCompileRegistryItem,
  makeTemp,
  root,
} from "./registry-smoke-utils.mjs";

const temp = makeTemp("ethereal-registry-published-smoke-");

function publishedVersion(specifier) {
  try {
    return JSON.parse(
      commandOutput("npm", ["view", specifier, "version", "--json"]),
    );
  } catch {
    throw new Error(
      `${specifier} is not publicly available from npm; publish the package before verifying or deploying the registry`,
    );
  }
}

try {
  const packageJson = JSON.parse(
    readFileSync(join(root, "packages/ethereal/package.json"), "utf8"),
  );
  const specifier = `${packageJson.name}@${packageJson.version}`;
  const exactPublishedVersion = publishedVersion(specifier);
  assert.equal(
    exactPublishedVersion,
    packageJson.version,
    `${specifier} is not publicly available from npm`,
  );
  const latestPublishedVersion = publishedVersion(packageJson.name);
  assert.equal(
    latestPublishedVersion,
    packageJson.version,
    `${packageJson.name}@latest is ${latestPublishedVersion}, not ${packageJson.version}`,
  );

  const generated = await buildAndVerifyRegistry(temp);
  assert.deepEqual(
    generated.dependencies,
    [packageJson.name],
    "the published registry item must depend on the package without a local rewrite",
  );
  const fixture = await createConsumerFixture(temp);
  await installAndCompileRegistryItem(fixture, generated);
  console.log(
    `Published ${specifier} registry install and compile verification passed.`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
