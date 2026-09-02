'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  detail?: string;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastTone, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: ToastTone = 'info', detail?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current.slice(-3), { id, message, tone, detail }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, detail ? 8000 : 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border bg-surface px-4 py-3 shadow-lg animate-slide-up',
              toast.tone === 'error' ? 'border-[color-mix(in_oklab,var(--danger)_40%,transparent)]' : 'border-line',
            )}
          >
            <span
              className={cn(
                'mt-0.5',
                toast.tone === 'success' && 'text-[var(--success)]',
                toast.tone === 'error' && 'text-[var(--danger)]',
                toast.tone === 'info' && 'text-accent',
              )}
            >
              {toast.tone === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : toast.tone === 'error' ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium leading-6">{toast.message}</p>
              {toast.detail ? <p className="mt-0.5 text-xs leading-5 text-muted">{toast.detail}</p> : null}
            </div>
            <button
              type="button"
              aria-label="بستن پیام"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              className="text-subtle transition-colors hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) return { push: () => undefined } as ToastContextValue;
  return context;
}
