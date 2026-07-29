import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = path.join(
  packageRoot,
  "skills/system-context-engineering/scripts",
);
const collector = path.join(scripts, "collect-service-contexts.mjs");
const checker = path.join(scripts, "check-system-context.mjs");

async function createService(workspace, name, freshness = "current") {
  const root = path.join(workspace, name);
  await mkdir(path.join(root, "docs/agent"), { recursive: true });
  await mkdir(path.join(root, ".agent"), { recursive: true });
  await writeFile(path.join(root, "AGENTS.md"), `# ${name}\n`);
  await writeFile(path.join(root, "docs/agent/PROJECT-SPEC.md"), `# ${name}\n`);
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
      `  state: ${freshness}`,
      "",
    ].join("\n"),
  );
}

async function createAggregate(workspace) {
  await mkdir(path.join(workspace, "docs/system"), { recursive: true });
  await writeFile(
    path.join(workspace, "AGENTS.md"),
    [
      "# Workspace",
      "",
      "[System index](docs/system/INDEX.md)",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(workspace, "docs/system/INDEX.md"),
    [
      "# System index",
      "",
      "[System specification](SYSTEM-SPEC.md)",
      "[Service catalog](SERVICE-CATALOG.md)",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(workspace, "docs/system/SYSTEM-SPEC.md"),
    "# System specification\n",
  );
  await writeFile(
    path.join(workspace, "docs/system/SERVICE-CATALOG.md"),
    "# Service catalog\n",
  );
  await writeFile(
    path.join(workspace, "docs/system/SERVICE-INDEX.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        generated_from: ".agent/system-context-state.json",
        services: [
          {
            id: "orders",
            documents: {
              agents: "orders/AGENTS.md",
              spec: "orders/docs/agent/PROJECT-SPEC.md",
              index: "orders/docs/agent/INDEX.md",
            },
          },
        ],
        edges: [],
        routing: [],
      },
      null,
      2,
    )}\n`,
  );
  await execFile("node", [
    collector,
    "--root",
    workspace,
    "--output",
    path.join(workspace, ".agent/system-context-state.json"),
  ]);
}

test("system checker reports current only when snapshot and aggregate gates pass", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "system-check-"));
  try {
    await createService(workspace, "orders");
    await createAggregate(workspace);
    const { stdout } = await execFile("node", [checker, "--root", workspace]);
    const result = JSON.parse(stdout);
    assert.equal(result.state, "current");
    assert.equal(result.aggregate.valid, true);
    assert.deepEqual(result.source_quality_issues, []);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("system checker reports stale service artifacts with exit code 2", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "system-check-"));
  try {
    await createService(workspace, "orders");
    await createAggregate(workspace);
    await writeFile(
      path.join(workspace, "orders/docs/agent/PROJECT-SPEC.md"),
      "# orders changed\n",
    );
    await assert.rejects(
      execFile("node", [checker, "--root", workspace]),
      (error) => {
        assert.equal(error.code, 2);
        const result = JSON.parse(error.stdout);
        assert.equal(result.state, "stale");
        assert.deepEqual(result.snapshot.changed_services[0].changed_artifacts, [
          "orders/docs/agent/PROJECT-SPEC.md",
        ]);
        return true;
      },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("system checker reports partial for broken aggregate links", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "system-check-"));
  try {
    await createService(workspace, "orders");
    await createAggregate(workspace);
    await writeFile(
      path.join(workspace, "docs/system/INDEX.md"),
      "# System index\n\n[Missing](DOES-NOT-EXIST.md)\n",
    );
    await assert.rejects(
      execFile("node", [checker, "--root", workspace]),
      (error) => {
        assert.equal(error.code, 2);
        const result = JSON.parse(error.stdout);
        assert.equal(result.state, "partial");
        assert.equal(result.aggregate.links.valid, false);
        assert.equal(result.aggregate.links.issues[0].message, "Target file does not exist.");
        return true;
      },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
