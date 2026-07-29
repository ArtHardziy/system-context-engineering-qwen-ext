# system-context-engineering

Qwen Code extension that aggregates context produced by
`repo-context-engineering` across a workspace of microservices.

## Install

```bash
qwen extensions install ./system-context-engineering --scope user
```

Install it at user scope so it can run from the parent workspace rather than
from one service repository.

## Use

From the directory containing the service repositories:

```text
/system-context-engineering bootstrap .
/system-context-engineering-check .
/system-context-engineering-task change checkout retry behavior
```

After service documentation changes, run:

```text
/system-context-engineering refresh .
```

The extension creates a compact system entry point, technical specification,
service catalog, machine-readable routing index, and a hashed freshness
snapshot. Service specifications remain the canonical sources.

## Validate and package

```bash
cd system-context-engineering
npm test
npm run validate
npm pack --dry-run
```
