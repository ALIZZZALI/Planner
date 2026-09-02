'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { settingsRepository } from '@/services/repositories';
import { useLiveData } from '@/services/useLiveData';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { isValidTimeZone } from '@/lib/date/timezone';
import type { Settings } from '@/types';

export interface SettingsContextValue {
  settings: Settings;
  ready: boolean;
  error: string | null;
  update: (patch: Partial<Settings>) => Promise<void>;
  reset: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, loading, error } = useLiveData<Settings>(
    () => settingsRepository.load(),
    [],
    DEFAULT_SETTINGS,
  );
  const [local, setLocal] = useState<Settings>(DEFAULT_SETTINGS);
  const [synced, setSynced] = useState<Settings | null>(null);
  const ready = !loading && !error;

  // Adjust local state while rendering (React's recommended alternative to an
  // effect) whenever the repository emits a newer snapshot.
  if (data && data !== synced) {
    setSynced(data);
    setLocal(data);
  }

  const update = useCallback(async (patch: Partial<Settings>) => {
    setLocal((current) => {
      const next: Settings = {
        ...current,
        ...patch,
        showSections: { ...current.showSections, ...(patch.showSections ?? {}) },
        notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
        focus: { ...current.focus, ...(patch.focus ?? {}) },
      };
      return next;
    });
    try {
      const saved = await settingsRepository.save(patch);
      setLocal(saved);
    } catch (saveError) {
      throw new Error(
        saveError instanceof Error ? saveError.message : 'ذخیره‌ی تنظیمات ناموفق بود.',
      );
    }
  }, []);

  const reset = useCallback(async () => {
    const value = await settingsRepository.reset();
    setLocal(value);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings: local, ready, error, update, reset }),
    [local, ready, error, update, reset],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings باید داخل SettingsProvider استفاده شود.');
  return context;
}

/** Applies settings to the document as data-attributes + theme color. */
export function useApplySettings(settings: Settings) {
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark =
      typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
    root.dataset.theme = theme;
    root.dataset.accent = settings.accent;
    root.dataset.fontSize = settings.fontSize;
    root.dataset.density = settings.density;
    root.dataset.roundness = settings.roundness;
    root.dataset.preset = settings.themePreset ?? 'default';
    root.dataset.timeline = settings.timelineStyle;
    root.lang = 'fa-IR';
    root.dir = 'rtl';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#15161a' : '#f7f8fb';
  }, [
    settings.theme,
    settings.accent,
    settings.fontSize,
    settings.density,
    settings.roundness,
    settings.timelineStyle,
    settings.themePreset,
  ]);

  useEffect(() => {
    if (settings.theme !== 'system' || typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [settings.theme]);
}

export function resolveTimezone(settings: Settings): string {
  return isValidTimeZone(settings.timezone) ? settings.timezone : 'Asia/Tehran';
}
