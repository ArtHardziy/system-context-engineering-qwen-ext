import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("launchers are bounded and forward arguments", async () => {
  for (const name of [
    "system-context-engineering",
    "system-context-engineering-check",
    "system-context-engineering-update",
    "system-context-engineering-task",
  ]) {
    const contents = await read(`commands/${name}.md`);
    assert.match(contents, /^---\ndescription: .+\n---\n/);
    assert.match(contents, /\{\{args}}/);
    assert.match(contents, /system-context-engineering/);
  }
});

test("documentation lifecycle defines deterministic update and freshness states", async () => {
  const lifecycle = await read(
    "skills/system-context-engineering/references/documentation-lifecycle.md",
  );
  for (const term of [
    "current",
    "stale",
    "partial",
    "unknown",
    "check-system-context.mjs",
    "Save `.agent/system-context-state.json` only after",
    "Do not rewrite documentation",
  ]) {
    assert.ok(lifecycle.includes(term), term);
  }
});

test("output contract provides compact human and machine routing", async () => {
  const contract = await read(
    "skills/system-context-engineering/references/system-context-contract.md",
  );
  for (const term of [
    "SYSTEM-SPEC.md",
    "SERVICE-CATALOG.md",
    "SERVICE-INDEX.json",
    "routing",
    "managed:start",
  ]) {
    assert.ok(contract.includes(term), term);
  }
});

test("skill preserves service context as canonical and limits broad reads", async () => {
  const skill = await read("skills/system-context-engineering/SKILL.md");
  assert.match(skill, /canonical source for that service/);
  assert.match(skill, /Do not load every service specification in full by default/);
  assert.match(skill, /Do not modify service source code or service-level context/);
  assert.match(skill, /Never report the aggregate as current/);
});
