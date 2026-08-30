import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";

import {
  buildAndVerifyRegistry,
  commandOutput,
  createConsumerFixture,
  installAndCompileRegistryItem,
  makeTemp,
  run,
} from "./registry-smoke-utils.mjs";

const temp = makeTemp("ethereal-registry-local-smoke-");

try {
  const generated = await buildAndVerifyRegistry(temp);
  await run("npm", ["run", "build", "-w", "ethereal-glow"]);
  const packed = JSON.parse(
    commandOutput("npm", [
      "pack",
      "-w",
      "ethereal-glow",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      temp,
    ]),
  );
  assert.equal(packed.length, 1, "npm pack should create exactly one tarball");
  const tarball = join(temp, packed[0].filename);
  const localItem = {
    ...generated,
    // Local CI deliberately tests the unpublished working tree. The separate
    // post-publish gate installs this item without rewriting dependencies.
    dependencies: [`file:${tarball}`],
  };
  const fixture = await createConsumerFixture(temp);
  await installAndCompileRegistryItem(fixture, localItem);
  console.log(
    "Local-tarball registry generation, install, and compile smoke passed.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
