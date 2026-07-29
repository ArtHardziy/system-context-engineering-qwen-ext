#!/usr/bin/env node

import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  collect,
  compareSnapshots,
} from "./collect-service-contexts.mjs";

const REQUIRED_AGGREGATE_FILES = [
  "AGENTS.md",
  "docs/system/SYSTEM-SPEC.md",
  "docs/system/INDEX.md",
  "docs/system/SERVICE-CATALOG.md",
  "docs/system/SERVICE-INDEX.json",
];

function usage() {
  return [
    "Usage: check-system-context.mjs [options]",
    "",
    "Options:",
    "  --root <path>       Workspace containing system context (default: cwd)",
    "  --max-depth <n>     Maximum service-root depth (default: snapshot value or 2)",
    "  --snapshot <path>   Source snapshot (default: .agent/system-context-state.json)",
    "  --help              Show this help",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    maxDepth: null,
    snapshot: ".agent/system-context-state.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") options.root = argv[++index];
    else if (argument === "--max-depth") options.maxDepth = Number(argv[++index]);
    else if (argument === "--snapshot") options.snapshot = argv[++index];
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.root) throw new Error("--root requires a path");
  if (
    options.maxDepth !== null &&
    (!Number.isInteger(options.maxDepth) || options.maxDepth < 0 || options.maxDepth > 8)
  ) {
    throw new Error("--max-depth must be an integer between 0 and 8");
  }
  options.root = path.resolve(options.root);
  options.snapshot = path.resolve(options.root, options.snapshot);
  return options;
}

async function exists(filePath) {
  return access(filePath).then(
    () => true,
    () => false,
  );
}

function normalize(value) {
  return value.split(path.sep).join("/");
}

function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function headings(contents) {
  const anchors = new Set();
  const duplicates = new Map();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const base = githubSlug(match[1]);
    const count = duplicates.get(base) || 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    duplicates.set(base, count + 1);
  }
  return anchors;
}

function decodeTarget(value) {
  const withoutTitle = value.trim().replace(/\s+["'][^"']*["']\s*$/, "");
  if (withoutTitle.startsWith("<") && withoutTitle.endsWith(">")) {
    return withoutTitle.slice(1, -1);
  }
  return withoutTitle;
}

function splitTarget(value) {
  const hashIndex = value.indexOf("#");
  return hashIndex === -1
    ? { file: value, anchor: "" }
    : {
        file: value.slice(0, hashIndex),
        anchor: decodeURIComponent(value.slice(hashIndex + 1)),
      };
}

async function markdownFiles(root) {
  const files = [];
  if (await exists(path.join(root, "AGENTS.md"))) files.push("AGENTS.md");
  const systemDocs = path.join(root, "docs/system");
  if (!(await exists(systemDocs))) return files;

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(normalize(path.relative(root, absolute)));
      }
    }
  }
  await visit(systemDocs);
  return [...new Set(files)].sort();
}

async function checkLinks(root) {
  const files = await markdownFiles(root);
  const issues = [];
  const headingCache = new Map();
  for (const source of files) {
    const contents = await readFile(path.join(root, source), "utf8");
    for (const [index, line] of contents.split(/\r?\n/).entries()) {
      for (const match of line.matchAll(/(?<!!)\[[^\]]*]\(([^)]+)\)/g)) {
        const target = decodeTarget(match[1]);
        if (!target || /^(?:https?:|mailto:|tel:|data:)/i.test(target)) continue;
        const { file, anchor } = splitTarget(target);
        const absolute = file
          ? path.resolve(path.dirname(path.join(root, source)), decodeURIComponent(file))
          : path.join(root, source);
        const relative = normalize(path.relative(root, absolute));
        if (relative.startsWith("../") || path.isAbsolute(relative)) {
          issues.push({
            file: source,
            line: index + 1,
            target,
            message: "Target escapes the workspace root.",
          });
          continue;
        }
        const targetStat = await stat(absolute).catch(() => null);
        if (!targetStat) {
          issues.push({
            file: source,
            line: index + 1,
            target,
            message: "Target file does not exist.",
          });
          continue;
        }
        if (anchor && absolute.endsWith(".md") && targetStat.isFile()) {
          let targetHeadings = headingCache.get(absolute);
          if (!targetHeadings) {
            targetHeadings = headings(await readFile(absolute, "utf8"));
            headingCache.set(absolute, targetHeadings);
          }
          if (!targetHeadings.has(githubSlug(anchor))) {
            issues.push({
              file: source,
              line: index + 1,
              target,
              message: "Local Markdown anchor does not exist.",
            });
          }
        }
      }
    }
  }
  return { valid: issues.length === 0, files_checked: files, issues };
}

