'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BellRing,
  CalendarDays,
  CloudOff,
  Download,
  Focus,
  Flower2,
  Gift,
  LineChart,
  ListTodo,
  MoreHorizontal,
  Palette,
  Repeat,
  Settings as SettingsIcon,
  Sun,
  Timer,
  Sunrise as TodayIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { formatJalaliDate, formatGregorianDate, formatMinutesOfDay, toPersianDigits } from '@/lib/date/format';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/primitives';
import { TaskEditorProvider } from '@/features/tasks/TaskEditorProvider';
import type { BeforeInstallPromptEvent } from '@/types/browser';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  mobile?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'امروز', icon: <TodayIcon className="h-[1.05rem] w-[1.05rem]" />, mobile: true },
  { href: '/schedule', label: 'برنامه', icon: <CalendarDays className="h-[1.05rem] w-[1.05rem]" />, mobile: true },
  { href: '/progress', label: 'پیشرفت', icon: <LineChart className="h-[1.05rem] w-[1.05rem]" />, mobile: true },
  { href: '/tasks', label: 'تسک‌ها', icon: <ListTodo className="h-[1.05rem] w-[1.05rem]" />, mobile: true },
  { href: '/focus', label: 'تمرکز', icon: <Timer className="h-[1.05rem] w-[1.05rem]" />, mobile: true },
  { href: '/calendar', label: 'تقویم', icon: <CalendarDays className="h-[1.05rem] w-[1.05rem]" /> },
  { href: '/rewards', label: 'پاداش‌ها', icon: <Gift className="h-[1.05rem] w-[1.05rem]" /> },
  { href: '/report', label: 'بازخورد مشاور', icon: <Flower2 className="h-[1.05rem] w-[1.05rem]" /> },
  { href: '/recurring', label: 'تکرارشونده‌ها', icon: <Repeat className="h-[1.05rem] w-[1.05rem]" /> },
  { href: '/habits', label: 'عادت‌ها', icon: <Focus className="h-[1.05rem] w-[1.05rem]" /> },
  { href: '/import-export', label: 'ورود / خروج', icon: <Download className="h-[1.05rem] w-[1.05rem]" /> },
  { href: '/stats', label: 'آمار', icon: <BarChart3 className="h-[1.05rem] w-[1.05rem]" /> },
  { href: '/appearance', label: 'ظاهر', icon: <Palette className="h-[1.05rem] w-[1.05rem]" /> },
  { href: '/settings', label: 'تنظیمات', icon: <SettingsIcon className="h-[1.05rem] w-[1.05rem]" /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { settings } = useSettings();
  const { now, clockReady } = usePlanner();
  const [online, setOnline] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const prompt = event as CustomEvent<BeforeInstallPromptEvent>;
      setInstallEvent(prompt.detail);
    };
    window.addEventListener('planner:install-available', handler as EventListener);
    return () => window.removeEventListener('planner:install-available', handler as EventListener);
  }, []);


  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const dateLabel =
    settings.calendar === 'persian'
      ? formatJalaliDate(now.date, { persianDigits: settings.persianDigits, withWeekday: true })
      : formatGregorianDate(now.date, settings.persianDigits);
  const clock = formatMinutesOfDay(now.minutes, settings);
  const primary = NAV_ITEMS.filter((item) => item.mobile);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 lg:h-16 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-fg">
                <Sun className="h-4.5 w-4.5" />
              </span>
              <span className="hidden text-sm sm:block">برنامه‌ریز من</span>
            </Link>
            <span className="hidden h-6 w-px bg-line sm:block" />
            <div className="min-w-0">
              {clockReady ? (
                <p className="truncate text-xs text-muted sm:text-sm">{dateLabel}</p>
              ) : (
                <span className="block h-3.5 w-24 animate-pulse rounded bg-surface2" aria-hidden />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {clockReady ? (
              <span className="numeral hidden rounded-full border border-line bg-surface2 px-3 py-1 text-xs font-medium sm:inline-block">
                {clock}
              </span>
            ) : null}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem]',
                online
                  ? 'border-line bg-surface2 text-muted'
                  : 'border-[color-mix(in_oklab,var(--warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] text-[var(--warning)]',
              )}
              title={online ? 'اتصال برقرار است' : 'حالت آفلاین — همه‌چیز محلی کار می‌کند'}
            >
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{online ? 'آنلاین' : 'آفلاین'}</span>
            </span>
            {installEvent ? (
              <Button
                size="sm"
                variant="soft"
                onClick={async () => {
                  await installEvent.prompt();
                  setInstallEvent(null);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                نصب
              </Button>
            ) : null}
            {!settings.notifications.enabled ? (
              <Link
                href="/settings"
                title="یادآورها خاموش است"
                className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-surface2"
              >
                <BellRing className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 pb-24 pt-5 lg:px-6 lg:pb-10">
        {/* sidebar (desktop) */}
        <aside className="sticky top-24 hidden h-fit w-56 shrink-0 lg:block">
          <nav className="space-y-1" aria-label="ناوبری اصلی">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors',
                  active(item.href)
                    ? 'bg-accent-soft font-medium text-accent'
                    : 'text-muted hover:bg-surface2 hover:text-fg',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 rounded-card border border-dashed border-line p-3 text-[0.7rem] leading-6 text-subtle">
            <div className="mb-1 flex items-center gap-1.5 text-muted">
              <CloudOff className="h-3.5 w-3.5" />
              داده‌ها فقط روی همین دستگاه
            </div>
            تسک‌ها، تنظیمات و تاریخچه در IndexedDB مرورگر ذخیره می‌شوند و آفلاین هم کار می‌کنند.
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1">
          <TaskEditorProvider>{children}</TaskEditorProvider>
        </main>
      </div>

      {/* bottom nav (mobile) */}
      <nav
        aria-label="ناوبری موبایل"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-2">
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.65rem] transition-colors',
                active(item.href) ? 'text-accent' : 'text-muted',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.65rem] transition-colors',
              NAV_ITEMS.some((item) => !item.mobile && active(item.href)) ? 'text-accent' : 'text-muted',
            )}
          >
            <MoreHorizontal className="h-[1.05rem] w-[1.05rem]" />
            بیشتر
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="بیشتر" size="sm">
        <div className="grid grid-cols-2 gap-2">
          {NAV_ITEMS.filter((item) => !item.mobile).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className={cn(
                'flex items-center gap-2.5 rounded-control border border-line px-3 py-3 text-sm transition-colors',
                active(item.href) ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface2',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
        <p className="mt-4 text-center text-[0.7rem] text-subtle">
          {clockReady ? `${toPersianDigits(now.hh)}:${toPersianDigits(String(now.mm).padStart(2, '0'))} — ${dateLabel}` : '—'}
        </p>
      </Modal>
    </div>
  );
}
