# External User Library Access Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-external-user and per-external-group document-library access control for shared third-party bots without replacing the existing bot visibility model.

**Architecture:** Keep the current bot-level visibility as the upper bound, then add a channel-specific external identity layer that resolves a sender into users and groups, loads subject-level library assignments, and computes `effectiveVisibleLibraryKeys` for each request. Enforce that effective scope in both memory-first selection and live retrieval so the same shared bot can safely serve different external users.

**Tech Stack:** Fastify API, Next.js App Router, local JSON-backed runtime repositories, existing bot visibility chain, OpenClaw memory selection, channel ingress adapters.

---

## Scope

This plan implements the design in:

- `C:\Users\soulzyn\Desktop\codex\ai-data-platform\docs\plans\2026-04-07-external-user-library-access-design.md`

This plan includes:

1. Directory source config and sync
2. User/group subject access policies
3. Runtime access resolver
4. Effective-scope enforcement in channel ingress, memory-first, and live retrieval
5. Admin UI for source config, sync, preview, and subject-level library assignment

This plan does not include:

1. Cross-channel identity merge
2. Field-level ACL
3. Document-level ACL
4. SDK-specific first-party integrations
5. Replacing `libraryAccessLevel` or `visibleLibraryKeys`

## Guardrails

1. Keep `bot` visibility as the upper bound
2. Deny by default when a mapped sender has no resolved assignment
3. Never rely on prompt-only restrictions
4. Do not trust per-bot memory state alone when external-user mapping is enabled
5. Keep UI as a thin admin surface, not a generic permissions editor

## Outcome Targets

When this plan is complete:

1. A shared third-party bot can serve multiple external users with different document-library scopes
2. Channel requests compute a per-request `effectiveVisibleLibraryKeys`
3. Memory-first candidate selection and live retrieval use the same effective scope
4. Admins can sync an external user/group directory and assign libraries to users or groups
5. Admins can preview the final effective scope for a sender before using the bot in production

### Task 1: Add Runtime Repositories for Directory Sources and Subject Policies

**Files:**
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\channel-directory-sources.ts`
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\channel-user-access-policies.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\bot-definitions.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\channel-directory-sources.test.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\channel-user-access-policies.test.ts`

**Step 1: Write failing repository tests**

Cover:

1. source config can be created, updated, listed, and resolved by `botId + channel binding`
2. subject policies can upsert user and group assignments
3. duplicate library keys are normalized
4. disabled source does not resolve at runtime

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-sources.test.ts test/channel-user-access-policies.test.ts
```

Expected: FAIL because repositories do not exist yet.

**Step 2: Implement `channel-directory-sources.ts`**

Add:

1. runtime file path under `storage/config/channel-directory-sources.json`
2. normalizers for source config
3. `listChannelDirectorySources()`
4. `createChannelDirectorySource()`
5. `updateChannelDirectorySource()`
6. `resolveChannelDirectorySource(bot, channel, routeContext)`

**Step 3: Implement `channel-user-access-policies.ts`**

Add:

1. runtime file path under `storage/config/channel-user-access-policies.json`
2. normalizers for `user` and `group` policy rows
3. `listChannelUserAccessPolicies(sourceId)`
4. `upsertChannelUserAccessPolicies(sourceId, items, updatedBy)`
5. `getSubjectAssignedLibraryKeys(sourceId, userId, groupIds)`

**Step 4: Extend bot channel bindings**

Modify `bot-definitions.ts` to support:

```ts
directorySourceId?: string;
```

Keep this as an optional field in normalization and update flow.

**Step 5: Run repository tests**

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-sources.test.ts test/channel-user-access-policies.test.ts
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add apps/api/src/lib/channel-directory-sources.ts apps/api/src/lib/channel-user-access-policies.ts apps/api/src/lib/bot-definitions.ts apps/api/test/channel-directory-sources.test.ts apps/api/test/channel-user-access-policies.test.ts
git commit -m "feat: add external directory source repositories"
```

### Task 2: Add Directory Sync and Snapshot Status

**Files:**
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\channel-directory-sync.ts`
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\channel-directory-http-client.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\channel-directory-sync.test.ts`

**Step 1: Write failing sync tests**

Cover:

