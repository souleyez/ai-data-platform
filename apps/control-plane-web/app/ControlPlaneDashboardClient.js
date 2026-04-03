'use client';

import { useEffect, useMemo, useState } from 'react';

function summaryCounts(users, releases, modelKeys, devices, sessions, modelLeases) {
  return {
    activeUsers: users.filter((item) => item.status === 'active').length,
    publishedReleases: releases.filter((item) => item.status === 'published').length,
    activeKeys: modelKeys.filter((item) => item.status === 'active').length,
    devices: devices.length,
    activeSessions: sessions.filter((item) => item.active).length,
    activeLeases: modelLeases.filter((item) => item.active).length,
  };
}

function formatDateTime(value) {
  if (!value) {
    return 'Not set';
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function normalizeProviderScopes(input) {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.code || payload.error || response.statusText);
  }
  return payload;
}

function emptyPolicyForm() {
  return {
    id: '',
    channel: 'stable',
    minSupportedVersion: '',
    targetVersion: '',
    forceUpgrade: false,
    allowSelfRegister: true,
    modelAccessMode: 'lease',
    providerScopes: 'moonshot,minimax',
  };
}

export default function ControlPlaneDashboardClient({
  initialUsers,
  initialReleases,
  initialModelKeys,
  initialDevices,
  initialSessions,
  initialModelLeases,
  initialPolicies,
  initialErrors,
  initialAuthenticated,
}) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [users, setUsers] = useState(initialUsers);
  const [releases, setReleases] = useState(initialReleases);
  const [modelKeys, setModelKeys] = useState(initialModelKeys);
  const [devices, setDevices] = useState(initialDevices);
  const [sessions, setSessions] = useState(initialSessions);
  const [modelLeases, setModelLeases] = useState(initialModelLeases);
  const [policies, setPolicies] = useState(initialPolicies);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(
    initialErrors.users
      || initialErrors.releases
      || initialErrors.modelKeys
      || initialErrors.devices
      || initialErrors.sessions
      || initialErrors.modelLeases
      || initialErrors.policies
      || '',
  );
  const [loading, setLoading] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [userForm, setUserForm] = useState({ phone: '', note: '', status: 'active' });
  const [releaseForm, setReleaseForm] = useState({
    channel: 'stable',
    version: '',
    artifactUrl: '',
    artifactSha256: '',
    artifactSize: '0',
    minSupportedVersion: '',
    releaseNotes: '',
  });
  const [keyForm, setKeyForm] = useState({
    provider: 'moonshot',
    region: 'cn',
    label: '',
    apiKey: '',
  });
  const [policyForm, setPolicyForm] = useState(emptyPolicyForm);

  const counts = summaryCounts(users, releases, modelKeys, devices, sessions, modelLeases);
  const globalPolicy = useMemo(
    () => policies.find((item) => item.scopeType === 'global') || policies[0] || null,
    [policies],
  );

  useEffect(() => {
    if (!globalPolicy) {
      setPolicyForm(emptyPolicyForm());
      return;
    }

    setPolicyForm({
      id: globalPolicy.id,
      channel: globalPolicy.channel || 'stable',
      minSupportedVersion: globalPolicy.minSupportedVersion || '',
      targetVersion: globalPolicy.targetVersion || '',
      forceUpgrade: Boolean(globalPolicy.forceUpgrade),
      allowSelfRegister: Boolean(globalPolicy.allowSelfRegister),
      modelAccessMode: globalPolicy.modelAccessMode || 'lease',
      providerScopes: (globalPolicy.providerScopes || []).join(','),
    });
  }, [globalPolicy]);

  async function loadDashboardData() {
    setLoading(true);
    try {
      setError('');
      const [
        usersPayload,
        releasesPayload,
        keysPayload,
        devicesPayload,
        sessionsPayload,
        leasesPayload,
        policiesPayload,
      ] = await Promise.all([
        requestJson('/api/admin/users'),
        requestJson('/api/admin/releases'),
        requestJson('/api/admin/model-provider-keys'),
        requestJson('/api/admin/devices'),
        requestJson('/api/admin/sessions'),
        requestJson('/api/admin/model-leases'),
        requestJson('/api/admin/policies'),
      ]);
      setUsers(usersPayload.items || []);
      setReleases(releasesPayload.items || []);
      setModelKeys(keysPayload.items || []);
      setDevices(devicesPayload.items || []);
      setSessions(sessionsPayload.items || []);
      setModelLeases(leasesPayload.items || []);
      setPolicies(policiesPayload.items || []);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      if (message === 'ADMIN_TOKEN_REQUIRED' || message === 'ADMIN_TOKEN_INVALID') {
        setAuthenticated(false);
        setUsers([]);
        setReleases([]);
        setModelKeys([]);
        setDevices([]);
        setSessions([]);
        setModelLeases([]);
        setPolicies([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(event) {
    event.preventDefault();
    try {
      setError('');
      setNotice('');
      await requestJson('/api/admin/session', {
        method: 'POST',
        body: JSON.stringify({ token: adminToken }),
      });
      setAuthenticated(true);
      setAdminToken('');
      await loadDashboardData();
      setNotice('Admin session created.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function handleSignOut() {
    try {
      await requestJson('/api/admin/session', { method: 'DELETE' });
    } finally {
      setAuthenticated(false);
      setUsers([]);
      setReleases([]);
      setModelKeys([]);
      setDevices([]);
      setSessions([]);
      setModelLeases([]);
      setPolicies([]);
      setNotice('Admin session cleared.');
      setError('');
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    try {
      setError('');
      const payload = await requestJson('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(userForm),
      });
      setUsers((current) => [payload.item, ...current.filter((item) => item.id !== payload.item.id)]);
      setNotice(`User ${payload.item.phone} saved.`);
      setUserForm({ phone: '', note: '', status: 'active' });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function handleToggleUser(userId, nextStatus) {
    try {
      setError('');
      const payload = await requestJson(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setUsers((current) => current.map((item) => (item.id === userId ? { ...item, ...payload.item } : item)));
      setNotice(`User status updated to ${payload.item.status}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function handleUpdatePolicy(event) {
    event.preventDefault();
    if (!policyForm.id) {
      setError('GLOBAL_POLICY_NOT_FOUND');
      return;
    }

    try {
      setError('');
      const payload = await requestJson(`/api/admin/policies/${policyForm.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          channel: policyForm.channel,
          minSupportedVersion: policyForm.minSupportedVersion,
          targetVersion: policyForm.targetVersion,
          forceUpgrade: policyForm.forceUpgrade,
          allowSelfRegister: policyForm.allowSelfRegister,
          modelAccessMode: policyForm.modelAccessMode,
          providerScopes: normalizeProviderScopes(policyForm.providerScopes),
        }),
      });
      setPolicies((current) => current.map((item) => (item.id === payload.item.id ? payload.item : item)));
      setNotice(`Policy for ${payload.item.scopeValue} updated.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function handleCreateRelease(event) {
    event.preventDefault();
    try {
      setError('');
      const payload = await requestJson('/api/admin/releases', {
        method: 'POST',
        body: JSON.stringify({
          ...releaseForm,
          artifactSize: Number(releaseForm.artifactSize),
        }),
      });
      setReleases((current) => [payload.item, ...current]);
      setNotice(`Release ${payload.item.version} created.`);
      setReleaseForm({
        channel: 'stable',
        version: '',
        artifactUrl: '',
        artifactSha256: '',
        artifactSize: '0',
        minSupportedVersion: '',
        releaseNotes: '',
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function handlePublishRelease(releaseId) {
    try {
      setError('');
      const payload = await requestJson(`/api/admin/releases/${releaseId}/publish`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setReleases((current) => current.map((item) => (item.id === releaseId ? payload.item : item)));
      setNotice(`Release ${payload.item.version} published.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function handleCreateModelKey(event) {
    event.preventDefault();
    try {
      setError('');
      const payload = await requestJson('/api/admin/model-provider-keys', {
        method: 'POST',
        body: JSON.stringify(keyForm),
      });
      setModelKeys((current) => [payload.item, ...current]);
      setNotice(`Model provider key added for ${payload.item.provider}.`);
      setKeyForm({
        provider: 'moonshot',
        region: 'cn',
        label: '',
        apiKey: '',
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  if (!authenticated) {
    return (
      <section className="cp-grid">
        <div className="cp-left-column">
          {notice ? <div className="cp-banner success">{notice}</div> : null}
          {error ? <div className="cp-banner error">{error}</div> : null}
          <section className="cp-form-card">
            <div className="cp-card-head">
              <div>
                <h2>Admin sign-in</h2>
                <p>
                  Enter the shared admin token that matches <code>CONTROL_PLANE_ADMIN_TOKEN</code> on the
                  control-plane API.
                </p>
              </div>
            </div>
            <form className="cp-form" onSubmit={handleSignIn}>
              <input
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                placeholder="Admin token"
              />
              <button className="cp-primary-btn" type="submit">Sign in</button>
            </form>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className="cp-grid">
      <div className="cp-left-column">
        <section className="cp-stat-grid">
          <article className="cp-stat-card">
            <span>Active customers</span>
            <strong>{counts.activeUsers}</strong>
            <small>Phone allowlist entries that can pass the bootstrap gate.</small>
          </article>
          <article className="cp-stat-card">
            <span>Published releases</span>
            <strong>{counts.publishedReleases}</strong>
            <small>Windows clients read these manifests for force-upgrade and background update policy.</small>
          </article>
          <article className="cp-stat-card">
            <span>Active model keys</span>
            <strong>{counts.activeKeys}</strong>
            <small>Shared provider capacity currently available to leases or future proxy routing.</small>
          </article>
          <article className="cp-stat-card">
            <span>Known devices</span>
            <strong>{counts.devices}</strong>
            <small>Bootstrap sessions have already identified these Windows hosts.</small>
          </article>
          <article className="cp-stat-card">
            <span>Active sessions</span>
            <strong>{counts.activeSessions}</strong>
            <small>Client bootstrap sessions that can still fetch release policy.</small>
          </article>
          <article className="cp-stat-card">
            <span>Active model leases</span>
            <strong>{counts.activeLeases}</strong>
            <small>Short-lived credentials issued to runtime clients in lease mode.</small>
          </article>
        </section>

        <div className="cp-toolbar">
          <button className="cp-ghost-btn" type="button" onClick={() => loadDashboardData()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="cp-ghost-btn" type="button" onClick={handleSignOut}>Sign out</button>
        </div>

        {notice ? <div className="cp-banner success">{notice}</div> : null}
        {error ? <div className="cp-banner error">{error}</div> : null}

        <section className="cp-form-card">
          <div className="cp-card-head">
            <div>
              <h2>Global bootstrap policy</h2>
              <p>Controls enrollment, forced upgrade, model access mode, and default provider scopes.</p>
            </div>
          </div>
          <form className="cp-form cp-form-release" onSubmit={handleUpdatePolicy}>
            <input
              value={policyForm.channel}
              onChange={(event) => setPolicyForm((current) => ({ ...current, channel: event.target.value }))}
              placeholder="Release channel"
            />
            <input
              value={policyForm.targetVersion}
              onChange={(event) => setPolicyForm((current) => ({ ...current, targetVersion: event.target.value }))}
              placeholder="Target version"
            />
            <input
              value={policyForm.minSupportedVersion}
              onChange={(event) => setPolicyForm((current) => ({ ...current, minSupportedVersion: event.target.value }))}
              placeholder="Minimum supported version"
            />
            <select
              value={policyForm.modelAccessMode}
              onChange={(event) => setPolicyForm((current) => ({ ...current, modelAccessMode: event.target.value }))}
            >
              <option value="lease">lease</option>
              <option value="direct-config">direct-config</option>
            </select>
            <textarea
              value={policyForm.providerScopes}
              onChange={(event) => setPolicyForm((current) => ({ ...current, providerScopes: event.target.value }))}
              placeholder="Provider scopes, comma separated"
            />
            <label className="cp-check-row">
              <input
                type="checkbox"
                checked={policyForm.forceUpgrade}
                onChange={(event) => setPolicyForm((current) => ({ ...current, forceUpgrade: event.target.checked }))}
              />
              <span>Force upgrade for all clients</span>
            </label>
            <label className="cp-check-row">
              <input
                type="checkbox"
                checked={policyForm.allowSelfRegister}
                onChange={(event) => setPolicyForm((current) => ({ ...current, allowSelfRegister: event.target.checked }))}
              />
              <span>Allow unknown phones to self-register</span>
            </label>
            <button className="cp-primary-btn" type="submit">Save policy</button>
          </form>
        </section>

        <section className="cp-form-card">
          <div className="cp-card-head">
            <div>
              <h2>Customer phones</h2>
              <p>Use the phone list as the bootstrap allowlist for the Windows client.</p>
            </div>
          </div>
          <form className="cp-form" onSubmit={handleCreateUser}>
            <input
              value={userForm.phone}
              onChange={(event) => setUserForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Phone number"
            />
            <input
              value={userForm.note}
              onChange={(event) => setUserForm((current) => ({ ...current, note: event.target.value }))}
              placeholder="Note or customer label"
            />
            <select
              value={userForm.status}
              onChange={(event) => setUserForm((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
            <button className="cp-primary-btn" type="submit">Save phone</button>
          </form>
        </section>

        <section className="cp-form-card">
          <div className="cp-card-head">
            <div>
              <h2>Release manifests</h2>
              <p>Create and publish Windows client releases that the bootstrap runtime can download and stage.</p>
            </div>
          </div>
          <form className="cp-form cp-form-release" onSubmit={handleCreateRelease}>
            <input
              value={releaseForm.version}
              onChange={(event) => setReleaseForm((current) => ({ ...current, version: event.target.value }))}
              placeholder="Version, e.g. 2026.04.20+001"
            />
            <input
              value={releaseForm.channel}
              onChange={(event) => setReleaseForm((current) => ({ ...current, channel: event.target.value }))}
              placeholder="Channel"
            />
            <input
              value={releaseForm.artifactUrl}
              onChange={(event) => setReleaseForm((current) => ({ ...current, artifactUrl: event.target.value }))}
              placeholder="Artifact URL"
            />
            <input
              value={releaseForm.artifactSha256}
              onChange={(event) => setReleaseForm((current) => ({ ...current, artifactSha256: event.target.value }))}
              placeholder="Artifact SHA256"
            />
            <input
              value={releaseForm.artifactSize}
              onChange={(event) => setReleaseForm((current) => ({ ...current, artifactSize: event.target.value }))}
              placeholder="Artifact size in bytes"
            />
            <input
              value={releaseForm.minSupportedVersion}
              onChange={(event) => setReleaseForm((current) => ({ ...current, minSupportedVersion: event.target.value }))}
              placeholder="Minimum supported version"
            />
            <textarea
              value={releaseForm.releaseNotes}
              onChange={(event) => setReleaseForm((current) => ({ ...current, releaseNotes: event.target.value }))}
              placeholder="Release notes"
            />
            <button className="cp-primary-btn" type="submit">Create release draft</button>
          </form>
        </section>

        <section className="cp-form-card">
          <div className="cp-card-head">
            <div>
              <h2>Model provider pool</h2>
              <p>Store provider credentials centrally so Windows clients can later consume leases or proxy access.</p>
            </div>
          </div>
          <form className="cp-form" onSubmit={handleCreateModelKey}>
            <select
              value={keyForm.provider}
              onChange={(event) => setKeyForm((current) => ({ ...current, provider: event.target.value }))}
            >
              <option value="moonshot">moonshot / kimi</option>
              <option value="minimax">minimax</option>
              <option value="glm">glm</option>
            </select>
            <input
              value={keyForm.region}
              onChange={(event) => setKeyForm((current) => ({ ...current, region: event.target.value }))}
              placeholder="Region"
            />
            <input
              value={keyForm.label}
              onChange={(event) => setKeyForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="Pool label"
            />
            <input
              value={keyForm.apiKey}
              onChange={(event) => setKeyForm((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder="API key"
            />
            <button className="cp-primary-btn" type="submit">Add provider key</button>
          </form>
        </section>
      </div>

      <div className="cp-right-column">
        <section className="cp-list-card">
          <div className="cp-card-head">
            <div>
              <h2>Policy scopes</h2>
              <p>Global policy drives default onboarding. Phone-specific overrides can be layered later.</p>
            </div>
          </div>
          <div className="cp-list">
            {policies.length ? policies.map((item) => (
              <article className="cp-row-card" key={item.id}>
                <div>
                  <strong>{item.scopeType === 'global' ? 'global / *' : item.scopeValue}</strong>
                  <p>
                    channel {item.channel || 'stable'} | access {item.modelAccessMode} | providers {(item.providerScopes || []).join(', ') || 'none'}
                  </p>
                  <p>
                    min {item.minSupportedVersion || 'not set'} | target {item.targetVersion || 'not set'} | self-register {item.allowSelfRegister ? 'on' : 'off'}
                  </p>
                </div>
                <div className="cp-row-actions">
                  <span className={`cp-pill ${item.forceUpgrade ? 'warn' : 'ok'}`}>
                    {item.forceUpgrade ? 'force upgrade' : 'normal'}
                  </span>
                </div>
              </article>
            )) : <p className="cp-empty">No policy scopes have been configured yet.</p>}
          </div>
        </section>

        <section className="cp-list-card">
          <div className="cp-card-head">
            <div>
              <h2>Known devices</h2>
              <p>Each successful bootstrap registers a Windows host and refreshes its client/runtime version.</p>
            </div>
          </div>
          <div className="cp-list">
            {devices.length ? devices.map((item) => (
              <article className="cp-row-card" key={item.id}>
                <div>
                  <strong>{item.deviceName || 'Unnamed device'}</strong>
                  <p>{item.userPhone || 'No phone'} | {item.osVersion || 'Unknown Windows version'}</p>
                  <p className="cp-code">{item.deviceFingerprint}</p>
                  <p>client {item.clientVersion || 'n/a'} | runtime {item.openclawVersion || 'n/a'}</p>
                </div>
                <div className="cp-row-actions">
                  <span className="cp-pill muted">{formatDateTime(item.lastSeenAt)}</span>
                </div>
              </article>
            )) : <p className="cp-empty">No Windows devices have completed bootstrap yet.</p>}
          </div>
        </section>

        <section className="cp-list-card">
          <div className="cp-card-head">
            <div>
              <h2>Client sessions</h2>
              <p>Bootstrap sessions let the installed runtime fetch policy, release manifests, and model leases.</p>
            </div>
          </div>
          <div className="cp-list">
            {sessions.length ? sessions.map((item) => (
              <article className="cp-row-card" key={item.id}>
                <div>
                  <strong>{item.userPhone || 'Unknown phone'}</strong>
                  <p>{item.deviceName || 'Unnamed device'} | expires {formatDateTime(item.expiresAt)}</p>
                  <p className="cp-code">{item.deviceFingerprint || 'No fingerprint'}</p>
                </div>
                <div className="cp-row-actions">
                  <span className={`cp-pill ${item.active ? 'ok' : 'muted'}`}>{item.active ? 'active' : 'expired'}</span>
                </div>
              </article>
            )) : <p className="cp-empty">No active bootstrap sessions have been created yet.</p>}
          </div>
        </section>

        <section className="cp-list-card">
          <div className="cp-card-head">
            <div>
              <h2>Model leases</h2>
              <p>Lease mode issues short-lived model credentials to clients without shipping raw provider keys.</p>
            </div>
          </div>
          <div className="cp-list">
            {modelLeases.length ? modelLeases.map((item) => (
              <article className="cp-row-card" key={item.id}>
                <div>
                  <strong>{item.providerScope}</strong>
                  <p>{item.userPhone || 'Unknown phone'} | {item.deviceName || 'Unnamed device'}</p>
                  <p>expires {formatDateTime(item.expiresAt)}</p>
                </div>
                <div className="cp-row-actions">
                  <span className={`cp-pill ${item.active ? 'ok' : 'muted'}`}>{item.active ? 'active' : 'expired'}</span>
                </div>
              </article>
            )) : <p className="cp-empty">No model leases have been issued yet.</p>}
          </div>
        </section>

        <section className="cp-list-card">
          <div className="cp-card-head">
            <div>
              <h2>Customer list</h2>
              <p>Each entry controls whether a client can pass phone bootstrap validation.</p>
            </div>
          </div>
          <div className="cp-list">
            {users.length ? users.map((item) => (
              <article className="cp-row-card" key={item.id}>
                <div>
                  <strong>{item.phone}</strong>
                  <p>{item.note || 'No note.'}</p>
                  <p>{item.deviceCount || 0} device(s) | source {item.source}</p>
                </div>
                <div className="cp-row-actions">
                  <span className={`cp-pill ${item.status === 'active' ? 'ok' : 'muted'}`}>{item.status}</span>
                  <button
                    className="cp-ghost-btn"
                    type="button"
                    onClick={() => handleToggleUser(item.id, item.status === 'active' ? 'disabled' : 'active')}
                  >
                    {item.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </article>
            )) : <p className="cp-empty">No customer phones have been recorded yet.</p>}
          </div>
        </section>

        <section className="cp-list-card">
          <div className="cp-card-head">
            <div>
              <h2>Release list</h2>
              <p>Published releases are what the Windows updater checks in the background.</p>
            </div>
          </div>
          <div className="cp-list">
            {releases.length ? releases.map((item) => (
              <article className="cp-row-card" key={item.id}>
                <div>
                  <strong>{item.version}</strong>
                  <p>{item.channel} | minimum supported {item.minSupportedVersion || 'not set'}</p>
                  <p>published {item.publishedAt ? formatDateTime(item.publishedAt) : 'not yet'}</p>
                </div>
                <div className="cp-row-actions">
                  <span className={`cp-pill ${item.status === 'published' ? 'ok' : 'warn'}`}>{item.status}</span>
                  {item.status !== 'published' ? (
                    <button className="cp-primary-btn" type="button" onClick={() => handlePublishRelease(item.id)}>
                      Publish
                    </button>
                  ) : null}
                </div>
              </article>
            )) : <p className="cp-empty">No release manifests have been created yet.</p>}
          </div>
        </section>

        <section className="cp-list-card">
          <div className="cp-card-head">
            <div>
              <h2>Model pool</h2>
              <p>Only masked provider key fragments are shown here; the raw secrets never come back to the browser.</p>
            </div>
          </div>
          <div className="cp-list">
            {modelKeys.length ? modelKeys.map((item) => (
              <article className="cp-row-card" key={item.id}>
                <div>
                  <strong>{item.provider}</strong>
                  <p>{item.label || item.region || 'Unlabeled'} | {item.apiKeyMasked}</p>
                  <p>quota {item.usedQuota || 0}/{item.dailyQuota || 0} | weight {item.weight}</p>
                </div>
                <div className="cp-row-actions">
                  <span className={`cp-pill ${item.status === 'active' ? 'ok' : 'muted'}`}>{item.status}</span>
                </div>
              </article>
            )) : <p className="cp-empty">No model provider keys have been stored yet.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