async function checkRoutingIndex(root) {
  const relative = "docs/system/SERVICE-INDEX.json";
  const absolute = path.join(root, relative);
  if (!(await exists(absolute))) {
    return { valid: false, issues: [{ file: relative, message: "File is missing." }] };
  }
  let index;
  try {
    index = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    return {
      valid: false,
      issues: [{ file: relative, message: `Invalid JSON: ${error.message}` }],
    };
  }
  const issues = [];
  if (index.schema_version !== 1) {
    issues.push({ file: relative, message: "schema_version must be 1." });
  }
  if (!Array.isArray(index.services)) {
    issues.push({ file: relative, message: "services must be an array." });
  }
  for (const service of Array.isArray(index.services) ? index.services : []) {
    if (!service.id || !service.documents || typeof service.documents !== "object") {
      issues.push({
        file: relative,
        service: service.id || null,
        message: "Each service must have id and documents.",
      });
      continue;
    }
    for (const [kind, documentPath] of Object.entries(service.documents)) {
      const absolute =
        typeof documentPath === "string" ? path.resolve(root, documentPath) : null;
      const resolvedRelative = absolute ? normalize(path.relative(root, absolute)) : null;
      const escapesRoot =
        resolvedRelative === ".." ||
        resolvedRelative?.startsWith("../") ||
        (resolvedRelative !== null && path.isAbsolute(resolvedRelative));
      if (
        typeof documentPath !== "string" ||
        escapesRoot ||
        !(await exists(absolute))
      ) {
        issues.push({
          file: relative,
          service: service.id,
          document_kind: kind,
          target: documentPath,
          message: escapesRoot
            ? "Routed document escapes the workspace root."
            : "Routed document does not exist.",
        });
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

function serviceQualityIssues(services) {
  const issues = [];
  for (const service of services) {
    for (const [artifact, present] of Object.entries(service.required_context)) {
      if (!present) {
        issues.push({
          service: service.id,
          category: "missing-context",
          detail: artifact,
        });
      }
    }
    for (const [field, expected] of [
      ["freshness", "current"],
      ["baseline_status", "complete"],
      ["verification_result", "pass"],
    ]) {
      if (service.lifecycle[field] !== expected) {
        issues.push({
          service: service.id,
          category: "source-quality",
          detail: field,
          expected,
          actual: service.lifecycle[field],
        });
      }
    }
  }
  return issues;
}

export async function checkSystemContext(options) {
  const missingAggregateFiles = [];
  for (const relative of REQUIRED_AGGREGATE_FILES) {
    if (!(await exists(path.join(options.root, relative)))) missingAggregateFiles.push(relative);
  }

  let saved = null;
  let snapshotComparison = null;
  if (await exists(options.snapshot)) {
    saved = JSON.parse(await readFile(options.snapshot, "utf8"));
    const maxDepth = options.maxDepth ?? saved.discovery?.max_depth ?? 2;
    const current = await collect({
      root: options.root,
      maxDepth,
      output: null,
      check: null,
    });
    snapshotComparison = compareSnapshots(saved, current);
  }

  const services = snapshotComparison?.service_quality || [];
  const qualityIssues = serviceQualityIssues(services);
  const links = await checkLinks(options.root);
  const routingIndex = await checkRoutingIndex(options.root);
  const aggregateValid =
    missingAggregateFiles.length === 0 && links.valid && routingIndex.valid;

  let state = "current";
  if (!saved) state = "unknown";
  else if (snapshotComparison.state === "stale") state = "stale";
  else if (qualityIssues.length > 0 || !aggregateValid) state = "partial";

  return {
    schema_version: 1,
    state,
    checked_at: new Date().toISOString(),
    snapshot: saved
      ? {
          path: normalize(path.relative(options.root, options.snapshot)),
          ...snapshotComparison,
        }
      : {
          path: normalize(path.relative(options.root, options.snapshot)),
          state: "missing",
        },
    source_quality_issues: qualityIssues,
    aggregate: {
      valid: aggregateValid,
      missing_files: missingAggregateFiles,
      links,
      routing_index: routingIndex,
    },
    refresh_command: `/system-context-engineering-update ${options.root}`,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await checkSystemContext(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.state !== "current") process.exitCode = 2;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  main().catch((error) => {
    process.stdout.write(
      `${JSON.stringify({ schema_version: 1, state: "invalid", error: error.message }, null, 2)}\n`,
    );
    process.exitCode = 1;
  });
}

export { checkLinks, checkRoutingIndex, parseArgs };