1. HTTP JSON source can be fetched and mapped into users/groups/memberships
2. sync status records `success` and `error`
3. malformed payload keeps the previous snapshot intact

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-sync.test.ts
```

Expected: FAIL because sync modules do not exist yet.

**Step 2: Implement a minimal HTTP client wrapper**

Add:

1. request method support for `GET` and `POST`
2. header mapping with `secret` preservation in config but redaction in logs
3. configurable timeout

Keep first version limited to JSON responses.

**Step 3: Implement snapshot sync**

Add:

1. `runChannelDirectorySync(sourceId)`
2. response path extraction for `usersPath`, `groupsPath`, `membershipsPath`
3. field extraction for IDs and display names
4. snapshot persistence under `storage/config/channel-directory-cache/<sourceId>.json`
5. status persistence under `storage/config/channel-directory-sync-status.json`

**Step 4: Preserve last good snapshot on failure**

On sync error:

1. update status to `error`
2. store message and timestamp
3. keep existing snapshot untouched

**Step 5: Run sync tests**

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-sync.test.ts
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add apps/api/src/lib/channel-directory-sync.ts apps/api/src/lib/channel-directory-http-client.ts apps/api/test/channel-directory-sync.test.ts
git commit -m "feat: add external directory sync"
```

### Task 3: Add Runtime Access Resolver

**Files:**
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\channel-access-resolver.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\bot-visibility.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\channel-access-resolver.test.ts`

**Step 1: Write failing resolver tests**

Cover:

1. sender matches a user and user assignment is returned
2. sender matches a user and groups add more libraries
3. final effective libraries are intersected with bot upper bound
4. sender not found returns deny-by-default
5. sender found but no assignments returns deny-by-default
6. source not enabled falls back to bot-only mode

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-access-resolver.test.ts
```

Expected: FAIL because resolver does not exist yet.

**Step 2: Add bot upper-bound helper**

Refactor `bot-visibility.ts` to expose a reusable helper such as:

```ts
buildVisibleLibraryKeySetFromBot(bot, libraries)
```

This remains the upper bound for all later intersections.

**Step 3: Implement access resolution**

Add in `channel-access-resolver.ts`:

1. resolve directory source from `bot + channel binding`
2. load cached snapshot
3. match user by `senderId`
4. collect group IDs from memberships
5. load user and group assignments
6. compute:
   - `botVisibleLibraryKeys`
   - `assignedLibraryKeys`
   - `effectiveVisibleLibraryKeys`
   - `denyReason`

**Step 4: Keep web and unmapped requests backward-compatible**

If no `directorySourceId` is enabled for the request, return:

1. `source = "bot-only"`
2. `effectiveVisibleLibraryKeys = botVisibleLibraryKeys`

**Step 5: Run resolver tests**

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-access-resolver.test.ts
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add apps/api/src/lib/channel-access-resolver.ts apps/api/src/lib/bot-visibility.ts apps/api/test/channel-access-resolver.test.ts
git commit -m "feat: resolve external user effective library access"
```

### Task 4: Enforce Effective Scope in Channel Ingress and Live Retrieval

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\channel-ingress.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\knowledge-chat-dispatch.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\knowledge-supply.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\channel-ingress-access.test.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\knowledge-supply-external-access.test.ts`

**Step 1: Write failing runtime enforcement tests**

Cover:

1. channel ingress sends effective library scope into the chat chain
2. supply retrieval cannot return documents outside `effectiveVisibleLibraryKeys`
3. deny-by-default requests do not enter knowledge retrieval

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-ingress-access.test.ts test/knowledge-supply-external-access.test.ts
```

Expected: FAIL because runtime inputs do not yet include effective scope.

**Step 2: Extend channel ingress output**

Modify `channel-ingress.ts` to:

1. call `resolveChannelAccessContext()`
2. add resolved access data to the response for debugging
3. pass `effectiveVisibleLibraryKeys` and access context into orchestration

**Step 3: Extend knowledge dispatch input**

Modify `knowledge-chat-dispatch.ts` to accept:

```ts
effectiveVisibleLibraryKeys?: string[]
accessContext?: ResolvedChannelAccess | null
```

Use this in debug output instead of only exposing `bot.visibleLibraryKeys`.

**Step 4: Extend knowledge supply**

Modify `knowledge-supply.ts` so that:

1. `effectiveVisibleLibraryKeys` overrides bot-only library filtering
2. fallback retrieval paths also respect the effective scope
3. when effective scope is empty, retrieval returns no scoped libraries and no documents

**Step 5: Run runtime enforcement tests**

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-ingress-access.test.ts test/knowledge-supply-external-access.test.ts
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add apps/api/src/lib/channel-ingress.ts apps/api/src/lib/knowledge-chat-dispatch.ts apps/api/src/lib/knowledge-supply.ts apps/api/test/channel-ingress-access.test.ts apps/api/test/knowledge-supply-external-access.test.ts
git commit -m "feat: enforce external user scope in retrieval"
```

