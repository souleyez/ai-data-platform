# Phase 1 Stability Release Checklist

## Purpose

Use this checklist before pushing a `phase 1` stability release to GitHub or deploying to a runtime host.

This checklist is the release companion to:

- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\docs\plans\2026-04-07-ai-data-platform-scaling-phased-plan.md`
- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\docs\plans\2026-04-07-phase1-stability-execution-plan.md`

## Fixed verification command

Run exactly this command from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\soulzyn\Desktop\codex\ai-data-platform\tools\verify-phase1-stability.ps1"
```

This command is the release gate for phase 1 stability work. It will:

1. Print the current git SHA
2. Print the runtime file paths that matter for phase 1
3. Run the fixed API regression suite
4. Run `api build`
5. Run `web build`
6. Check critical runtime telemetry for failed or stale task families

## Blocking conditions

Do not release when any of the following is true:

1. The fixed verification command fails
2. `deep-parse`, `memory-sync`, or `dataviz` runtime telemetry is in `failed` state
3. `memory-sync` has been stale for 24 hours or more
4. `api build` fails
5. `web build` fails

## Warning-only conditions

Warnings can ship if the reason is understood and explicitly accepted:

1. `dataviz` is `skipped` because the local renderer is unavailable on the current dev box, but the target runtime is known-good
2. `memory-sync` is stale for 6 to 24 hours, but the release does not depend on fresh memory catalog updates and the issue is already tracked
3. There are existing warning-level backlog alerts in `operations overview`, but the queue is draining and no task family is failed

## Pre-release operator checks

Before release, inspect:

1. `operations overview` for deep-parse backlog, datasource failed runs, capture errors, memory-sync freshness, and dataviz state
2. `audit` page for stage-1 warning tags and task-family last errors
3. `datasources` page for repeated failure badges and stale runtime badges on managed cards

## Rollback triggers

Rollback is recommended if any of the following appears immediately after deploy:

1. Hot read pages start implicitly enqueuing deep parse or rebuilding dynamic outputs
2. `operations overview` shows new critical warnings that were not present before deploy
3. Datasource runs begin failing broadly across previously healthy tasks
4. `memory-sync` stops succeeding after restart

## Runtime artifacts to inspect before rollback

Check these files first:

1. `storage\config\task-runtime-metrics.json`
2. `storage\config\openclaw-memory-sync-status.json`
3. `storage\cache\document-deep-parse-queue.json`
4. `storage\config\report-center.json`
5. `storage\config\datasources\runs.json`

If the main file looks corrupted, also inspect the matching `.bak` snapshot.

## Worker recovery check

After restart, confirm:

1. `deep-parse` moves from `scheduled` or `running` back to fresh status instead of staying stuck
2. `memory-sync` can reach `success`
3. Datasource scheduled tasks still show next-run timestamps and can execute
4. `operations overview` refreshes without mutating report outputs or document read caches

## Phase 1 sign-off

Release is ready when:

1. The fixed verification command passes
2. No blocking runtime telemetry condition is present
3. Operator pages show understandable warning state
4. Rollback path is clear if the runtime diverges after deploy
