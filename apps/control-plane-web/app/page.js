import { cookies } from 'next/headers';
import ControlPlaneDashboardClient from './ControlPlaneDashboardClient';
import { getAdminTokenFromCookieStore, ADMIN_TOKEN_HEADER } from './lib/admin-auth';
import { buildControlPlaneApiUrl } from './lib/config';

async function safeFetchJson(path, adminToken) {
  if (!adminToken) {
    return {
      ok: false,
      error: '',
      data: null,
    };
  }

  try {
    const response = await fetch(buildControlPlaneApiUrl(path), {
      cache: 'no-store',
      headers: {
        [ADMIN_TOKEN_HEADER]: adminToken,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: text || `${response.status} ${response.statusText}`,
        data: null,
      };
    }

    return {
      ok: true,
      error: '',
      data: await response.json(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}

export default async function Page() {
  const cookieStore = await cookies();
  const adminToken = getAdminTokenFromCookieStore(cookieStore);
  const authenticated = Boolean(adminToken);

  const [users, releases, keys, devices, sessions, modelLeases, policies] = authenticated ? await Promise.all([
    safeFetchJson('/api/admin/users', adminToken),
    safeFetchJson('/api/admin/releases', adminToken),
    safeFetchJson('/api/admin/model-provider-keys', adminToken),
    safeFetchJson('/api/admin/devices', adminToken),
    safeFetchJson('/api/admin/sessions', adminToken),
    safeFetchJson('/api/admin/model-leases', adminToken),
    safeFetchJson('/api/admin/policies', adminToken),
  ]) : [
    { ok: false, error: '', data: null },
    { ok: false, error: '', data: null },
    { ok: false, error: '', data: null },
    { ok: false, error: '', data: null },
    { ok: false, error: '', data: null },
    { ok: false, error: '', data: null },
    { ok: false, error: '', data: null },
  ];

  const backendHealthy = authenticated && (
    users.ok
    || releases.ok
    || keys.ok
    || devices.ok
    || sessions.ok
    || modelLeases.ok
    || policies.ok
  );

  return (
    <main className="cp-shell">
      <section className="cp-hero">
        <div className="cp-hero-copy">
          <span className="cp-kicker">Control Plane</span>
          <h1>Windows installer, release control, phone allowlist, and model pool management.</h1>
          <p>
            This admin surface manages customer phone onboarding, client release rollout,
            and shared model provider capacity for the Windows bootstrap client.
          </p>
        </div>
        <div className={`cp-status-card ${backendHealthy ? 'healthy' : 'degraded'}`}>
          <div className="cp-status-title">
            <span className={`cp-status-dot ${backendHealthy ? 'healthy' : 'degraded'}`} />
            {authenticated ? (backendHealthy ? 'Connected to control plane API' : 'Admin token present but backend is unavailable') : 'Admin sign-in required'}
          </div>
          <p>
            API target: <code>{buildControlPlaneApiUrl('/api/health')}</code>
          </p>
          {!authenticated ? (
            <p className="cp-error-note">
              Set <code>CONTROL_PLANE_ADMIN_TOKEN</code> on the API, then sign in here with the same token.
            </p>
          ) : null}
        </div>
      </section>

      <ControlPlaneDashboardClient
        initialUsers={users.data?.items || []}
        initialReleases={releases.data?.items || []}
        initialModelKeys={keys.data?.items || []}
        initialDevices={devices.data?.items || []}
        initialSessions={sessions.data?.items || []}
        initialModelLeases={modelLeases.data?.items || []}
        initialPolicies={policies.data?.items || []}
        initialErrors={{
          users: users.error,
          releases: releases.error,
          modelKeys: keys.error,
          devices: devices.error,
          sessions: sessions.error,
          modelLeases: modelLeases.error,
          policies: policies.error,
        }}
        initialAuthenticated={authenticated}
      />
    </main>
  );
}
