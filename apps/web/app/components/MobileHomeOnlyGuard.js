'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import useMobileViewport from '../lib/use-mobile-viewport';

export default function MobileHomeOnlyGuard({ children }) {
  const mobileViewport = useMobileViewport();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const shouldRedirectHome = mobileViewport && pathname !== '/';

  useEffect(() => {
    if (!shouldRedirectHome) return;
    router.replace('/');
  }, [router, shouldRedirectHome]);

  if (shouldRedirectHome) {
    return (
      <div className="mobile-route-guard">
        <strong>移动端只保留首页工作台</strong>
        <p>正在返回首页。</p>
      </div>
    );
  }

  return children;
}
