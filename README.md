# AI Data Platform

`ai-data-platform` is an application repository for the AI assistant product.

It is no longer the canonical shared platform repository.

## Active scope

- `apps/api`
  - application backend
- `apps/web`
  - application frontend
- `apps/worker`
  - application worker
- `tools/windows-client`
  - Windows installer, bootstrap flow, runtime update chain, and client operations

## Frozen platform references

- `apps/control-plane-api`
- `apps/control-plane-web`

These directories are kept only as migration references. New shared backend or shared admin work must go to:

- `home`

## Boundary

Keep in `ai-data-platform`:

- AI assistant application logic
- application-local APIs, pages, and jobs
- Windows client installation and runtime tooling

Move to `home`:

- shared admin login and sessions
- shared project catalog
- shared model pool and provider key management
- cross-project governance
- cross-project release control
- shared control plane and public admin

Detailed repository boundary rules live in:

- `docs/APP_BOUNDARY_2026-04-05.md`

## Local home integration

For local protected integration with `home`, save a shared token and then start the local app stack:

```powershell
corepack pnpm local:home-token:set -Token '<shared-token>'
corepack pnpm local:start
```

To clear the local token:

```powershell
corepack pnpm local:home-token:clear
```