### Task 5: Make Memory-First Safe for Shared Bots

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\openclaw-memory-selection.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\lib\bot-memory-catalog.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\openclaw-memory-selection-external-access.test.ts`

**Step 1: Write failing memory safety tests**

Cover:

1. normal bot-only requests still use per-bot memory state
2. external-user-mapped requests use global state plus effective library filtering
3. memory candidates from unauthorized libraries never appear in the selected set

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/openclaw-memory-selection-external-access.test.ts
```

Expected: FAIL because current selection only understands global or bot state.

**Step 2: Extend memory selection API**

Add optional inputs:

```ts
effectiveVisibleLibraryKeys?: string[]
forceGlobalState?: boolean
```

**Step 3: Implement safe selection rules**

Rules:

1. if no external mapping is active, current behavior remains
2. if external mapping is active, load global state and filter candidates by `effectiveVisibleLibraryKeys`
3. use `forceGlobalState` only for this mapped request path

**Step 4: Keep per-bot catalog generation unchanged**

Do not rebuild per-user catalogs in Phase 1.

Only change request-time selection behavior.

**Step 5: Run memory tests**

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/openclaw-memory-selection-external-access.test.ts
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add apps/api/src/lib/openclaw-memory-selection.ts apps/api/src/lib/bot-memory-catalog.ts apps/api/test/openclaw-memory-selection-external-access.test.ts
git commit -m "fix: filter memory-first selection by external user access"
```

### Task 6: Add Admin APIs for Sources, Subjects, Policies, and Preview

**Files:**
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\routes\channel-directory.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\routes\bots.ts`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\src\routes\index.ts`
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\channel-directory-routes.test.ts`

**Step 1: Write failing route tests**

Cover:

1. only bot-manage access can create or update sources
2. sync endpoint returns latest status
3. subject search returns users or groups from cached snapshot
4. policy patch upserts user/group assignments
5. access preview returns final effective scope

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-routes.test.ts
```

Expected: FAIL because routes do not exist yet.

**Step 2: Add source endpoints**

Implement:

```text
GET    /api/bots/:id/channel-directory-sources
POST   /api/bots/:id/channel-directory-sources
PATCH  /api/bots/:id/channel-directory-sources/:sourceId
POST   /api/bots/:id/channel-directory-sources/:sourceId/sync
```

**Step 3: Add subject and policy endpoints**

Implement:

```text
GET   /api/bots/:id/channel-directory-sources/:sourceId/subjects
GET   /api/bots/:id/channel-directory-sources/:sourceId/subjects/:subjectType/:subjectId
GET   /api/bots/:id/channel-directory-sources/:sourceId/access-policies
PATCH /api/bots/:id/channel-directory-sources/:sourceId/access-policies
POST  /api/bots/:id/channel-directory-sources/:sourceId/access-preview
```

**Step 4: Add summary data for existing bot APIs**

Expose enough source summary in manage mode so the frontend can show:

1. whether mapping is enabled
2. current source name
3. latest sync status

**Step 5: Run route tests**

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-routes.test.ts
```

Expected: PASS.

**Step 6: Commit**

```powershell
git add apps/api/src/routes/channel-directory.ts apps/api/src/routes/bots.ts apps/api/src/routes/index.ts apps/api/test/channel-directory-routes.test.ts
git commit -m "feat: add external directory admin APIs"
```

### Task 7: Add Bot-Level Directory Source Config UI

**Files:**
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\components\BotConfigPanel.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\home-api.js`
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\components\ExternalDirectorySourceCard.js`

**Step 1: Add frontend API helpers**

Implement in `home-api.js`:

1. list sources
2. create source
3. update source
4. run sync
5. fetch source summaries

**Step 2: Render directory source config under channel bindings**

