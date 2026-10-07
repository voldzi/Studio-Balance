# Reviewed dependency patch

`braces@3.0.3.patch` addresses only
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
the stack-exhaustion issue in recursive brace AST walkers. On 2026-10-07 the
reviewed GitHub advisory lists no patched release, upstream
[issue 70](https://github.com/micromatch/braces/issues/70) remains open and
the package master is still 3.0.3 without a depth guard. Registry audit metadata
suggests 3.0.4, but that version cannot be installed. Micromatch 4.0.8 still
depends on braces; replacing the glob engine would broaden this correction.

The local patch adds a fixed bound of 100 brace/parenthesis AST containers in
the parser and recursive compile/expand/stringify walkers. Escaped braces,
quoted strings, character classes and ordinary shallow globs retain existing
semantics. Direct AST inputs are bounded as well. This is a local security
correction, not a claim that upstream 3.0.3 is fixed. It does not change the
existing expansion cardinality/length rules or solve unrelated glob concerns.

`braces@3.0.3.security.json` pins SHA-256 hashes of the patch and the five
installed files. `node scripts/verify-dependency-patches.mjs` resolves the real
Next ESLint → fast-glob → micromatch → braces dependency path, checks configured
and locked patch delivery, compares installed bytes, and runs 122 assertions
in a child process with a ten-second hard timeout. Tests cover depth-4000 PoCs
under the character cap, mixed/parenthesis-only and malformed input, direct
AST/cycles, depth boundaries, literals and normal glob/range behavior.

`node scripts/audit-dependencies.mjs` reruns that proof before requesting the
unfiltered registry audit. Only the exact GHSA, package, 3.0.3 version and
development-only ESLint path can receive a printed, explicit patch exception.
No persistent audit ignore is configured. Another GHSA, production path,
unpatched version, missing patch, registry error or new high/critical finding
fails the gate. `node --test scripts/dependency-audit.test.mjs` verifies those
denials. The output preserves upstream vulnerability counts and never claims
an unqualified clean audit.

Remove this patch and its exception when a reviewed published upstream fix
can be installed and passes the same regressions. Keep the exact patch in
Docker's dependency stage before frozen installation. The package currently
belongs to development lint tooling, not the production request path.
