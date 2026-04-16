'use client';

import Link from 'next/link';

export default function DesktopRequiredNotice({
  title = '请在 PC 端继续操作',
  description = '当前页面的编辑能力仅在 PC 端开放。你可以先回到首页继续对话，稍后再在电脑端处理。',
  primaryHref = '/',
  primaryLabel = '返回首页继续对话',
  secondaryHref = '',
  secondaryLabel = '',
}) {
  return (
    <main className="mobile-desktop-required">
      <section className="mobile-desktop-required-card">
        <span className="mobile-desktop-required-kicker">移动端提示</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="mobile-desktop-required-actions">
          <Link className="primary-btn" href={primaryHref}>
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link className="ghost-btn" href={secondaryHref}>
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