In `BotConfigPanel.js`:

1. keep current bot upper-bound library controls
2. under each non-web channel binding, add:
   - enable mapping toggle
   - source picker
   - source create/edit surface
   - sync status badge
   - sync button

**Step 3: Keep first version narrow**

Only expose:

1. source name
2. HTTP URL, method, headers
3. response paths
4. field mappings
5. sync mode

Do not add a generic formula editor.

**Step 4: Run frontend build**

Run:

```powershell
corepack pnpm --filter web build
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add apps/web/app/components/BotConfigPanel.js apps/web/app/home-api.js apps/web/app/components/ExternalDirectorySourceCard.js
git commit -m "feat: add external directory source config UI"
```

### Task 8: Add Subject-Level Access Management UI

**Files:**
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\components\ExternalUserAccessPanel.js`
- Add: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\components\ExternalSubjectLibraryEditor.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\components\ConnectedBotAccessEditor.js`
- Modify: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\web\app\reports\page.js`

**Step 1: Add frontend API helpers for subjects and policies**

Implement:

1. search users/groups
2. load subject detail
3. load policies
4. patch policies
5. preview effective access

**Step 2: Add a separate access-management panel**

Render:

1. subject search list
2. subject detail
3. group membership view
4. library multi-select editor
5. effective-access preview block

Do not embed this as a huge form inside the main bot card.

**Step 3: Link from bot config and report-bot config**

Add entry points:

1. from bot config
2. from connected report bot editor for third-party bots

This keeps the current report-center access surface aligned with the new model.

**Step 4: Run frontend build**

Run:

```powershell
corepack pnpm --filter web build
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add apps/web/app/components/ExternalUserAccessPanel.js apps/web/app/components/ExternalSubjectLibraryEditor.js apps/web/app/components/ConnectedBotAccessEditor.js apps/web/app/reports/page.js
git commit -m "feat: add external subject library access UI"
```

### Task 9: Verify End-to-End Pilot for a Shared WeCom Bot

**Files:**
- Test: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\apps\api\test\channel-wecom-external-access-pilot.test.ts`
- Modify if needed: `C:\Users\soulzyn\Desktop\codex\ai-data-platform\default-samples\assets\*`

**Step 1: Add an end-to-end pilot test**

Scenario:

1. one wecom bot
2. one directory source
3. two users in different groups
4. one bot upper bound covering multiple libraries
5. user A and user B receive different answers because `effectiveVisibleLibraryKeys` differ

**Step 2: Run the focused regression suite**

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-sources.test.ts test/channel-user-access-policies.test.ts test/channel-directory-sync.test.ts test/channel-access-resolver.test.ts test/channel-ingress-access.test.ts test/knowledge-supply-external-access.test.ts test/openclaw-memory-selection-external-access.test.ts test/channel-directory-routes.test.ts test/channel-wecom-external-access-pilot.test.ts
```

Expected: PASS.

**Step 3: Run builds**

Run:

```powershell
corepack pnpm --filter api build
corepack pnpm --filter web build
```

Expected: PASS.

**Step 4: Commit**

```powershell
git add apps/api/test/channel-wecom-external-access-pilot.test.ts default-samples/assets
git commit -m "test: verify shared wecom bot external access pilot"
```

## Recommended Commit Order

1. `feat: add external directory source repositories`
2. `feat: add external directory sync`
3. `feat: resolve external user effective library access`
4. `feat: enforce external user scope in retrieval`
5. `fix: filter memory-first selection by external user access`
6. `feat: add external directory admin APIs`
7. `feat: add external directory source config UI`
8. `feat: add external subject library access UI`
9. `test: verify shared wecom bot external access pilot`

## Final Verification

Run:

```powershell
corepack pnpm --filter api exec tsx --test test/channel-directory-sources.test.ts test/channel-user-access-policies.test.ts test/channel-directory-sync.test.ts test/channel-access-resolver.test.ts test/channel-ingress-access.test.ts test/knowledge-supply-external-access.test.ts test/openclaw-memory-selection-external-access.test.ts test/channel-directory-routes.test.ts test/channel-wecom-external-access-pilot.test.ts
corepack pnpm --filter api build
corepack pnpm --filter web build
```

Expected:

1. all new access-control tests pass
2. no regression in shared-bot runtime behavior
3. frontend builds with the new admin surfaces
