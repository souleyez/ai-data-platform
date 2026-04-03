import { cookies } from 'next/headers';
import { getAdminTokenFromCookieStore } from '../lib/admin-auth';
import { buildBackendApiUrl, safeFetchBackendJson } from '../lib/backend-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function renderCapability(value) {
  return value ? '支持' : '未启用';
}

export default async function CapabilitiesPage() {
  const cookieStore = await cookies();
  const adminToken = getAdminTokenFromCookieStore(cookieStore);
  const capabilities = await safeFetchBackendJson('/api/capabilities', adminToken);
  const summary = capabilities.data?.summary || {};
  const formats = capabilities.data?.formats || [];
  const sections = capabilities.data?.sections || [];

  return (
    <main className="cp-shell cp-subpage-shell">
      <section className="cp-subpage-hero">
        <div className="cp-hero-copy">
          <span className="cp-kicker">Read Only</span>
          <h1>能力矩阵</h1>
          <p>集中查看当前系统实际启用的格式支持、数据源方式、模板种类和输出能力。</p>
        </div>
        <div className={`cp-status-card ${capabilities.ok ? 'healthy' : 'degraded'}`}>
          <div className="cp-status-title">
            <span className={`cp-status-dot ${capabilities.ok ? 'healthy' : 'degraded'}`} />
            {capabilities.ok ? '能力矩阵已同步' : '读取失败'}
          </div>
          <p>数据源接口: <code>{buildBackendApiUrl('/api/capabilities')}</code></p>
          {capabilities.ok ? null : <p className="cp-error-note">{capabilities.error || 'ADMIN_TOKEN_REQUIRED'}</p>}
        </div>
      </section>

      <section className="cp-stat-grid">
        <article className="cp-stat-card">
          <span>格式总数</span>
          <strong>{summary.totalFormats || 0}</strong>
          <small>已登记的输入格式能力。</small>
        </article>
        <article className="cp-stat-card">
          <span>确认支持</span>
          <strong>{summary.confirmedFormats || 0}</strong>
          <small>已确认可上传、解析或索引的格式。</small>
        </article>
        <article className="cp-stat-card">
          <span>数据源类型</span>
          <strong>{summary.datasourceKinds || 0}</strong>
          <small>可接入的数据采集方式。</small>
        </article>
        <article className="cp-stat-card">
          <span>输出类型</span>
          <strong>{summary.reportOutputKinds || 0}</strong>
          <small>报告中心当前可识别的输出种类。</small>
        </article>
      </section>

      <section className="cp-grid cp-readonly-grid">
        <div className="cp-left-column">
          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>格式支持</h2>
                <p>基于主业务 API 当前注册的真实能力，不在后台重复维护。</p>
              </div>
            </div>
            <div className="cp-list">
              {formats.length ? formats.map((item) => (
                <article className="cp-row-card" key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.extensions.join(', ') || '无扩展名'}</p>
                    <p>{item.notes.join(' ')}</p>
                  </div>
                  <div className="cp-row-actions cp-readonly-tags">
                    <span className={`cp-pill ${item.status === 'confirmed' ? 'ok' : 'warn'}`}>{item.status}</span>
                    <span className="cp-pill muted">上传 {renderCapability(item.capabilities?.upload)}</span>
                    <span className="cp-pill muted">预览 {renderCapability(item.capabilities?.preview)}</span>
                    <span className="cp-pill muted">解析 {renderCapability(item.capabilities?.parse)}</span>
                    <span className="cp-pill muted">索引 {renderCapability(item.capabilities?.index)}</span>
                  </div>
                </article>
              )) : <p className="cp-empty">暂无能力数据。</p>}
            </div>
          </section>
        </div>

        <div className="cp-right-column">
          {sections.map((section) => (
            <section className="cp-list-card" key={section.id}>
              <div className="cp-card-head">
                <div>
                  <h2>{section.label}</h2>
                  <p>后台只读视图，直接反映业务端注册项。</p>
                </div>
              </div>
              <div className="cp-list">
                {section.items.map((item) => (
                  <article className="cp-row-card" key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.notes.join(' ')}</p>
                    </div>
                    <div className="cp-row-actions">
                      <span className={`cp-pill ${item.status === 'confirmed' ? 'ok' : 'warn'}`}>{item.status}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
