import { cookies } from 'next/headers';
import { getAdminTokenFromCookieStore } from '../lib/admin-auth';
import { buildBackendApiUrl, safeFetchBackendJson } from '../lib/backend-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function renderSummaryList(summary) {
  return Object.entries(summary || {}).map(([key, value]) => (
    <article className="cp-row-card" key={key}>
      <div>
        <strong>{key}</strong>
      </div>
      <div className="cp-row-actions">
        <span className="cp-pill muted">{String(value)}</span>
      </div>
    </article>
  ));
}

export default async function OperationsPage() {
  const cookieStore = await cookies();
  const adminToken = getAdminTokenFromCookieStore(cookieStore);
  const operations = await safeFetchBackendJson('/api/operations-overview', adminToken);
  const data = operations.data || {};

  return (
    <main className="cp-shell cp-subpage-shell">
      <section className="cp-subpage-hero">
        <div className="cp-hero-copy">
          <span className="cp-kicker">Read Only</span>
          <h1>运行链路</h1>
          <p>从采集、解析、输出到审计，统一查看系统当前运行状态和最近处理记录。</p>
        </div>
        <div className={`cp-status-card ${operations.ok ? 'healthy' : 'degraded'}`}>
          <div className="cp-status-title">
            <span className={`cp-status-dot ${operations.ok ? 'healthy' : 'degraded'}`} />
            {operations.ok ? '运行链路已同步' : '读取失败'}
          </div>
          <p>数据源接口: <code>{buildBackendApiUrl('/api/operations-overview')}</code></p>
          {operations.ok ? null : <p className="cp-error-note">{operations.error || 'ADMIN_TOKEN_REQUIRED'}</p>}
        </div>
      </section>

      <section className="cp-grid cp-readonly-grid">
        <div className="cp-left-column">
          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>采集概览</h2>
                <p>覆盖数据源与最近运行结果。</p>
              </div>
            </div>
            <div className="cp-list">
              {renderSummaryList(data.capture?.datasourceSummary)}
              {renderSummaryList(data.capture?.runSummary)}
            </div>
          </section>

          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>最近采集任务</h2>
                <p>显示最近完成或失败的采集运行。</p>
              </div>
            </div>
            <div className="cp-list">
              {(data.capture?.recentRuns || []).length ? data.capture.recentRuns.map((item) => (
                <article className="cp-row-card" key={item.id}>
                  <div>
                    <strong>{item.datasourceName || item.datasourceId}</strong>
                    <p>{item.summary || '无摘要'}</p>
                    <p>发现 {item.discoveredCount} | 入库 {item.ingestedCount} | 失败 {item.failedCount}</p>
                  </div>
                  <div className="cp-row-actions">
                    <span className={`cp-pill ${item.status === 'success' ? 'ok' : 'warn'}`}>{item.status}</span>
                    <span className="cp-pill muted">{item.finishedAt || '未结束'}</span>
                  </div>
                </article>
              )) : <p className="cp-empty">暂无运行记录。</p>}
            </div>
          </section>
        </div>

        <div className="cp-right-column">
          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>解析概览</h2>
                <p>文件扫描和详情解析的当前统计。</p>
              </div>
            </div>
            <div className="cp-list">
              {renderSummaryList(data.parse?.scanSummary)}
              {renderSummaryList(data.parse?.detailParseSummary)}
            </div>
          </section>

          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>最近文档</h2>
                <p>最近被解析或确认分类的文档。</p>
              </div>
            </div>
            <div className="cp-list">
              {(data.parse?.recentDocuments || []).length ? data.parse.recentDocuments.map((item) => (
                <article className="cp-row-card" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.ext} | {item.bizCategory || '未分类'}</p>
                    <p>{(item.libraries || []).join(', ') || '未入库'}</p>
                  </div>
                  <div className="cp-row-actions">
                    <span className="cp-pill muted">{item.parseStatus}</span>
                    <span className="cp-pill muted">{item.detailParseStatus}</span>
                  </div>
                </article>
              )) : <p className="cp-empty">暂无文档记录。</p>}
            </div>
          </section>

          <section className="cp-list-card">
            <div className="cp-card-head">
              <div>
                <h2>输出与审计</h2>
                <p>输出状态和清理建议汇总。</p>
              </div>
            </div>
            <div className="cp-list">
              {renderSummaryList(data.output?.summary)}
              {renderSummaryList(data.audit?.summary)}
              {(data.output?.recentOutputs || []).map((item) => (
                <article className="cp-row-card" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.groupLabel || '未分组'} | {item.templateLabel || '未标记模板'}</p>
                    <p>{item.kind} | {item.dynamic ? '动态输出' : '静态输出'}</p>
                  </div>
                  <div className="cp-row-actions">
                    <span className="cp-pill muted">{item.createdAt || '无时间'}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
