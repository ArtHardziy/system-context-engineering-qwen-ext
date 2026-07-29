# System documentation lifecycle

Use this contract for `refresh` and `check`. Service-level context remains
canonical; system documentation is a derived, evidence-backed routing layer.

## Shared scope and safety

- Treat the workspace root as the scope.
- Read service context artifacts only through the collector allowlist.
- Never modify service source, service documentation, Git history, deployments,
  migrations, package state, or production systems.
- Preserve manual root `AGENTS.md` content outside system managed markers.
- Never copy secrets or infer undocumented business intent.
- Use the saved discovery depth unless `--max-depth` is explicit.

## Freshness model

The deterministic checker returns:

- `current`: the saved service snapshot matches, every source service is
  `current`/`complete`/`pass`, mandatory aggregate artifacts exist, Markdown
  links resolve, and routing-index document pointers resolve;
- `stale`: a service or tracked context artifact was added, removed, or changed
  after the aggregate snapshot;
- `partial`: the snapshot matches but a source-quality or aggregate integrity
  gate fails;
- `unknown`: the source snapshot is absent;
- `invalid`: the invocation, snapshot, or checked artifact cannot be parsed.

Never collapse `partial` or `unknown` into `current`. Content hashes prove
artifact equality, not semantic correctness; semantic reconciliation remains
part of `refresh`.

## Refresh

1. Read the existing snapshot when present and inventory current service
   contexts with the same discovery depth.
2. Identify added, removed, and changed services and artifacts before editing.
3. Read affected service context breadth-first. Also read unchanged contract
   peers when an affected edge or flow requires two-sided evidence.
4. Update only the affected sections of `SYSTEM-SPEC.md`, `INDEX.md`,
   `SERVICE-CATALOG.md`, `SERVICE-INDEX.json`, and the managed root entry.
5. Preserve contradictions and downgrade unsupported claims instead of
   silently choosing a side.
6. Apply every completeness gate.
7. Save `.agent/system-context-state.json` only after documentation synthesis
   succeeds.
8. Run `check-system-context.mjs`. Report `current` only when it exits `0`.

If validation fails after edits, keep the diagnostics and report `partial` or
`stale`; do not describe the update as complete.

## Check

Treat canonical documentation as read-only. Run:

```text
node scripts/check-system-context.mjs --root <workspace-root>
```

Use `--max-depth <n>` only when intentionally overriding the saved discovery
scope. Exit code `0` means `current`, `2` means actionable
`stale`/`partial`/`unknown`, and `1` means invalid input or data.

Report:

- snapshot state and path;
- added, removed, and changed services/artifacts;
- source lifecycle quality gaps;
- missing aggregate files;
- broken Markdown links and routing-index document pointers;
- the exact update command.

Do not rewrite documentation, repair links, or replace the snapshot during
`check`.
