# System context completeness gates

Apply all gates. Any failed mandatory gate makes the result `partial`.

| Gate | Requirement |
|---|---|
| S1 Inventory | Every repository context under the selected depth is included or explicitly excluded with a reason. |
| S2 Service identity | Every service has a stable workspace-relative ID and canonical spec link. |
| S3 Freshness | Every service lifecycle state is `current`; missing or unparseable state is explicit. |
| S4 Boundaries | Service responsibilities and external boundaries do not overlap silently. |
| S5 Contract agreement | Every material cross-service edge has producer and consumer evidence, or is marked inferred/unknown/contradictory. |
| S6 Flows | Every material multi-service business flow has a stable ID, ordering, failure behavior, and participating services. |
| S7 Data ownership | Every shared store or data object has an evidenced writer/owner or an explicit ownership gap. |
| S8 Trust | Authentication, authorization, and trust-boundary crossings are mapped without secrets. |
| S9 Resilience | Timeouts, retries, idempotency, ordering, and partial failures are recorded where material or marked unknown. |
| S10 Routing | Common tasks, capabilities, contracts, topics, and stores route to the smallest sufficient service set. |
| S11 Progressive disclosure | A cold-start agent can choose service context from `AGENTS.md`, `INDEX.md`, and `SERVICE-INDEX.json` without loading every service spec. |
| S12 Links | All local links and JSON document paths resolve. |
| S13 Snapshot | `.agent/system-context-state.json` matches current service context artifacts. |

## Status rules

- `complete/current`: S1–S13 pass and no source service is partial, stale,
  dirty, diverged, unknown, or missing a mandatory context artifact.
- `partial`: the aggregate is useful but at least one gate or source status is
  unresolved.
- `stale`: the saved source snapshot differs from current artifacts.

Unknown product intent does not invalidate accurate as-implemented topology,
but it must remain explicit and may still fail a gate when ownership or safe
change routing depends on it.
