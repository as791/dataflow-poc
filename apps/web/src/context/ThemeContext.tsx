import { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeCtx {
  dark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ dark: false, mode: 'system', setMode: () => {}, toggle: () => {} });

function systemDark() { return window.matchMedia('(prefers-color-scheme: dark)').matches; }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const v = localStorage.getItem('theme');
    return v === 'dark' || v === 'light' || v === 'system' ? v : 'system';
  });

  const dark = mode === 'system' ? systemDark() : mode === 'dark';

  const setMode = (m: ThemeMode) => {
    localStorage.setItem('theme', m);
    setModeState(m);
  };

  const toggle = () => setMode(mode === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Re-apply when OS preference changes (only when mode === 'system')
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => document.documentElement.classList.toggle('dark', mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ dark, mode, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
