'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'aidp_theme_mode_v1';

function applyTheme(mode) {
  if (typeof document === 'undefined') return;
  const nextMode = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextMode;
  document.documentElement.style.colorScheme = nextMode;
}

export default function ThemeToggleButton({ compact = true }) {
  const [mode, setMode] = useState('dark');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextMode = stored === 'light' ? 'light' : 'dark';
    setMode(nextMode);
    applyTheme(nextMode);
  }, []);

  function handleToggle() {
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
    applyTheme(nextMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    }
  }

  return (
    <button
      type="button"
      className={`ghost-btn home-theme-toggle ${compact ? 'home-theme-toggle-compact' : ''}`.trim()}
      onClick={handleToggle}
      aria-pressed={mode === 'dark'}
      title={mode === 'dark' ? '切换到浅色背景' : '切换到暗色背景'}
    >
      <span className="home-theme-toggle-label">主题</span>
      <span className="home-theme-toggle-value">{mode === 'dark' ? '暗色' : '浅色'}</span>
    </button>
  );
}
