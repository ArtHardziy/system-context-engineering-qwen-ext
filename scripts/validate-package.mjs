import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const execFile = promisify(execFileCallback);
const skillRoot = "skills/system-context-engineering";
const requiredFiles = [
  "qwen-extension.json",
  "commands/system-context-engineering.md",
  "commands/system-context-engineering-check.md",
  "commands/system-context-engineering-update.md",
  "commands/system-context-engineering-task.md",
  `${skillRoot}/SKILL.md`,
  `${skillRoot}/agents/openai.yaml`,
  `${skillRoot}/scripts/collect-service-contexts.mjs`,
  `${skillRoot}/scripts/check-system-context.mjs`,
  `${skillRoot}/references/documentation-lifecycle.md`,
  `${skillRoot}/references/system-context-contract.md`,
  `${skillRoot}/references/system-completeness-gates.md`,
];

for (const relativePath of requiredFiles) {
  await access(path.join(packageRoot, relativePath));
}

const packageJson = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);
const manifest = JSON.parse(
  await readFile(path.join(packageRoot, "qwen-extension.json"), "utf8"),
);
const skill = await readFile(path.join(packageRoot, skillRoot, "SKILL.md"), "utf8");
const failures = [];

if (packageJson.name !== "@protone/system-context-engineering") {
  failures.push("Unexpected npm package name.");
}
if (packageJson.version !== manifest.version) {
  failures.push("package.json and qwen-extension.json versions must match.");
}
if (manifest.name !== "system-context-engineering") {
  failures.push("Unexpected Qwen extension name.");
}
if (manifest.commands !== "commands" || manifest.skills !== "skills") {
  failures.push("The manifest must expose commands and skills directories.");
}
if (!/^name:\s*system-context-engineering$/m.test(skill)) {
  failures.push("SKILL.md must declare system-context-engineering.");
}

for (const term of [
  "task-context",
  "SERVICE-INDEX.json",
  "system-context-state.json",
  "collect-service-contexts.mjs",
  "check-system-context.mjs",
  "progressive disclosure",
]) {
  if (!skill.toLowerCase().includes(term.toLowerCase())) {
    failures.push(`SKILL.md must define ${term}.`);
  }
}

for (const commandName of [
  "system-context-engineering.md",
  "system-context-engineering-check.md",
  "system-context-engineering-update.md",
  "system-context-engineering-task.md",
]) {
  const command = await readFile(
    path.join(packageRoot, "commands", commandName),
    "utf8",
  );
  if (!/^---\ndescription:\s*.+\n---\n/.test(command)) {
    failures.push(`${commandName} must have description frontmatter.`);
  }
  if (!command.includes("{{args}}")) {
    failures.push(`${commandName} must forward {{args}}.`);
  }
}

const validationCache = await mkdtemp(
  path.join(tmpdir(), "system-context-npm-cache-"),
);
let packed;
try {
  packed = JSON.parse(
    (
      await execFile("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
        cwd: packageRoot,
        encoding: "utf8",
        env: { ...process.env, npm_config_cache: validationCache },
      })
    ).stdout,
  );
} finally {
  await rm(validationCache, { recursive: true, force: true });
}

const packedPaths = new Set(packed[0]?.files?.map((file) => file.path) || []);
for (const runtimeFile of requiredFiles) {
  if (!packedPaths.has(runtimeFile)) {
    failures.push(`${runtimeFile} is missing from the npm package.`);
  }
}
if ([...packedPaths].some((item) => item.startsWith("test/"))) {
  failures.push("Tests must not be included in the npm package.");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${packageJson.name}@${packageJson.version}.`);
}
