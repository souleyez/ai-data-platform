'use client';

const DESKTOP_NAV_LINKS = [
  { label: '智能会话', href: '/' },
  { label: '数据集', href: '/documents' },
  { label: '采集源', href: '/datasources' },
  { label: '报表', href: '/reports' },
  { label: '审计', href: '/audit' },
];

export default function HomeWorkspaceToolbar({
  fullIntelligenceSlot = null,
  currentPath = '/',
}) {
  return (
    <header className="card home-toolbar home-toolbar-simple">
      <div className="home-toolbar-left">
        <a href="/" className="home-toolbar-brand">
          <span className="home-toolbar-brand-mark">AI</span>
          <span className="home-toolbar-brand-name">智能助手</span>
        </a>
        <nav className="home-toolbar-nav" aria-label="桌面导航">
          {DESKTOP_NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`home-toolbar-nav-link ${item.href === currentPath ? 'active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="home-toolbar-right">
        <div className="home-toolbar-mode-slot">
          {fullIntelligenceSlot}
        </div>
      </div>
    </header>
  );
}
