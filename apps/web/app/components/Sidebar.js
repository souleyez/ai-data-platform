import { NAV_ITEMS } from '../lib/types';

export default function Sidebar({ sourceItems = [] }) {
  return (
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
        {NAV_ITEMS.map((item, index) => (
          <a key={item} className={`nav-item ${index === 0 ? 'active' : ''}`}>{item}</a>
        ))}
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
  );
}
