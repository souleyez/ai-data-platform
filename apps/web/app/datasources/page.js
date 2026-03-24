'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { normalizeDatasourceResponse } from '../lib/types';
import { sourceItems } from '../lib/mock-data';

const ACADEMIC_SOURCE_PRESETS = [
  {
    key: 'pmc',
    name: 'PubMed Central',
    authority: 'NIH / NLM',
    url: 'https://pmc.ncbi.nlm.nih.gov/',
    focus: '公开全文论文、研究摘要、结论、方法、关键词',
    note: '适合持续采集公开医学与生命科学全文论文。',
  },
  {
    key: 'arxiv',
    name: 'arXiv',
    authority: 'Cornell University',
    url: 'https://arxiv.org/',
    focus: '最新预印本论文、摘要、方法、技术路线、结论',
    note: '适合持续跟踪 AI、计算机科学、数学等前沿研究。',
  },
  {
    key: 'doaj',
    name: 'DOAJ',
    authority: 'Directory of Open Access Journals',
    url: 'https://doaj.org/',
    focus: '开放获取论文、期刊主页、摘要、主题标签',
    note: '适合发现可公开访问的权威开放论文来源。',
  },
  {
    key: 'who-iris',
    name: 'WHO IRIS',
    authority: 'World Health Organization',
    url: 'https://iris.who.int/',
    focus: '公共卫生研究报告、论文摘要、结论、政策建议',
    note: '适合采集 WHO 公开发布的健康研究与报告。',
  },
];

