'use client';

import { useEffect, useState } from 'react';

export default function useMobileViewport() {
  const [mobileViewport, setMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateViewport = () => setMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  return mobileViewport;
}
