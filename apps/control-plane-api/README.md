# Legacy Control Plane API

This directory is frozen.

The canonical shared platform API now lives in:

- `C:\Users\soulzyn\Desktop\codex\home\apps\platform-api`

Only keep this directory as a migration reference or for emergency comparison.
Do not add new shared platform features here.

Default package scripts are intentionally blocked.

If you absolutely need to inspect this frozen code path, use explicit legacy scripts only:

- `corepack pnpm --filter control-plane-api legacy:dev`
- `corepack pnpm --filter control-plane-api legacy:build`
- `corepack pnpm --filter control-plane-api legacy:test`
- `corepack pnpm --filter control-plane-api legacy:start`
- `corepack pnpm --filter control-plane-api legacy:control-plane:import:file-state`
