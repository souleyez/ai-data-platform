# Sticky Lease For Server Nodes

## Goal

Add a long-lived `sticky lease` model access mode for server-style nodes such as `120`, so they do not depend on short-lived shared proxy availability for every request.

This plan is not for interactive desktop clients. It is for always-on nodes that serve end-user traffic and must retain stable model access across idle periods.

## Why This Is Needed

The current `120` outage showed a structural problem:

- `120` runs `http-model-bridge.mjs` in `home-first` mode.
- Server `1` (`home`) returned `MODEL_PROXY_NO_PROVIDER_AVAILABLE`.
- `120` had no usable local direct-provider fallback because the bridge process had empty `MINIMAX_*` env values.
- The bridge therefore returned fallback chat errors even though:
  - the bridge service was healthy
  - the gateway service was healthy
  - the project policy allowed `minimax`

The immediate runtime fix was to restore a `minimax` provider key into:
- `/srv/home/storage/control-plane/state.json`

That restored chat, but it also proved the deeper issue:

- server-style nodes should not depend on ephemeral shared proxy capacity alone
- the current `proxy` path is too fragile for always-on production nodes

## Current State

### In `home`

Current project policy model:

- `modelAccessMode`: `lease | proxy`
- `providerScopes`: already supported
- `modelProviderKeys`: shared provider pool
- `modelLeases`: already exists in state schema

Relevant files:

- [control-plane-schema.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/lib/control-plane-schema.ts)
- [control-plane-service.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/lib/control-plane-service.ts)
- [client.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/routes/client.ts)
- [control-plane-model-policy-service.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/lib/control-plane-model-policy-service.ts)
- [control-plane-model-proxy-service.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/lib/control-plane-model-proxy-service.ts)

There is also an existing compatibility implementation for longer lease profiles in the `sonance` router:

- [sonance-router-compat-service.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/lib/sonance-router-compat-service.ts)

That code already proves these concepts:

- `client_short`
- `server_10m`
- `server_120m`

and stores lease mode strings such as:

- `direct_provider_temporary`
- `direct_provider_server_10m`
- `direct_provider_server_120m`

### In `ai-data-platform`

Current `120`-style bridge path:

- [http-model-bridge.mjs](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/tools/http-model-bridge.mjs)

Current behavior:

- `home-first` tries `home` proxy first
- if `home` proxy fails, it only falls back to local direct provider if env-based direct provider is usable
- it does not consume `/client/model-lease`
- it does not maintain a persistent lease
- it does not renew a server lease

## Product Decision

We should not replace `proxy`.

We should add a new server-oriented lease mode:

- `ephemeral lease`
- `sticky lease`
- `shared proxy`

Meaning:

- `ephemeral lease`: short-lived, interactive, reclaimable
- `sticky lease`: long-lived, server-node, renewed in background, preferred for production nodes
- `shared proxy`: request-by-request pool access, acceptable for low-priority or temporary nodes

## Target Model

### Policy Layer

Extend project policy from:

- `modelAccessMode`

to:

- `modelAccessMode`
- `leaseMode`
- `leaseProfile`

Recommended values:

- `modelAccessMode = lease | proxy`
- `leaseMode = ephemeral | sticky`
- `leaseProfile = client_short | server_10m | server_120m | server_24h`

Default rule:

- desktop clients: `lease + ephemeral + client_short`
- server nodes like `120`: `lease + sticky + server_120m` initially

Do not start with `24h` as default. `server_120m` is enough for first rollout and already aligned with existing `sonance` precedent.

## Data Model Changes

Extend `ControlPlaneModelLease` in:

- [control-plane-schema.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/lib/control-plane-schema.ts)

Add:

- `leaseProfile?: string`
- `stickyOwnerKey?: string`
- `lastKeepaliveAt?: string | null`
- `releaseReason?: string | null`

Keep:

- `leaseMode`
- `expiresAt`
- `revokedAt`

Interpretation:

- `leaseMode` remains the low-level runtime lease mode string
- `leaseProfile` is the operator-friendly profile id
- `stickyOwnerKey` binds the lease to a long-lived server principal/device
- `lastKeepaliveAt` makes renewal visible

## API Changes In `home`

### 1. Extend `/client/model-lease`

File:

- [client.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/routes/client.ts)

Accept:

- `providerScope`
- `leaseProfile`
- `sticky`

Recommended request shape:

```json
{
  "projectKey": "ai-data-platform",
  "providerScope": "minimax",
  "leaseProfile": "server_120m",
  "sticky": true
}
```

Response should return:

- `leaseId`
- `token`
- `expiresAt`
- `leaseMode`
- `leaseProfile`
- `baseUrl`
- `provider`
- `model`

### 2. Add `/client/model-lease/renew`

Needed for server nodes.

Request:

- `leaseId`
- `token`

Behavior:

- extend `expiresAt`
- update `lastKeepaliveAt`
- reject if lease is revoked or provider key disappeared

### 3. Add `/client/model-lease/release`

Explicit best-effort release for:

- shutdown
- operator action
- bridge restart cleanup

### 4. Add `/client/model-lease/status`

Used by bridges for health surfaces and by admin UI.

Return:

- active lease metadata
- TTL remaining
- provider
- model
- sticky flag

## Lease Issuance Rules

Implement in:

- [control-plane-service.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/lib/control-plane-service.ts)
- state repository functions called from there

Rules:

