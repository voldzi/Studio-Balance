import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateAudit } from "./audit-dependencies.mjs";

const advisory = {
  module_name: "braces", severity: "high", github_advisory_id: "GHSA-vfj7-8cjw-p6xm",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  findings: [{ version: "3.0.3", dev: true, paths: [".>@next/eslint-plugin-next>fast-glob>micromatch>braces"] }]
};
const proof = { advisory: advisory.github_advisory_id, package: "braces", version: "3.0.3", assertions: 122 };
const report = (item) => ({ advisories: { test: item }, metadata: { vulnerabilities: { high: 1 } } });

test("requires current patch evidence before accepting the exact development advisory", () => {
  assert.equal(evaluateAudit(report(advisory), undefined).passed, false);
  assert.equal(evaluateAudit(report(advisory), { ...proof, assertions: 0 }).passed, false);
  const result = evaluateAudit(report(advisory), proof);
  assert.equal(result.passed, true);
  assert.equal(result.exceptions.length, 1);
});

test("never exempts another advisory, version, package, URL or production path", () => {
  const changes = [
    { github_advisory_id: "GHSA-other-advisory" }, { module_name: "other" }, { url: "https://attacker.example" },
    { findings: [{ ...advisory.findings[0], version: "3.0.2" }] },
    { findings: [{ ...advisory.findings[0], dev: false }] },
    { findings: [{ ...advisory.findings[0], paths: ["apps__api>runtime>braces"] }] },
    { findings: [] }
  ];
  for (const change of changes) assert.equal(evaluateAudit(report({ ...advisory, ...change }), proof).passed, false);
  const mixed = report(advisory);
  mixed.advisories.other = { ...advisory, github_advisory_id: "GHSA-new-vulnerability", module_name: "other" };
  assert.equal(evaluateAudit(mixed, proof).passed, false);
});

test("fails closed on registry errors or unexpected severity instead of treating them as a clean audit", () => {
  assert.throws(() => evaluateAudit({ error: { code: "Registry unavailable" } }, proof), /Registry audit failed/u);
  assert.throws(() => evaluateAudit(report({ ...advisory, severity: "unknown" }), proof), /Unrecognized registry finding/u);
  assert.throws(() => evaluateAudit({ advisories: {}, metadata: { vulnerabilities: { high: 1 } } }, proof), /without their findings/u);
});
