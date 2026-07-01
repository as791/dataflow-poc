import { createContext, useContext, useState, type ReactNode } from 'react';

export interface Settings {
  defaultEnv: '' | 'test' | 'prod';
  timeFormat: '12h' | '24h';
}

const DEFAULTS: Settings = { defaultEnv: '', timeFormat: '12h' };
const STORAGE_KEY = 'df:settings';

function load(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }; }
  catch { return DEFAULTS; }
}

interface SettingsCtx {
  settings: Settings;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}

const Ctx = createContext<SettingsCtx>({ settings: DEFAULTS, set: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [k]: v };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return <Ctx.Provider value={{ settings, set }}>{children}</Ctx.Provider>;
}

export function useSettings() { return useContext(Ctx); }
