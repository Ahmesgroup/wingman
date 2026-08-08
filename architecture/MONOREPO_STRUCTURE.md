# Monorepo Structure

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

```
wingman/
├── apps/       mobile (Expo) · web (Next.js) · admin (Next.js) · api (NestJS) · workers
├── packages/   database · domain · contracts · auth · privacy · media · notifications · billing · observability · ui
├── infrastructure/  docker · terraform (eu-west) · monitoring
├── docs/  turbo.json  pnpm-workspace.yaml  package.json
```
pnpm workspaces + Turborepo. `domain` is pure; `media` encapsulates object storage so no other package handles raw
keys or URLs; `privacy` centralizes retention/consent/export/deletion.
