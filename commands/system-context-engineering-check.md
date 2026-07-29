---
description: Check whether aggregate system context matches service context packages
---

Invoke the Qwen Code Skill tool for `system-context-engineering`. Execute only
the `check` operation. Do not rewrite canonical documentation or service
context.

Start with: `System documentation check: I will compare aggregate documentation with its service-context snapshot and validate source quality, links, and routing pointers without rewriting documentation.`
Then list a 3–5 item plan.

Run the bundled deterministic system-context checker. Report added, removed, or
changed services and artifacts, source context quality states, missing
aggregate files, broken links, routing-index pointer failures, and the exact
update command when the result is not current.

Finish with freshness, gate status, affected services, diagnostics, and one
exact next action.

User arguments:

```text
{{args}}
```
