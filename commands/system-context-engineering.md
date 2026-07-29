---
description: Build or refresh cross-service technical context from documented repositories
---

Invoke the Qwen Code Skill tool for `system-context-engineering` before
analyzing or modifying aggregate context. Do not emulate the skill from memory.

Execute exactly one `bootstrap` or `refresh` operation. Interpret the first
argument as the mode when it is `bootstrap` or `refresh`; otherwise let the
skill choose from workspace state. Treat the remaining argument as workspace
scope. Do not modify service source or service-level context.

For an explicit documentation update, prefer
`/system-context-engineering-update`; for a read-only freshness check, use
`/system-context-engineering-check`.

Start with: `System context: I will inventory the service context packages, reconcile cross-service behavior, and build a compact routing layer.`
Then list a 3–5 item plan.

Finish with discovered services, changed files, freshness, unresolved
contradictions, gate status, and one exact next action.

User arguments:

```text
{{args}}
```
