import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const collector = path.join(
  packageRoot,
  "skills/system-context-engineering/scripts/collect-service-contexts.mjs",
);

async function createService(workspace, name, state = "current") {
  const root = path.join(workspace, name);
  await mkdir(path.join(root, "docs/agent"), { recursive: true });
  await mkdir(path.join(root, ".agent"), { recursive: true });
  await writeFile(path.join(root, "AGENTS.md"), `# ${name}\n`);
  await writeFile(
    path.join(root, "docs/agent/PROJECT-SPEC.md"),
    `# ${name} project spec\n`,
  );
  await writeFile(path.join(root, "docs/agent/INDEX.md"), `# ${name} index\n`);
  await writeFile(
    path.join(root, ".agent/documentation-state.yaml"),
    [
      "schema_version: 1",
      "baseline:",
      "  status: complete",
      "verification:",
      "  result: pass",
      "freshness:",
      `  state: ${state}`,
      "",
    ].join("\n"),
  );
  return root;
}

test("collector inventories only known context artifacts deterministically", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "system-context-"));
  try {
    await createService(workspace, "payments");
    await createService(workspace, "orders");
    await writeFile(path.join(workspace, "orders", ".env"), "SECRET=ignored\n");

    const { stdout } = await execFile("node", [
      collector,
      "--root",
      workspace,
    ]);
    const snapshot = JSON.parse(stdout);

    assert.deepEqual(
      snapshot.services.map((service) => service.id),
      ["orders", "payments"],
    );
    assert.equal(snapshot.services[0].lifecycle.freshness, "current");
    assert.equal(snapshot.services[0].lifecycle.baseline_status, "complete");
    assert.equal(snapshot.services[0].lifecycle.verification_result, "pass");
    assert.equal(snapshot.services[0].artifacts.length, 4);
    assert.ok(
      snapshot.services[0].artifacts.every(
        (artifact) => !artifact.path.includes(".env"),
      ),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("snapshot check reports changed context and uses exit code 2", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "system-context-"));
  try {
    const orders = await createService(workspace, "orders");
    const snapshotPath = path.join(workspace, ".agent/system-context-state.json");
    await execFile("node", [
      collector,
      "--root",
      workspace,
      "--output",
      snapshotPath,
    ]);

    const current = await execFile("node", [
      collector,
      "--root",
      workspace,
      "--check",
      snapshotPath,
    ]);
    assert.equal(JSON.parse(current.stdout).state, "current");

    await writeFile(
      path.join(orders, "docs/agent/INDEX.md"),
      "# orders changed index\n",
    );

    await assert.rejects(
      execFile("node", [
        collector,
        "--root",
        workspace,
        "--check",
        snapshotPath,
      ]),
      (error) => {
        assert.equal(error.code, 2);
        const result = JSON.parse(error.stdout);
        assert.equal(result.state, "stale");
        assert.deepEqual(result.changed_services[0].changed_artifacts, [
          "orders/docs/agent/INDEX.md",
        ]);
        return true;
      },
    );

    const saved = JSON.parse(await readFile(snapshotPath, "utf8"));
    assert.equal(saved.services[0].id, "orders");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("collector finds nested service contexts up to configured depth", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "system-context-"));
  try {
    await createService(path.join(workspace, "teams"), "catalog");
    const { stdout } = await execFile("node", [
      collector,
      "--root",
      workspace,
      "--max-depth",
      "2",
    ]);
    assert.deepEqual(
      JSON.parse(stdout).services.map((service) => service.id),
      ["teams/catalog"],
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
