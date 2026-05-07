# Releasing

## Local Build

```sh
npm install
npm run dist:mac
```

Artifacts:

- `dist/DOIO Mapper-0.1.0-arm64.dmg`
- `dist/DOIO Mapper-0.1.0-arm64-mac.zip`

The app is ad-hoc signed and not notarized.

## Public Repository Hygiene

Before publishing:

```sh
rg -n "api[_-]?key|token|password|secret|sk-[A-Za-z0-9]" .
git status --short
npm run doio:doctor -- --offline
```

Do not publish generated local backups, personal layouts, `dist/`, `vendor/`,
or hardware snapshots in git history. Public releases should use fresh history
from a sanitized export if the working repo was used for private device
experiments.