function formatDateTime(value) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatRelative(value) {
  if (!value) return '暂无记录';
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return value;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function formatFrequency(value) {
  if (value === 'daily') return '每日';
  if (value === 'weekly') return '每周';
  return '手动';
}

function formatStatus(value) {
  if (value === 'success' || value === 'connected') return '正常';
  if (value === 'warning') return '波动';
  if (value === 'error') return '异常';
  if (value === 'idle') return '未启动';
  return value || '未知';
}

function StatCard({ label, value, subtle, tone = 'neutral' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {subtle ? <div className={`stat-trend ${tone}`}>{subtle}</div> : null}
    </div>
  );
}

function CaptureStatusBadge({ task }) {
  const tone = task.status === 'success' ? 'up-tag' : task.status === 'error' ? 'danger' : 'neutral-tag';
  const animated = task.frequency !== 'manual';

  return (
    <span className={`tag ${tone} ${animated ? 'capture-live-tag' : ''}`}>
      {animated ? <span className="capture-live-dot" /> : null}
      {formatStatus(task.status)}
    </span>
  );
}

export default function DatasourcesPage() {
  const [data, setData] = useState(null);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [presetFrequency, setPresetFrequency] = useState('weekly');
  const [presetTopic, setPresetTopic] = useState('');
  const [presetMaxItems, setPresetMaxItems] = useState('5');
  const [presetSubmittingKey, setPresetSubmittingKey] = useState('');
  const [presetMessage, setPresetMessage] = useState('');

  async function load() {
    try {
      setError('');
      const [datasourcesResponse, capturesResponse] = await Promise.all([
        fetch(buildApiUrl('/api/datasources')),
        fetch(buildApiUrl('/api/web-captures')),
      ]);
      if (!datasourcesResponse.ok || !capturesResponse.ok) throw new Error('load datasources failed');

      const datasourcesJson = await datasourcesResponse.json();
      const capturesJson = await capturesResponse.json();
      const normalized = normalizeDatasourceResponse({
        ...datasourcesJson,
        captureTasks: Array.isArray(capturesJson?.items) ? capturesJson.items : [],
        meta: {
          ...(datasourcesJson?.meta || {}),
          latestCaptureAt: (capturesJson?.items || [])
            .map((item) => item.lastRunAt || '')
            .filter(Boolean)
            .sort()
            .at(-1) || '',
          captureSuccess: capturesJson?.meta?.success || 0,
          captureError: capturesJson?.meta?.error || 0,
          captureScheduled: capturesJson?.meta?.scheduled || 0,
        },
      });

      setData(normalized);
      if (normalized.items.length) setSidebarSources(normalized.items);
    } catch {
      setError('数据源接口暂时不可用');
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  const normalizedKeyword = keyword.trim().toLowerCase();
  const captureTasks = useMemo(() => {
    const items = data?.captureTasks || [];
    if (!normalizedKeyword) return items;
    return items.filter((item) => (
      item.title?.toLowerCase().includes(normalizedKeyword)
      || item.url?.toLowerCase().includes(normalizedKeyword)
      || item.summary?.toLowerCase().includes(normalizedKeyword)
      || item.focus?.toLowerCase().includes(normalizedKeyword)
    ));
  }, [data, normalizedKeyword]);

  const activeScheduledCount = data?.meta?.captureScheduled || 0;
  const latestCaptureAt = data?.meta?.latestCaptureAt || '';
  const successCount = data?.meta?.captureSuccess || 0;
  const errorCount = data?.meta?.captureError || 0;

  const createPresetCapture = async (preset) => {
    if (presetSubmittingKey) return;

    const topic = presetTopic.trim();
    const mergedFocus = topic ? `${preset.focus}；主题关键词：${topic}` : preset.focus;
    const mergedNote = [
      `固定学术站点采集：${preset.name}`,
      preset.authority,
      preset.note,
      topic ? `主题关键词：${topic}` : '',
    ].filter(Boolean).join(' / ');

    try {
      setPresetSubmittingKey(preset.key);
      setPresetMessage('');

      const response = await fetch(buildApiUrl('/api/web-captures'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: preset.url,
          focus: mergedFocus,
          frequency: presetFrequency,
          note: mergedNote,
          maxItems: Number(presetMaxItems || 5),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'create preset capture failed');

      setPresetMessage(`${preset.name} 已加入${formatFrequency(presetFrequency)}采集，单次最多 ${presetMaxItems || '5'} 篇，且已按高质量优先去重抓取。`);
      await load();
    } catch (captureError) {
      setPresetMessage(captureError instanceof Error ? captureError.message : '固定站点采集创建失败');
    } finally {
      setPresetSubmittingKey('');
    }
  };

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/datasources" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>AI 知识库</h2>
            <p>现在不仅显示是否接入，还会展示固定站点采集是否在持续工作、最近一次抓取时间，以及具体采到并入库的内容。</p>
          </div>
        </header>

        {error ? <p>{error}</p> : null}

        {data ? (
          <section className="documents-layout">
            <section className="documents-grid three-columns">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>运行总览</h3>
                    <p>一眼判断固定站点采集是否真的在转。</p>
                  </div>
                </div>
                <div className="summary-grid">
                  <StatCard label="定时任务中" value={String(activeScheduledCount)} subtle={activeScheduledCount ? 'worker 会周期检查并到期执行' : '当前只有手动采集'} tone="up" />
                  <StatCard label="采集成功源" value={String(successCount)} subtle={successCount ? '已抓取并写入文档中心' : '尚未成功抓取'} tone="up" />
                  <StatCard label="异常源" value={String(errorCount)} subtle={errorCount ? '建议查看最近错误' : '目前没有失败记录'} tone={errorCount ? 'warning' : 'neutral'} />
                  <StatCard label="最近采集" value={latestCaptureAt ? formatDateTime(latestCaptureAt) : '未开始'} subtle={latestCaptureAt ? formatRelative(latestCaptureAt) : '等待首次抓取'} tone="neutral" />
                </div>
              </section>

              <section className="card documents-card" style={{ gridColumn: 'span 2' }}>
                <div className="panel-header">
                  <div>
                    <h3>采集状态</h3>
                    <p>这里会持续刷新，15 秒自动更新一次。</p>
                  </div>
                </div>
                <div className={`capture-health-banner ${activeScheduledCount ? 'healthy' : 'standby'}`}>
                  <div className="capture-health-title">
                    <span className={`capture-health-dot ${activeScheduledCount ? 'live' : 'idle'}`} />
                    {activeScheduledCount
                      ? `固定站点采集已接入调度，当前有 ${activeScheduledCount} 个定时任务`
                      : '固定站点采集已接入，但当前还没有定时任务在跑'}
                  </div>
                  <div className="capture-health-text">
                    {latestCaptureAt
                      ? `最近一次抓取时间：${formatDateTime(latestCaptureAt)}，成功源 ${successCount} 个，异常源 ${errorCount} 个。`
                      : '你创建固定站点采集后，会先立即抓取一次；设置为每日或每周后，worker 会继续按计划检查并执行。'}
                  </div>
                </div>

                <input
                  className="filter-input"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索站点名、网址、摘要、主题关键词"
                />
              </section>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>固定学术站点采集</h3>
                  <p>预置公开且权威的学术来源。加入后会立即抓取一次，若选择每日或每周，后续由 worker 自动续跑。</p>
                </div>
                <div style={{ minWidth: 180 }}>
                  <select className="filter-input" value={presetFrequency} onChange={(event) => setPresetFrequency(event.target.value)}>
                    <option value="manual">手动抓取一次</option>
                    <option value="daily">每日持续采集</option>
                    <option value="weekly">每周持续采集</option>
                  </select>
                </div>
              </div>

              <div className="documents-grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 2fr)', marginBottom: 16 }}>
                <div className="summary-item" style={{ display: 'grid', gap: 8 }}>
                  <div className="summary-key">主题关键词</div>
                  <div className="capture-task-note">例如：奶粉配方、肠道菌群、抑郁、睡眠、脑健康。</div>
                </div>
                <div className="summary-item" style={{ display: 'grid', gap: 10 }}>
                  <input
                    className="filter-input"
                    value={presetTopic}
                    onChange={(event) => setPresetTopic(event.target.value)}
                    placeholder="可选：输入本轮重点追踪的论文主题"
                  />
                  <div className="capture-task-meta">
                    主题关键词会随固定站点一起进入采集任务，后续更适合做按知识库分组沉淀和定向分析。
                  </div>
                </div>
              </div>

              <div className="documents-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginBottom: 16 }}>
                <div className="summary-item" style={{ display: 'grid', gap: 10 }}>
                  <div className="summary-key">单次采集上限</div>
                  <select className="filter-input" value={presetMaxItems} onChange={(event) => setPresetMaxItems(event.target.value)}>
                    <option value="3">3 篇</option>
                    <option value="5">5 篇</option>
                    <option value="8">8 篇</option>
                    <option value="10">10 篇</option>
                  </select>
                </div>
                <div className="summary-item" style={{ display: 'grid', gap: 8 }}>
                  <div className="summary-key">采集策略</div>
                  <div className="capture-task-note">默认高质量优先，不追求抓全。同链接与相近标题会自动去重，避免重复入库。</div>
                </div>
              </div>

              {presetMessage ? <div className="page-note">{presetMessage}</div> : null}

              <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {ACADEMIC_SOURCE_PRESETS.map((preset) => (
                  <div key={preset.key} className="summary-item" style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{preset.name}</div>
                      <div className="capture-task-meta">{preset.authority}</div>
                    </div>
                    <div className="capture-task-note">{preset.note}</div>
                    <div className="capture-task-meta">采集重点：{preset.focus}</div>
                    {presetTopic.trim() ? <div className="capture-task-meta">当前主题关键词：{presetTopic.trim()}</div> : null}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <a className="ghost-btn back-link" href={preset.url} target="_blank" rel="noreferrer">打开站点</a>
                      <button className="primary-btn" onClick={() => createPresetCapture(preset)} disabled={presetSubmittingKey === preset.key}>
                        {presetSubmittingKey === preset.key ? '加入中...' : '加入固定采集'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>持续工作中的采集任务</h3>
                  <p>这里专门展示固定地址采集的运行状态、上次抓取时间和下次计划时间。</p>
                </div>
              </div>

              <div className="capture-task-grid">
                {captureTasks.filter((task) => task.frequency !== 'manual').map((task) => (
                  <article key={task.id} className="capture-task-card">
                    <div className="capture-task-card-head">
                      <div>
                        <div className="capture-task-title">{task.title}</div>
                        <div className="capture-task-meta">{task.url}</div>
                      </div>
                      <CaptureStatusBadge task={task} />
                    </div>
                    <div className="capture-task-line">
                      <span>采集频率</span>
                      <strong>{formatFrequency(task.frequency)}</strong>
                    </div>
                    <div className="capture-task-line">
                      <span>单次上限</span>
                      <strong>{task.maxItems || 5} 篇</strong>
                    </div>
                    <div className="capture-task-line">
                      <span>最近运行</span>
                      <strong>{formatDateTime(task.lastRunAt)}</strong>
                    </div>
                    <div className="capture-task-line">
                      <span>下次计划</span>
                      <strong>{task.nextRunAt ? formatDateTime(task.nextRunAt) : '待调度'}</strong>
                    </div>
                    <div className="capture-task-line">
                      <span>本次入库</span>
                      <strong>{task.collectedCount || 0} 篇</strong>
                    </div>
                    <div className="capture-task-line">
                      <span>关注内容</span>
                      <strong>{task.focus || '未设置'}</strong>
                    </div>
                    <div className="capture-task-note">{task.summary || '暂无采集摘要'}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <a className="ghost-btn back-link" href={task.url} target="_blank" rel="noreferrer">源站地址</a>
                      <a className="ghost-btn back-link" href="/documents">查看文档中心</a>
                    </div>
                    {task.collectedItems?.length ? (
                      <div className="capture-result-list">
                        {task.collectedItems.map((item, index) => (
                          <div key={`${task.id}-${index}`} className="capture-result-item">
                            <strong>{index + 1}. {item.title}</strong>
                            <div className="capture-task-meta">{item.url}</div>
                            <div className="capture-task-note">{item.summary}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

              {!captureTasks.filter((task) => task.frequency !== 'manual').length ? (
                <div className="empty-state-card">当前还没有每日或每周的固定站点采集任务。</div>
              ) : null}
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>采集完成并已入库的内容</h3>
                  <p>这里直接展示最近实际抓到的内容，不再只写“已完成”。</p>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>内容标题</th>
                    <th>来源站点</th>
                    <th>最近采集</th>
                    <th>采集摘要</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {captureTasks.map((task) => (
                    <tr key={`${task.id}-content`}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{task.title}</div>
                        <div className="capture-task-meta">{formatFrequency(task.frequency)}采集</div>
                      </td>
                      <td className="summary-cell">{task.url}</td>
                      <td>{formatDateTime(task.lastRunAt)}</td>
                      <td className="summary-cell">{task.summary || '暂无摘要'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <a className="ghost-btn back-link" href={task.url} target="_blank" rel="noreferrer">原站</a>
                          <a className="ghost-btn back-link" href="/documents">文档中心</a>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!captureTasks.length ? (
                    <tr><td colSpan={5} className="summary-cell">当前还没有采集结果。你可以先在上方加入一个固定站点采集。</td></tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}
