---
description: Update aggregate system documentation from current service contexts
---

Invoke the Qwen Code Skill tool for `system-context-engineering`. Execute only
the `refresh` operation from the system documentation lifecycle. Do not modify
service source code or service-level context.

Start with: `System documentation update: I will compare the saved service-context snapshot with current context packages, update only affected aggregate documentation, and recheck freshness.`
Then list a 3–5 item plan.

Use the saved discovery depth unless the user explicitly supplies
`--max-depth`. Reconcile added, removed, and changed services; preserve manual
content outside managed markers. Save the new snapshot only after synthesis
succeeds, then run the deterministic system-context checker.

Finish with the previous and current snapshot state, affected services, changed
aggregate documents, source-quality gaps, check result, and one exact next
action.

User arguments:

```text
{{args}}
```
