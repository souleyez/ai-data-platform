'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: '总览' },
  { href: '/capabilities', label: '能力矩阵' },
  { href: '/operations', label: '运行链路' },
  { href: '/report-standards', label: '模板标准' },
];

export default function ControlPlaneNav() {
  const pathname = usePathname();

  return (
    <nav className="cp-topnav" aria-label="Control plane navigation">
      <div className="cp-topnav-brand">
        <span className="cp-kicker">Control Plane</span>
        <strong>管理后台</strong>
      </div>
      <div className="cp-topnav-links">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`cp-topnav-link ${active ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
