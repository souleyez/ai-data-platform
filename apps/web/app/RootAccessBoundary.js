'use client';

import { usePathname } from 'next/navigation';
import AccessGate from './components/AccessGate';

const PUBLIC_PATH_PREFIXES = ['/shared/report'];

export default function RootAccessBoundary({ children }) {
  const pathname = usePathname() || '/';
  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isPublicPath) {
    return children;
  }

  return <AccessGate>{children}</AccessGate>;
}
