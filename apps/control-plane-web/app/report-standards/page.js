import { cookies } from 'next/headers';
import { getAdminTokenFromCookieStore } from '../lib/admin-auth';
import { buildBackendApiUrl, safeFetchBackendJson } from '../lib/backend-api';
import { safeFetchControlPlaneJson } from '../lib/control-plane-api';
import ReportGovernanceEditor from './ReportGovernanceEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReportStandardsPage() {
  const cookieStore = await cookies();
  const adminToken = getAdminTokenFromCookieStore(cookieStore);
  const standards = await safeFetchBackendJson('/api/report-standards', adminToken);
  const governance = await safeFetchControlPlaneJson('/api/admin/report-governance', adminToken);
  const data = standards.data || {};

  return (
    <main className="cp-shell cp-subpage-shell">
      <section className="cp-subpage-hero">
        <div className="cp-hero-copy">
          <span className="cp-kicker">Governance</span>
          <h1>模板标准</h1>
          <p>集中查看报告模板类型、兼容来源、默认输出和格式映射，作为后台运维标准面板。</p>
        </div>
        <div className={`cp-status-card ${standards.ok ? 'healthy' : 'degraded'}`}>
          <div className="cp-status-title">
            <span className={`cp-status-dot ${standards.ok ? 'healthy' : 'degraded'}`} />
            {standards.ok ? '模板标准已同步' : '读取失败'}
          </div>
          <p>数据源接口: <code>{buildBackendApiUrl('/api/report-standards')}</code></p>
          {standards.ok ? null : <p className="cp-error-note">{standards.error || 'ADMIN_TOKEN_REQUIRED'}</p>}
        </div>
      </section>

      <section className="cp-grid cp-readonly-grid">
        <div className="cp-left-column">
          <ReportGovernanceEditor
            initialConfig={governance.data?.item || null}
            initialError={governance.ok ? '' : (governance.error || 'REPORT_GOVERNANCE_LOAD_FAILED')}
          />

          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>模板类型</h2>
                <p>模板类型与默认输出映射。</p>
              </div>
            </div>
            <div className="cp-list">
              {(data.templates || []).length ? data.templates.map((item) => (
                <article className="cp-row-card" key={item.type}>
                  <div>
                    <strong>{item.label}</strong>
                    <p>默认输出 {item.defaultKind} / {item.defaultFormat}</p>
                    <p>来源类型 {(item.supportedSourceTypes || []).join(', ') || '无'}</p>
                    <p>{(item.notes || []).join(' ')}</p>
                  </div>
                  <div className="cp-row-actions cp-readonly-tags">
                    {(item.compatibleOutputKinds || []).map((kind) => (
                      <span className="cp-pill muted" key={kind}>{kind}</span>
                    ))}
                  </div>
                </article>
              )) : <p className="cp-empty">暂无模板标准。</p>}
            </div>
          </section>
        </div>

        <div className="cp-right-column">
          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>模板来源类型</h2>
                <p>当前系统可识别的模板来源。</p>
              </div>
            </div>
            <div className="cp-list">
              {(data.sourceTypes || []).length ? data.sourceTypes.map((item) => (
                <article className="cp-row-card" key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                  </div>
                  <div className="cp-row-actions">
                    <span className="cp-pill muted">{item.id}</span>
                  </div>
                </article>
              )) : <p className="cp-empty">暂无来源类型。</p>}
            </div>
          </section>

          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>输出格式映射</h2>
                <p>输出类型、默认格式和叙事属性。</p>
              </div>
            </div>
            <div className="cp-list">
              {(data.outputKinds || []).length ? data.outputKinds.map((item) => (
                <article className="cp-row-card" key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <p>默认格式 {item.defaultFormat}</p>
                    <p>模板类型 {item.templateType || '未映射'}</p>
                  </div>
                  <div className="cp-row-actions">
                    <span className={`cp-pill ${item.narrative ? 'warn' : 'ok'}`}>{item.narrative ? '叙事型' : '结构化'}</span>
                    <span className="cp-pill muted">{item.id}</span>
                  </div>
                </article>
              )) : <p className="cp-empty">暂无输出类型。</p>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
