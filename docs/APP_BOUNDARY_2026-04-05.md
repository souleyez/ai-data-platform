# AI Data Platform Application Boundary

## Position

`ai-data-platform` is an application repository for the AI assistant product.

It is not allowed to continue growing as the shared platform repository.

## What stays in this repository

- application backend in `apps/api`
- application frontend in `apps/web`
- application worker in `apps/worker`
- Windows installer and runtime tooling in `tools/windows-client`
- project-local product logic and data flows

## What moves to `home`

- shared admin login and sessions
- shared project catalog
- shared model pool and provider credentials
- cross-project governance
- cross-project release control
- shared control plane
- shared public admin

## Legacy note

The old `apps/control-plane-api` and `apps/control-plane-web` migration surfaces were removed from this repository on 2026-04-13.

If you need the shared control-plane or public admin now, use `home`.

## Current rule

If a capability could be reused by `Sonance`, `openclaw-android-tv`, or future applications, it must be implemented in `home`, not here.
