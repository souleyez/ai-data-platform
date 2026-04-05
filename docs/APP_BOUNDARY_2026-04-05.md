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

## Frozen reference directories

The following directories are migration references only:

- `apps/control-plane-api`
- `apps/control-plane-web`

Allowed work there:

- read-only comparison during migration
- emergency fixes only when required to unblock existing local workflows

Not allowed there:

- new shared platform features
- new shared admin screens
- new multi-project backend logic

## Current rule

If a capability could be reused by `Sonance`, `openclaw-android-tv`, or future applications, it must be implemented in `home`, not here.