1. If project policy is not `lease`, reject.
2. Resolve requested profile.
3. If `sticky = true`:
   - reuse active lease for same `projectKey + deviceId + providerScope + leaseProfile`
   - do not issue duplicate leases for the same owner unless explicitly forced
4. If no active lease exists:
   - allocate provider key from `modelProviderKeys`
   - create lease
5. Renewal:
   - only extend if the same provider key is still valid
   - preserve the original provider allocation
6. Release:
   - mark revoked
   - do not delete record

## Provider Allocation Policy

Current shared proxy policy in:

- [control-plane-model-policy-service.ts](/C:/Users/soulzyn/Desktop/codex/home/apps/platform-api/src/lib/control-plane-model-policy-service.ts)

Add a corresponding lease allocator rule set:

- prefer active provider keys
- prefer already-bound provider for sticky renewal
- under pressure, reclaim ephemeral leases before rejecting sticky renewals

That means sticky leases get stronger retention than ephemeral ones.

We do not need fully dynamic preemption in phase 1.

Phase 1 rule is enough:

- sticky renewals succeed if their provider key still exists and is active
- ephemeral issuance can fail before sticky renewal fails

## Bridge Changes In `ai-data-platform`

File:

- [http-model-bridge.mjs](/C:/Users/soulzyn/Desktop/codex/ai-data-platform/tools/http-model-bridge.mjs)

Add a new mode path:

- `HOME_PLATFORM_MODEL_ACCESS_MODE=lease`
- `HOME_PLATFORM_LEASE_MODE=sticky`
- `HOME_PLATFORM_LEASE_PROFILE=server_120m`

Bridge behavior:

1. Bootstrap as today.
2. If configured for lease mode:
   - call `/client/model-lease`
   - cache lease metadata in memory
3. Serve chat requests using the leased provider/baseUrl/model
4. Start background renewal timer
5. On renew failure:
   - mark health as degraded
   - retry before dropping service
6. On shutdown:
   - best-effort `/client/model-lease/release`

Important:

Do not make chat request path depend on `home` proxy if sticky lease is active.

The whole point is:

- acquire centrally
- execute locally against leased provider config

## Health Semantics

Current `/health` on bridge is too coarse.

Extend bridge health output to expose:

- `modelAccessMode`
- `leaseMode`
- `leaseProfile`
- `leaseStatus`
- `leaseExpiresAt`
- `leaseRenewWindowSeconds`
- `leaseProvider`
- `leaseModel`
- `homeFallbackMode`

Possible statuses:

- `proxy_ok`
- `lease_ok`
- `lease_renewing`
- `lease_degraded`
- `lease_unavailable`

## Admin UX In `home`

Current dashboard already shows:

- policies
- model provider keys
- model leases

Extend it to support sticky lease management:

- select `modelAccessMode = lease`
- choose `leaseProfile`
- toggle `sticky lease`
- inspect active sticky leases
- revoke sticky lease explicitly

Relevant UI:

- [ControlPlaneDashboardClient.js](/C:/Users/soulzyn/Desktop/codex/home/app/ControlPlaneDashboardClient.js)

## Rollout Plan

### Phase 1: Backend lease extension in `home`

Deliver:

- extend schema
- extend `/client/model-lease`
- add renew/release/status endpoints
- add sticky lease reuse logic

Acceptance:

- unit tests cover `client_short`, `server_10m`, `server_120m`
- sticky lease for same node is reused
- renew extends expiry
- release revokes cleanly

### Phase 2: `ai-data-platform` bridge consumes sticky lease

Deliver:

- bridge env support
- lease acquisition
- lease renewal
- health output

Acceptance:

- `120` can run in `lease+sticky` mode without `home-first proxy`
- chat still works if `model-proxy` path is temporarily unavailable

### Phase 3: Operational hardening

Deliver:

- admin visibility
- audit logs for issue/renew/release
- fallback policy visibility in system health

Acceptance:

- operator can see which node owns which sticky lease
- sticky leases survive ordinary idle periods
- ephemeral leases are reclaimed first

## Testing Plan

### `home`

Add tests around:

- sticky lease reuse by `projectKey + deviceId + providerScope + leaseProfile`
- renew path
- release path
- provider exhaustion behavior
- ephemeral vs sticky coexistence

The existing `sonance-router-compat.test.ts` already proves the profile idea. Reuse that logic instead of inventing a second long-lease model.

### `ai-data-platform`

Add tests around:

- bridge acquires lease on startup
- bridge renews before expiry
- bridge uses leased provider even if proxy path fails
- degraded health when renew fails

## Recommended First Real Deployment

For `120`:

- `HOME_PLATFORM_MODEL_ACCESS_MODE=lease`
- `HOME_PLATFORM_LEASE_MODE=sticky`
- `HOME_PLATFORM_LEASE_PROFILE=server_120m`
- `HOME_PLATFORM_PROVIDER=minimax`
- `HOME_PLATFORM_MODEL=MiniMax-M2.7`

Keep local env provider fallback available as emergency backup, but it should no longer be the normal path.

## Non-Goals For Phase 1

Do not add:

- global automatic lease preemption
- cross-provider rebalance logic
- per-request hybrid lease/proxy arbitration
- 24h lease as the default

Phase 1 should stay narrow:

- make server nodes stable
- avoid idle-time provider loss
- keep the operator model understandable

## Immediate Follow-Up

Before implementation starts:

1. Restore any missing provider keys in `home` state through admin workflow, not manual file edits.
2. Add a migration note for existing `proxy` projects that should move to `lease + sticky`.
3. Test `120` first before rolling to any other node.
