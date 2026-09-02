'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer as TimerIcon } from 'lucide-react';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { Badge, Button, Card, EmptyState, Segmented } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { addDays } from '@/lib/date/iso';
import { formatDuration, toPersianDigits } from '@/lib/date/format';

type Mode = 'short' | 'long' | 'custom';

export function FocusScreen() {
  const { settings, update } = useSettings();
  const { tasks, now, focusSessions, addFocusSession, toggleCompletion } = usePlanner();
  const { push } = useToast();
  const [mode, setMode] = useState<Mode>('short');
  const [customMinutes, setCustomMinutes] = useState(40);
  const [secondsLeft, setSecondsLeft] = useState(settings.focus.short * 60);
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const plannedRef = useRef<number>(settings.focus.short);

  const duration = useMemo(
    () => (mode === 'short' ? settings.focus.short : mode === 'long' ? 50 : customMinutes),
    [mode, settings.focus.short, customMinutes],
  );

  useEffect(() => {
    setTaskId(sessionStorage.getItem('focus:taskId'));
  }, []);

  const stopAndSave = useCallback(
    async (completed: boolean) => {
      setRunning(false);
      const startedAt = startedAtRef.current;
      const planned = plannedRef.current;
      if (startedAt) {
        const elapsed = Math.round((Date.now() - new Date(startedAt).getTime()) / 60000);
        await addFocusSession({
          taskId,
          taskName: tasks.find((t) => t.id === taskId)?.name ?? sessionStorage.getItem('focus:taskName') ?? null,
          date: now.date,
          startedAt,
          endedAt: new Date().toISOString(),
          plannedMinutes: planned,
          actualMinutes: elapsed,
          completed,
        });
      }
      startedAtRef.current = null;
      setSecondsLeft(duration * 60);
    },
    [addFocusSession, duration, now.date, taskId, tasks],
  );

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (secondsLeft !== 0 || !running) return;
    void (async () => {
      push('زمان تمرکز تمام شد!', 'success', 'می‌توانید استراحت کوتاهی بدهید یا دوباره شروع کنید.');
      if (taskId) await toggleCompletion(taskId, now.date, true);
      await stopAndSave(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, running]);

  const start = () => {
    plannedRef.current = duration;
    startedAtRef.current = new Date().toISOString();
    setSecondsLeft(duration * 60);
    setRunning(true);
  };

  const progress = 1 - secondsLeft / (duration * 60);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  const weekSessions = useMemo(() => {
    const from = addDays(now.date, -6);
    return focusSessions.filter((session) => session.date >= from && session.date <= now.date);
  }, [focusSessions, now.date]);

  const totalFocusMinutes = weekSessions.reduce((sum, session) => sum + (session.actualMinutes ?? 0), 0);
  const completedSessions = weekSessions.filter((session) => session.completed).length;
  const todayMinutes = focusSessions
    .filter((session) => session.date === now.date)
    .reduce((sum, session) => sum + (session.actualMinutes ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col items-center gap-5 p-6">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-control bg-accent text-accent-fg">
                <TimerIcon className="h-4 w-4" />
              </span>
              <div>
                <h1 className="text-base font-semibold">تمرکز</h1>
                <p className="text-xs text-muted">
                  {taskId
                    ? `مرتبط با: ${tasks.find((t) => t.id === taskId)?.name ?? 'تسک حذف‌شده'}`
                    : 'بدون تسک مشخص — عمومی'}
                </p>
              </div>
            </div>
            <Segmented
              ariaLabel="حالت تمرکز"
              value={mode}
              onChange={(value) => {
                setMode(value);
                setRunning(false);
                setSecondsLeft((value === 'short' ? settings.focus.short : value === 'long' ? 50 : customMinutes) * 60);
              }}
              options={[
                { value: 'short', label: `${toPersianDigits(settings.focus.short)}/${toPersianDigits(settings.focus.long)}` },
                { value: 'long', label: '۵۰/۱۰' },
                { value: 'custom', label: 'دلخواه' },
              ]}
            />
          </div>

          <div className="relative grid h-56 w-56 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--surface-2)" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - Math.min(1, Math.max(0, progress)))}`}
                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
              />
            </svg>
            <div className="text-center">
              <p className="numeral text-4xl font-semibold tabular-nums">
                {toPersianDigits(String(minutes).padStart(2, '0'))}:{toPersianDigits(String(seconds).padStart(2, '0'))}
              </p>
              <p className="mt-1 text-xs text-muted">
                {running ? 'در حال تمرکز' : secondsLeft === 0 ? 'تمام شد' : 'آماده'}
              </p>
            </div>
          </div>

          {mode === 'custom' ? (
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={customMinutes}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setCustomMinutes(value);
                  if (!running) setSecondsLeft(value * 60);
                }}
                className="w-56 accent-[var(--accent)]"
                aria-label="مدت تمرکز (دقیقه)"
              />
              <span className="numeral w-16 text-xs text-muted">{toPersianDigits(customMinutes)} دقیقه</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-2">
            {running ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setRunning(false);
                  push('زمان‌سنج متوقف شد.', 'info');
                }}
              >
                <Pause className="h-4 w-4" />
                توقف
              </Button>
            ) : (
              <Button onClick={start}>
                <Play className="h-4 w-4" />
                شروع
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                void stopAndSave(false);
                push('جلسه‌ی تمرکز ثبت و ریست شد.', 'info');
              }}
            >
              <RotateCcw className="h-4 w-4" />
              ریست
            </Button>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-2">
            <Badge tone="accent">امروز: {formatDuration(todayMinutes)}</Badge>
            <Badge tone="neutral">این هفته: {formatDuration(totalFocusMinutes)}</Badge>
            <Badge tone="success">جلسات کامل: {toPersianDigits(completedSessions)}</Badge>
            <Badge tone="muted">
              پیش‌فرض: {toPersianDigits(settings.focus.short)}/{toPersianDigits(settings.focus.long)}
            </Badge>
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">جلسات اخیر</h2>
        </div>
        {focusSessions.length ? (
          <ul className="divide-y divide-line">
            {focusSessions.slice(0, 12).map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium">{session.taskName ?? 'تمرکز عمومی'}</p>
                  <p className="numeral mt-0.5 text-[0.68rem] text-subtle">
                    {session.date} • {session.startedAt.slice(11, 16)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={session.completed ? 'success' : 'muted'}>
                    {session.completed ? 'کامل' : 'ناتمام'}
                  </Badge>
                  <Badge tone="neutral">{formatDuration(session.actualMinutes ?? 0)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<TimerIcon className="h-6 w-6" />}
            title="هنوز جلسه‌ی تمرکزی ثبت نشده"
            description="از صفحه‌ی امروز روی دکمه‌ی تمرکز هر تسک بزنید تا جلسه با همان تسک ثبت شود."
          />
        )}
      </Card>

      <p className="px-1 text-[0.7rem] leading-6 text-subtle">
        نکته: اگر صفحه را ببندید زمان‌سنج متوقف می‌شود؛ جلسات تمرکز به‌صورت محلی در IndexedDB ذخیره می‌شوند.
      </p>
    </div>
  );
}
