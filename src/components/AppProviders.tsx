'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { SettingsProvider, useApplySettings, useSettings } from '@/hooks/useSettings';
import { PlannerProvider } from '@/hooks/usePlanner';
import { ProgressProvider } from '@/hooks/useProgress';
import { CelebrationOverlay } from '@/features/today/TodaySidebar';
import { ToastProvider } from '@/components/ui/toast';
import { diagnoseStorage } from '@/services/db';
import type { BeforeInstallPromptEvent } from '@/types/browser';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <ThemeBridge />
      <PlannerProvider>
        <ToastProvider>
          <ProgressProvider>
            <StorageDiagnostics />
            <ServiceWorkerBridge />
            {children}
            <CelebrationOverlay />
          </ProgressProvider>
        </ToastProvider>
      </PlannerProvider>
    </SettingsProvider>
  );
}

function ThemeBridge() {
  const { settings } = useSettings();
  useApplySettings(settings);
  return null;
}

/** Registers the service worker and exposes the PWA install prompt. */
function ServiceWorkerBridge() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((error) => {
          console.warn('ثبت سرویس‌ورکر ناموفق بود', error);
        });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const prompt = event as BeforeInstallPromptEvent;
      prompt.preventDefault();
      window.dispatchEvent(new CustomEvent('planner:install-available', { detail: prompt }));
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  return null;
}

/** Surfaces IndexedDB problems instead of failing silently. */
function StorageDiagnostics() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await diagnoseStorage();
        if (!cancelled && !result.ok) setMessage(result.message);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'خطای ناشناخته در پایگاه داده محلی.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;
  return (
    <div
      role="alert"
      className="border-b border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-4 py-2 text-center text-xs text-[var(--danger)]"
    >
      {message}
    </div>
  );
}
