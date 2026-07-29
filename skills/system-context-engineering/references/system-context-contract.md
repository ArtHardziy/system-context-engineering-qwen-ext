# System context output contract

Use workspace-relative POSIX paths in every generated artifact. Service IDs are
the relative repository paths emitted by the collector and remain stable across
renames only when an explicit alias is recorded.

## Root `AGENTS.md`

Preserve manual content. Maintain one bounded block:

```md
<!-- system-context:managed:start -->
## System context

One-sentence system purpose and the freshness status.

- Start: [docs/system/INDEX.md](docs/system/INDEX.md)
- System model: [docs/system/SYSTEM-SPEC.md](docs/system/SYSTEM-SPEC.md)
- Service catalog: [docs/system/SERVICE-CATALOG.md](docs/system/SERVICE-CATALOG.md)
- Machine routing index: [docs/system/SERVICE-INDEX.json](docs/system/SERVICE-INDEX.json)

Read the routing index first and load only the selected service context.
<!-- system-context:managed:end -->
```

Do not place full architecture, commands, or service summaries in `AGENTS.md`.

## `docs/system/SYSTEM-SPEC.md`

Include:

1. metadata: status, workspace root, generated timestamp, source snapshot path,
   service count, evidence limits;
2. system purpose, actors, owned and external boundaries;
3. service topology table;
4. cross-service dependency graph;
5. synchronous contract matrix;
6. asynchronous/event contract matrix;
7. end-to-end system flows with stable `SYS-FLOW-*` IDs;
8. data ownership and shared-data risks;
9. identity, authorization, and trust boundaries;
10. resilience, retry, idempotency, ordering, and partial-failure behavior;
11. observability and operational coupling;
12. deployment, migration, and compatibility ordering;
13. contradictions, unknowns, and evidence limits;
14. source-context freshness summary.

Every interaction must link to evidence from both sides when available. Mermaid
diagrams may show topology or three-party flows, but tables remain canonical.

## `docs/system/SERVICE-CATALOG.md`

Keep one row per service:

| Service ID | Purpose | Owns | Provides | Consumes | Data owner | Context status | Canonical context |
|---|---|---|---|---|---|---|---|

Add external nodes in a separate table. Do not duplicate detailed contracts.

## `docs/system/INDEX.md`

Optimize for progressive disclosure. Include:

- task type → relevant service IDs → exact system-spec section;
- capability/term → owning service IDs;
- contract/topic/store → producer/consumer or owner;
- cross-cutting changes → services and required verification routes;
- stale-context warning and refresh command.

Keep this file compact enough to load at cold start.

## `docs/system/SERVICE-INDEX.json`

Use schema version `1`:

```json
{
  "schema_version": 1,
  "generated_from": ".agent/system-context-state.json",
  "services": [
    {
      "id": "orders",
      "name": "orders",
      "purpose": "Concise evidence-backed summary",
      "status": "current",
      "documents": {
        "agents": "orders/AGENTS.md",
        "spec": "orders/docs/agent/PROJECT-SPEC.md",
        "index": "orders/docs/agent/INDEX.md"
      },
      "capabilities": ["order-management"],
      "terms": ["order"],
      "provides": ["http:orders-v1"],
      "consumes": ["event:payment-authorized"],
      "owns_data": ["orders-db"]
    }
  ],
  "edges": [
    {
      "from": "orders",
      "to": "payments",
      "kind": "event",
      "contract": "payment-requested",
      "confidence": "verified",
      "system_spec_anchor": "sys-flow-checkout"
    }
  ],
  "routing": [
    {
      "match": ["checkout", "payment"],
      "services": ["orders", "payments"],
      "system_spec_anchors": ["sys-flow-checkout"]
    }
  ]
}
```

Keep arrays deterministic: sort by service ID, then edge identity, then routing
match. Use concise keywords, not embeddings or copied prose. A consumer may use
this JSON to select context without loading all Markdown.

## `.agent/system-context-state.json`

Write this file only with `collect-service-contexts.mjs --output`. It is a
content-hash snapshot of source context, not a semantic index. Do not edit it by
hand or copy semantic summaries into it.
