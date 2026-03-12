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
  return (
    <div className="insight-panel">
      <StatsCards stats={panel.stats} />

      <section className="card chart-card">
        <div className="panel-header">
          <div>
            <h3>{panel.chartTitle}</h3>
            <p>{panel.chartSubtitle}</p>
          </div>
        </div>
        <TrendChart bars={panel.chartBars} title={panel.chartTitle} />
      </section>

      <RiskTable title={panel.tableTitle} subtitle={panel.tableSubtitle} rows={panel.rows} />
    </div>
  );
}
