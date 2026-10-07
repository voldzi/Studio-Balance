import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyDependencyPatches } from "./verify-dependency-patches.mjs";

const advisoryId = "GHSA-vfj7-8cjw-p6xm";
const advisoryUrl = `https://github.com/advisories/${advisoryId}`;
const developmentPath = ".>@next/eslint-plugin-next>fast-glob>micromatch>braces";

export function evaluateAudit(report, verifiedPatch) {
  assert.ok(report && typeof report === "object" && report.advisories && report.metadata?.vulnerabilities, "Registry audit failed or returned an unsupported report");
  assert.equal(report.error, undefined, "Registry audit failed");
  assert.equal(Array.isArray(report.advisories), false, "Unsupported registry advisory collection");
  const findings = Object.values(report.advisories);
  const high = report.metadata.vulnerabilities.high ?? 0;
  const critical = report.metadata.vulnerabilities.critical ?? 0;
  assert.ok(Number.isSafeInteger(high) && high >= 0 && Number.isSafeInteger(critical) && critical >= 0, "Unsupported registry vulnerability counts");
  assert.ok(findings.length > 0 || high + critical === 0, "Registry reported vulnerabilities without their findings");
  const exceptions = [];
  const remaining = [];
  for (const advisory of findings) {
    assert.ok(advisory && ["info", "low", "moderate", "high", "critical"].includes(advisory.severity), "Unrecognized registry finding");
    const patched = verifiedPatch?.advisory === advisoryId && verifiedPatch.package === "braces" && verifiedPatch.version === "3.0.3" && verifiedPatch.assertions >= 40;
    const exact = patched && advisory.github_advisory_id === advisoryId && advisory.url === advisoryUrl && advisory.module_name === "braces" &&
      Array.isArray(advisory.findings) && advisory.findings.length > 0 && advisory.findings.every((finding) => finding.version === "3.0.3" && finding.dev === true &&
        Array.isArray(finding.paths) && finding.paths.length > 0 && finding.paths.every((path) => path === developmentPath));
    if (exact) exceptions.push({ advisory: advisoryId, package: "braces", version: "3.0.3", reason: "Reviewed installed depth guard passed its bounded regression matrix; upstream has no published fix." });
    else remaining.push({ advisory: advisory.github_advisory_id, package: advisory.module_name, severity: advisory.severity, url: advisory.url });
  }
  return { exceptions, remaining, passed: remaining.every((finding) => finding.severity !== "high" && finding.severity !== "critical") };
}

function main() {
  // No persistent audit ignore and no --ignore-unfixable/registry-errors: an
  // exception is possible only after exact installed bytes and PoCs pass now.
  const verifiedPatch = verifyDependencyPatches();
  const result = spawnSync("pnpm", ["audit", "--json", "--audit-level=high"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024
  });
  assert.equal(result.error, undefined, "Registry audit did not complete");
  assert.ok(result.status === 0 || result.status === 1, "Registry audit failed");
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw new Error("Registry audit returned invalid JSON"); }
  const evaluated = evaluateAudit(report, verifiedPatch);
  console.log(JSON.stringify({ ...evaluated, verifiedPatch, upstreamVulnerabilities: report.metadata.vulnerabilities }, null, 2));
  if (!evaluated.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
