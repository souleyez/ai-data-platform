import TrendChart from './TrendChart';

function StatsCards({ stats = [] }) {
  return (
    <section className="card stats-grid">
      {stats.map((stat) => (
        <div className="stat-card" key={stat.label}>
          <div className="stat-label">{stat.label}</div>
          <div className="stat-value">{stat.value}</div>
          <div className={`stat-trend ${stat.tone}`}>{stat.trend}</div>
        </div>
      ))}
    </section>
  );
}

function RiskTable({ title, subtitle, rows = [] }) {
  return (
    <section className="card table-card">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>对象</th>
            <th>摘要</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <td>{row.code}</td>
              <td>{row.customer}</td>
              <td>{row.risk}</td>
              <td>
                <span className={`tag ${row.tone}`}>{row.level}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function InsightPanel({ panel }) {
  const safePanel = panel || {
    stats: [],
    chartTitle: '暂无图表',
    chartSubtitle: '当前没有可展示的数据',
    chartBars: [],
    tableTitle: '暂无列表',
    tableSubtitle: '当前没有可展示的数据',
    rows: [],
  };

  return (
    <div className="insight-panel">
      <StatsCards stats={safePanel.stats} />

      <section className="card chart-card">
        <div className="panel-header">
          <div>
            <h3>{safePanel.chartTitle}</h3>
            <p>{safePanel.chartSubtitle}</p>
          </div>
        </div>
        <TrendChart bars={safePanel.chartBars} title={safePanel.chartTitle} />
      </section>

      <RiskTable title={safePanel.tableTitle} subtitle={safePanel.tableSubtitle} rows={safePanel.rows} />
    </div>
  );
}
