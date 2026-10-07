// Run only in a bounded child process: a regression must not hang the CI runner.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

const load = createRequire(resolve(process.argv[2], "package.json"));
const braces = load("./index.js");
let assertions = 0;
const rejectDepth = (operation) => {
  const started = performance.now();
  assert.throws(operation, (error) => error instanceof SyntaxError && error.message === "Input nesting depth exceeds max depth (100)");
  assert.ok(performance.now() - started < 1_000, "Deep input must reject promptly");
  assertions += 2;
};
const nesting = (depth, opening = "{", closing = "}") => opening.repeat(depth) + "x" + closing.repeat(depth);

for (const pattern of [nesting(101), nesting(4_000), nesting(4_000, "(", ")"), "{(".repeat(2_000) + "x" + ")}".repeat(2_000), "{".repeat(4_000), "(".repeat(4_000)]) {
  assert.ok(pattern.length < 10_000, "PoCs exercise depth, not the existing length cap");
  assertions++;
  for (const operation of [(input) => braces(input), braces.compile, braces.expand, braces.stringify, braces.parse]) rejectDepth(() => operation(pattern));
  rejectDepth(() => braces.parse(pattern, { maxDepth: Infinity, maxLength: Infinity }));
}

const ast = () => {
  const root = { type: "root", nodes: [] };
  let current = root;
  for (let depth = 0; depth < 4_000; depth++) {
    const child = { type: "root", nodes: [] };
    current.nodes.push(child);
    current = child;
  }
  current.nodes.push({ type: "text", value: "x" });
  return root;
};
for (const operation of [braces.compile, braces.expand, braces.stringify]) {
  rejectDepth(() => operation(ast()));
  const cyclic = { type: "root", nodes: [] };
  cyclic.nodes.push(cyclic);
  rejectDepth(() => operation(cyclic));
}

for (const pattern of [nesting(100), nesting(100, "(", ")"), "{(".repeat(50) + "x" + ")}".repeat(50)]) {
  for (const operation of [braces.compile, braces.expand, braces.stringify, braces.parse]) { assert.doesNotThrow(() => operation(pattern)); assertions++; }
}
for (const pattern of ["\\{".repeat(1_000), '"' + nesting(1_000) + '"', "[" + "{".repeat(1_000) + "]"]) {
  for (const operation of [braces.compile, braces.expand, braces.stringify, braces.parse]) { assert.doesNotThrow(() => operation(pattern)); assertions++; }
}
assert.deepEqual(braces.expand("x/{a,b}/{1..3}"), ["x/a/1", "x/a/2", "x/a/3", "x/b/1", "x/b/2", "x/b/3"]);
assert.deepEqual(braces.expand("src/**/*.{ts,tsx}"), ["src/**/*.ts", "src/**/*.tsx"]);
assert.deepEqual(braces.expand("a/{b,{c,d}}/e"), ["a/b/e", "a/c/e", "a/d/e"]);
assert.equal(braces.stringify(braces.parse("a/{b,c}/d")), "a/{b,c}/d");
const compiled = new RegExp(`^(?:${braces.compile("x/{a,b}/{1..3}")})$`);
assert.equal(compiled.test("x/a/1"), true);
assert.equal(compiled.test("x/c/1"), false);
assert.throws(() => braces.expand("{1..10000}"), /range limit/u);
assert.throws(() => braces.parse("x".repeat(10_001)), /max characters/u);
assertions += 8;
console.log(JSON.stringify({ result: "passed", assertions }));
