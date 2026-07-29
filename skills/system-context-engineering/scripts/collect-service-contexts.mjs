#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CONTEXT_ARTIFACTS = [
  "AGENTS.md",
  "docs/agent/PROJECT-SPEC.md",
  "docs/agent/INDEX.md",
  ".agent/documentation-state.yaml",
];

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".vscode",
  "node_modules",
  "vendor",
  "target",
  "build",
  "dist",
  "coverage",
  ".cache",
  ".gradle",
  ".mvn",
]);

function usage() {
  return [
    "Usage: collect-service-contexts.mjs [options]",
    "",
    "Options:",
    "  --root <path>       Workspace containing documented services (default: cwd)",
    "  --max-depth <n>     Maximum service-root depth (default: 2)",
    "  --output <path>     Write a source snapshot as JSON",
    "  --check <path>      Compare current contexts with a saved snapshot",
    "  --help              Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    maxDepth: 2,
    output: null,
    check: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") options.root = argv[++index];
    else if (argument === "--max-depth") options.maxDepth = Number(argv[++index]);
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--check") options.check = argv[++index];
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.root) throw new Error("--root requires a path");
  if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0 || options.maxDepth > 8) {
    throw new Error("--max-depth must be an integer between 0 and 8");
  }
  if (options.output && options.check) {
    throw new Error("--output and --check are mutually exclusive");
  }

  options.root = path.resolve(options.root);
  if (options.output) options.output = path.resolve(options.root, options.output);
  if (options.check) options.check = path.resolve(options.root, options.check);
  return options;
}

async function exists(filePath) {
  return access(filePath).then(
    () => true,
    () => false,
  );
}

function posixPath(value) {
  return value.split(path.sep).join("/");
}

async function discoverServiceRoots(root, maxDepth) {
  const discovered = [];

  async function visit(directory, depth) {
    const specification = path.join(directory, "docs/agent/PROJECT-SPEC.md");
    if (await exists(specification)) discovered.push(directory);
    if (depth >= maxDepth) return;

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Cannot inspect ${directory}: ${error.message}`);
    }

    const childDirectories = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !IGNORED_DIRECTORIES.has(entry.name) &&
          !(depth === 0 && entry.name === "docs") &&
          !(depth === 0 && entry.name === ".agent"),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of childDirectories) {
      await visit(path.join(directory, entry.name), depth + 1);
    }
  }

  await visit(root, 0);
  return [...new Set(discovered)].sort();
}

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function yamlSectionScalar(text, section, key) {
  const lines = text.split(/\r?\n/);
  let sectionIndent = null;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    if (sectionIndent === null) {
      if (trimmed === `${section}:`) sectionIndent = indent;
      continue;
    }

    if (indent <= sectionIndent) return null;
    const match = trimmed.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`));
    if (match) return match[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

async function describeService(root, serviceRoot) {
  const relativeRoot = posixPath(path.relative(root, serviceRoot)) || ".";
  const artifacts = [];
  let stateText = null;

  for (const relativeArtifact of CONTEXT_ARTIFACTS) {
    const absoluteArtifact = path.join(serviceRoot, relativeArtifact);
    if (!(await exists(absoluteArtifact))) continue;
    const contents = await readFile(absoluteArtifact);
    const workspacePath = posixPath(path.relative(root, absoluteArtifact));
    artifacts.push({
      path: workspacePath,
      sha256: hash(contents),
      bytes: contents.byteLength,
    });
    if (relativeArtifact === ".agent/documentation-state.yaml") {
      stateText = contents.toString("utf8");
    }
  }

  artifacts.sort((left, right) => left.path.localeCompare(right.path));
  const lifecycle = {
    freshness: stateText ? yamlSectionScalar(stateText, "freshness", "state") : null,
    baseline_status: stateText ? yamlSectionScalar(stateText, "baseline", "status") : null,
    verification_result: stateText
      ? yamlSectionScalar(stateText, "verification", "result")
      : null,
  };

  const required = {
    agents: artifacts.some((item) => item.path === posixPath(path.join(relativeRoot, "AGENTS.md"))),
    project_spec: true,
    index: artifacts.some(
      (item) =>
        item.path === posixPath(path.join(relativeRoot, "docs/agent/INDEX.md")),
    ),
    lifecycle_state: Boolean(stateText),
  };

  const fingerprintInput = artifacts
    .map((artifact) => `${artifact.path}\0${artifact.sha256}`)
    .join("\n");

  return {
    id: relativeRoot,
    name: path.basename(serviceRoot),
    root: relativeRoot,
    required_context: required,
    lifecycle,
    artifacts,
    source_fingerprint: hash(Buffer.from(fingerprintInput)),
  };
}

async function collect(options) {
  const roots = await discoverServiceRoots(options.root, options.maxDepth);
  if (roots.length === 0) {
    throw new Error(
      `No docs/agent/PROJECT-SPEC.md found within depth ${options.maxDepth} of ${options.root}`,
    );
  }

  const services = [];
  for (const serviceRoot of roots) {
    services.push(await describeService(options.root, serviceRoot));
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    workspace_root: ".",
    discovery: {
      max_depth: options.maxDepth,
      required_marker: "docs/agent/PROJECT-SPEC.md",
      artifact_allowlist: CONTEXT_ARTIFACTS,
    },
    services,
  };
}

function serviceMap(snapshot) {
  return new Map((snapshot.services || []).map((service) => [service.id, service]));
}

function compareSnapshots(saved, current) {
  if (saved.schema_version !== 1) {
    throw new Error(`Unsupported snapshot schema_version: ${saved.schema_version}`);
  }

  const previous = serviceMap(saved);
  const next = serviceMap(current);
  const added_services = [...next.keys()].filter((id) => !previous.has(id)).sort();
  const removed_services = [...previous.keys()].filter((id) => !next.has(id)).sort();
  const changed_services = [];

  for (const id of [...next.keys()].filter((serviceId) => previous.has(serviceId)).sort()) {
    const before = previous.get(id);
    const after = next.get(id);
    if (before.source_fingerprint === after.source_fingerprint) continue;

    const beforeArtifacts = new Map(before.artifacts.map((item) => [item.path, item.sha256]));
    const afterArtifacts = new Map(after.artifacts.map((item) => [item.path, item.sha256]));
    const artifactPaths = new Set([...beforeArtifacts.keys(), ...afterArtifacts.keys()]);
    const changed_artifacts = [...artifactPaths]
      .filter((artifact) => beforeArtifacts.get(artifact) !== afterArtifacts.get(artifact))
      .sort();

    changed_services.push({
      id,
      changed_artifacts,
      previous_fingerprint: before.source_fingerprint,
      current_fingerprint: after.source_fingerprint,
    });
  }

  const stale =
    added_services.length > 0 ||
    removed_services.length > 0 ||
    changed_services.length > 0;

  return {
    schema_version: 1,
    state: stale ? "stale" : "current",
    checked_at: new Date().toISOString(),
    added_services,
    removed_services,
    changed_services,
    service_quality: current.services.map((service) => ({
      id: service.id,
      lifecycle: service.lifecycle,
      required_context: service.required_context,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const snapshot = await collect(options);

  if (options.check) {
    const saved = JSON.parse(await readFile(options.check, "utf8"));
    const comparison = compareSnapshots(saved, snapshot);
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
    if (comparison.state === "stale") process.exitCode = 2;
    return;
  }

  if (options.output) {
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  collect,
  compareSnapshots,
  discoverServiceRoots,
  parseArgs,
};
