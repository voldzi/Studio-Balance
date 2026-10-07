import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function verifyDependencyPatches() {
  const record = JSON.parse(readFileSync(resolve(root, "patches/braces@3.0.3.security.json"), "utf8"));
  assert.equal(record.advisory, "GHSA-vfj7-8cjw-p6xm");
  assert.equal(record.package, "braces");
  assert.equal(record.version, "3.0.3");
  assert.equal(record.maximumContainerDepth, 100);
  assert.equal(record.patch, "patches/braces@3.0.3.patch");
  assert.equal(sha256(readFileSync(resolve(root, record.patch))), record.patchSha256, "Security patch bytes changed without reviewed evidence");

  const workspace = readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8");
  const lockfile = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");
  assert.ok(/patchedDependencies:\s*\n\s*['"]?braces@3\.0\.3['"]?:\s*['"]?patches\/braces@3\.0\.3\.patch['"]?/u.test(workspace), "The exact security patch must be configured");
  // Pinned pnpm 11 stores the patch SHA-256 directly rather than a path/hash map.
  const lockedPatches = lockfile.match(/^patchedDependencies:\n((?: {2}.*\n)+)/mu)?.[1];
  assert.ok(lockedPatches?.includes(`  braces@3.0.3: ${record.patchSha256}\n`), "The exact patch hash must also be pinned in the lockfile");
  assert.ok(lockfile.includes(`braces@3.0.3(patch_hash=${record.patchSha256})`), "The dependency snapshot must use the pinned patch");

  // Resolve the real installed advisory path, rather than a copied fixture or a
  // stale package directory left in pnpm's store after another installation.
  let require = createRequire(resolve(root, "package.json"));
  for (const dependency of ["@next/eslint-plugin-next", "fast-glob", "micromatch"]) {
    require = createRequire(require.resolve(`${dependency}/package.json`));
  }
  const packageJson = require.resolve("braces/package.json");
  const directory = dirname(packageJson);
  assert.equal(JSON.parse(readFileSync(packageJson, "utf8")).version, record.version);
  assert.deepEqual(Object.keys(record.files).sort(), ["lib/compile.js", "lib/constants.js", "lib/expand.js", "lib/parse.js", "lib/stringify.js"], "All five security patch files must be verified");
  for (const [file, expectedHash] of Object.entries(record.files)) {
    assert.equal(sha256(readFileSync(resolve(directory, file))), expectedHash, `Installed braces ${file} is not the reviewed patch`);
  }

  const check = spawnSync(process.execPath, [resolve(root, "scripts/test-braces-depth.mjs"), directory], {
    cwd: root, encoding: "utf8", timeout: 10_000, maxBuffer: 128 * 1024
  });
  assert.equal(check.error, undefined, "Depth regression timed out or failed to start");
  assert.equal(check.status, 0, `Depth regression failed: ${check.stderr || check.stdout}`);
  const evidence = JSON.parse(check.stdout);
  assert.equal(evidence.result, "passed");
  assert.ok(evidence.assertions >= 40, "The complete regression matrix must run");
  return { advisory: record.advisory, package: record.package, version: record.version, assertions: evidence.assertions, patchSha256: record.patchSha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyDependencyPatches()));
}
