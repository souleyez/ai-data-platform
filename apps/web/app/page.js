const sourceItems = [
  { name: '合同文档库', status: 'success' },
  { name: '技术文档目录', status: 'success' },
  { name: 'ERP 订单库', status: 'warning' },
  { name: 'OA 流程数据库', status: 'success' },
  { name: '商城后台采集', status: 'idle' },
];

const stats = [
  { label: '本月订单额', value: '¥ 1,286,300', trend: '+12.4%', tone: 'up' },
  { label: '合同风险数', value: '3', trend: '待关注', tone: 'warning' },
  { label: '文档总量', value: '2,481', trend: '已索引', tone: 'neutral' },
];

const risks = [
  { code: 'HT-2026-018', customer: '华东某项目', risk: '付款节点不明确', level: '高', tone: 'danger' },
  { code: 'HT-2026-024', customer: '某设备采购', risk: '违约责任偏弱', level: '中', tone: 'warning' },
  { code: 'HT-2026-031', customer: '系统集成服务', risk: '付款周期过长', level: '中', tone: 'warning' },
];

const chartBars = [
  { month: '10月', height: '32%' },
  { month: '11月', height: '48%' },
  { month: '12月', height: '40%' },
  { month: '1月', height: '61%' },
  { month: '2月', height: '72%' },
  { month: '3月', height: '84%', active: true },
];

export default function HomePage() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">AI</div>
          <div>
            <h1>数据分析中台</h1>
            <p>OpenClaw 定制版</p>
          </div>
        </div>

        <nav className="nav-section">
          <div className="nav-title">工作台</div>
          <a className="nav-item active">智能问答</a>
          <a className="nav-item">文档中心</a>
          <a className="nav-item">数据源管理</a>
          <a className="nav-item">报表中心</a>
          <a className="nav-item">审计日志</a>
        </nav>

        <section className="side-card">
          <div className="card-title">已连接数据源</div>
          <ul className="source-list">
            {sourceItems.map((item) => (
              <li key={item.name}>
                <span className={`dot ${item.status}`}></span>
                {item.name}
              </li>
            ))}
          </ul>
        </section>

        <section className="side-card compact">
          <div className="card-title">只读模式</div>
          <p>当前系统默认只读：禁止写入、删除、修改客户原系统。</p>
        </section>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>企业智能分析助手</h2>
            <p>面向文档、数据库、订单、流程和商城数据的统一问答与报表分析</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn">新建会话</button>
            <button className="primary-btn">生成日报</button>
          </div>
        </header>

        <section className="workspace-grid">
          <div className="chat-panel card">
            <div className="panel-header">
              <div>
                <h3>对话中心</h3>
                <p>支持企业经营问答、合同归纳、技术文档总结、订单分析</p>
              </div>
              <span className="badge">只读分析</span>
            </div>

            <div className="chat-messages">
              <div className="message assistant">
                <div className="avatar">AI</div>
                <div className="bubble">
                  <strong>今日概览</strong>
                  <p>本周订单金额较上周增长 12.4%，退款率下降 1.8%。合同库新增 16 份，其中 3 份存在付款节点风险。</p>
                  <div className="message-meta">来源：ERP 订单库 / 合同文档库</div>
                </div>
              </div>

              <div className="message user">
                <div className="avatar user-avatar">U</div>
                <div className="bubble user-bubble">帮我总结一下本月订单趋势，并标出高风险合同。</div>
              </div>

              <div className="message assistant">
                <div className="avatar">AI</div>
                <div className="bubble">
                  <p>我会从以下只读数据源汇总：</p>
                  <ul>
                    <li>ERP 订单明细表</li>
                    <li>商城订单统计表</li>
                    <li>合同文档目录（已结构化）</li>
                  </ul>
                  <p>右侧将显示趋势图、风险合同列表和来源引用。</p>
                </div>
              </div>
            </div>

            <div className="quick-actions">
              <button>订单趋势分析</button>
              <button>合同风险归纳</button>
              <button>技术文档汇总</button>
              <button>生成周报</button>
            </div>

            <div className="chat-input-row">
              <textarea placeholder="输入问题，例如：最近30天哪些客户订单下滑最明显？" />
              <button className="primary-btn send-btn">发送</button>
            </div>
          </div>

          <div className="insight-panel">
            <section className="card stats-grid">
              {stats.map((stat) => (
                <div className="stat-card" key={stat.label}>
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-value">{stat.value}</div>
                  <div className={`stat-trend ${stat.tone}`}>{stat.trend}</div>
                </div>
              ))}
            </section>

            <section className="card chart-card">
              <div className="panel-header">
                <div>
                  <h3>订单趋势</h3>
                  <p>近 6 个月订单金额模拟图</p>
                </div>
              </div>
              <div className="fake-chart bars">
                {chartBars.map((bar) => (
                  <div key={bar.month} className={`bar${bar.active ? ' active' : ''}`} style={{ height: bar.height }}>
                    <span>{bar.month}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card table-card">
              <div className="panel-header">
                <div>
                  <h3>高风险合同</h3>
                  <p>按付款条款、期限、违约责任综合识别</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>合同编号</th>
                    <th>客户</th>
                    <th>风险项</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((risk) => (
                    <tr key={risk.code}>
                      <td>{risk.code}</td>
                      <td>{risk.customer}</td>
                      <td>{risk.risk}</td>
                      <td>
                        <span className={`tag ${risk.tone}`}>{risk.level}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
