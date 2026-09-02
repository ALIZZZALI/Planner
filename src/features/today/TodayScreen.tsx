'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlarmClock,
  ArrowLeftRight,
  Download,
  Plus,
  Sparkles,
  Timer,
  TrendingUp,
  Undo2,
  Zap,
} from 'lucide-react';
import { minutesLabel } from '@/lib/schedule/dayShift';
import { useProgress } from '@/hooks/useProgress';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { useTaskEditor } from '@/features/tasks/TaskEditorProvider';
import { Timeline } from '@/components/Timeline';
import { ShiftPanel } from '@/features/today/ShiftPanel';
import { TodayAssist } from '@/features/today/TodaySidebar';
import { OccurrenceRow } from '@/components/OccurrenceRow';
import { Badge, Button, Card, EmptyState, Progress, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { buildDayOccurrences, computeDayStats, findCurrentAndNext } from '@/lib/schedule/occurrence';
import { addDays, weekdayOfISO } from '@/lib/date/iso';
import { formatDuration, formatJalaliDate, formatGregorianDate, formatMinutesOfDay, toPersianDigits } from '@/lib/date/format';
import { TaskIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { weekdayLabel } from '@/lib/date/format';
import type { Habit, TaskOccurrence } from '@/types';

export function TodayScreen() {
  const { settings } = useSettings();
  const {
    tasks,
    habits,
    habitLogs,
    todayOccurrences,
    occurrenceContext,
    now,
    toggleCompletion,
    skipOccurrence,
    loadSampleData,
    loading,
    clockReady,
    dayOverride,
    todayShiftMinutes,
    undoShift,
    resetDay,
  } = usePlanner();
  const { openEditor, openQuickAdd } = useTaskEditor();
  const { push } = useToast();
  const router = useRouter();
  const progress = useProgress();
  const [dateOffset, setDateOffset] = useState(0);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftWakeup, setShiftWakeup] = useState(false);

  const viewDate = useMemo(() => addDays(now.date, dateOffset), [now.date, dateOffset]);

  const occurrences = useMemo(
    () => (dateOffset === 0 ? todayOccurrences : buildDayOccurrences(tasks, viewDate, occurrenceContext)),
    [dateOffset, todayOccurrences, tasks, viewDate, occurrenceContext],
  );

  const stats = useMemo(() => computeDayStats(occurrences), [occurrences]);
  const { current, next } = useMemo(() => findCurrentAndNext(occurrences, now.minutes), [occurrences, now.minutes]);
  const upcoming = occurrences.filter((o) => o.status === 'scheduled' || o.status === 'active').slice(0, 6);
  const completed = occurrences.filter((o) => o.status === 'completed');
  const missed = occurrences.filter((o) => o.status === 'missed');

  const todayHabits = useMemo(() => {
    const weekday = weekdayOfISO(viewDate);
    return habits.filter((habit) =>
      habit.cadence === 'daily'
        ? true
        : habit.cadence === 'custom'
          ? habit.days.includes(weekday)
          : habit.cadence === 'weekdays'
            ? weekday !== 'fri'
            : weekday === 'fri',
    );
  }, [habits, viewDate]);

  const handleFocus = (occurrence: TaskOccurrence) => {
    sessionStorage.setItem('focus:taskId', occurrence.taskId);
    sessionStorage.setItem('focus:taskName', occurrence.task.name);
    router.push('/focus');
  };

  if (loading && !tasks.length) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <Card>
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="برنامه‌ای ندارید — شروع کنیم؟"
          description="می‌توانید داده‌ی نمونه‌ی یک دانش‌آموز را بارگذاری کنید، تسک اول را بسازید یا برنامه‌ی آماده را از فایل JSON وارد کنید. همه‌ی داده‌ها فقط روی همین دستگاه ذخیره می‌شوند."
          action={
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => void loadSampleData().then((count) => push(`${count} تسک نمونه اضافه شد.`, 'success'))}>
                <Sparkles className="h-4 w-4" />
                بارگذاری داده‌ی نمونه
              </Button>
              <Button variant="secondary" onClick={() => openEditor(undefined, now.date)}>
                <Plus className="h-4 w-4" />
                تسک جدید
              </Button>
              <Link href="/import-export">
                <Button variant="ghost">
                  <Download className="h-4 w-4" />
                  ورود از JSON
                </Button>
              </Link>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------------------------- hero / now & next --------------------------- */}
      {settings.showSections.nowNext ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.65rem] font-semibold text-accent">
                    {dateOffset === 0 ? 'امروز' : dateOffset === 1 ? 'فردا' : dateOffset === -1 ? 'دیروز' : 'روز دیگر'}
                  </span>
                  <span className="text-xs text-muted">{weekdayLabel(viewDate)}</span>
                </div>
                {clockReady ? (
                  <>
                    <h1 className="mt-1.5 text-lg font-semibold leading-7 sm:text-xl">
                      {settings.calendar === 'persian'
                        ? formatJalaliDate(viewDate, { persianDigits: settings.persianDigits })
                        : formatGregorianDate(viewDate, settings.persianDigits)}
                    </h1>
                    <p className="numeral mt-0.5 text-xs text-subtle">
                      ساعت {formatMinutesOfDay(now.minutes, settings)} • {settings.timezone}
                    </p>
                  </>
                ) : (
                  <span className="mt-1.5 block h-6 w-40 animate-pulse rounded bg-surface2" aria-hidden />
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="icon" aria-label="روز قبل" onClick={() => setDateOffset((v) => v - 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDateOffset(0)}>
                  امروز
                </Button>
                <Button variant="secondary" size="icon" aria-label="روز بعد" onClick={() => setDateOffset((v) => v + 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NowNextCard
                label="الان"
                occurrence={current}
                settings={settings}
                nowMinutes={now.minutes}
                onToggle={() => current && toggleCompletion(current.taskId, current.date)}
                onFocus={() => current && handleFocus(current)}
              />
              <NowNextCard
                label="بعدی"
                occurrence={next}
                settings={settings}
                nowMinutes={now.minutes}
                onToggle={() => next && toggleCompletion(next.taskId, next.date)}
                onFocus={() => next && handleFocus(next)}
              />
            </div>

            {todayShiftMinutes || dayOverride?.actualWakeUpMinutes != null ? (
              <button
                type="button"
                onClick={() => {
                  setShiftWakeup(false);
                  setShiftOpen(true);
                }}
                className="flex flex-wrap items-center gap-2 rounded-card border border-accent/40 bg-accent-soft/60 px-3 py-2 text-start text-xs transition-colors hover:bg-accent-soft"
              >
                <ArrowLeftRight className="h-3.5 w-3.5 text-accent" />
                <span className="font-medium text-accent">
                  {todayShiftMinutes ? `برنامه امروز ${minutesLabel(todayShiftMinutes)} جابه‌جا شده` : 'برنامه امروز تغییر کرده'}
                </span>
                {dayOverride?.actualWakeUpMinutes != null ? (
                  <span className="numeral text-muted">
                    بیداری واقعی: {formatMinutesOfDay(dayOverride.actualWakeUpMinutes, settings)}
                  </span>
                ) : null}
                <span className="text-subtle">مدیریت جابه‌جایی</span>
              </button>
            ) : null}

            {settings.showSections.progress ? (
              <div className="rounded-card border border-line bg-surface2/50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    <TrendingUp className="h-3.5 w-3.5 text-accent" />
                    پیشرفت روز
                  </span>
                  <span className="numeral text-muted">
                    {toPersianDigits(stats.completed)} از {toPersianDigits(stats.total)} تسک •{' '}
                    {toPersianDigits(stats.progress)}٪
                  </span>
                </div>
                <Progress value={stats.progress} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="success">انجام‌شده: {toPersianDigits(stats.completed)}</Badge>
                  <Badge tone="muted">باقی‌مانده: {toPersianDigits(stats.remaining)}</Badge>
                  {missed.length ? <Badge tone="danger">از‌دست‌رفته: {toPersianDigits(missed.length)}</Badge> : null}
                  <Badge tone="neutral">زمان برنامه‌ریزی‌شده: {formatDuration(stats.scheduledMinutes)}</Badge>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* -------------------------------- quick add ------------------------------- */}
      {settings.showSections.quickAdd ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => openEditor(undefined, viewDate)}>
            <Plus className="h-4 w-4" />
            تسک جدید
          </Button>
          <Button variant="secondary" onClick={openQuickAdd}>
            افزودن سریع
          </Button>
          <Button variant="soft" onClick={() => { setShiftWakeup(false); setShiftOpen(true); }}>
            <ArrowLeftRight className="h-4 w-4" />
            جابه‌جایی برنامه
          </Button>
          <Button variant="secondary" onClick={() => { setShiftWakeup(true); setShiftOpen(true); }}>
            <AlarmClock className="h-4 w-4" />
            من بیدار شدم
          </Button>
          {todayShiftMinutes ? (
            <Button
              variant="ghost"
              onClick={() => void undoShift(viewDate).then((done) => push(done ? 'واگرد انجام شد.' : 'چیزی برای واگرد نیست.', done ? 'success' : 'info'))}
            >
              <Undo2 className="h-4 w-4" />
              واگرد
            </Button>
          ) : null}
          {dayOverride ? (
            <Button variant="ghost" onClick={() => void resetDay(viewDate).then(() => push('برنامه امروز به حالت اولیه برگشت.', 'success'))}>
              بازگردانی امروز
            </Button>
          ) : null}
          <Link href="/focus">
            <Button variant="secondary">
              <Timer className="h-4 w-4" />
              تمرکز عمیق
            </Button>
          </Link>
        </div>
      ) : null}

      <ShiftPanel open={shiftOpen} onClose={() => setShiftOpen(false)} dateISO={viewDate} initialWakeup={shiftWakeup} />

      {/* --------------------------------- habits -------------------------------- */}
      {settings.showSections.habits && todayHabits.length ? (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">عادت‌های امروز</h2>
            <Link href="/habits" className="text-xs text-accent hover:underline">
              مدیریت
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto p-3 hide-scrollbar">
            {todayHabits.map((habit) => (
              <HabitChip key={habit.id} habit={habit} date={viewDate} />
            ))}
          </div>
        </Card>
      ) : null}

      {/* ------------------------- coach, quests, sleep, bad day ------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TodayAssist />
      </div>

      {/* -------------------------------- timeline -------------------------------- */}
      {settings.showSections.timeline ? (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">تایم‌لاین روز</h2>
            <span className="text-[0.7rem] text-subtle">برای ویرایش روی بلوک‌ها بزنید</span>
          </div>
          <div className="p-3">
            <Timeline
              occurrences={occurrences}
              nowMinutes={now.minutes}
              settings={settings}
              onOpen={(occurrence) => openEditor(occurrence.task, occurrence.date)}
              onToggle={(occurrence) => toggleCompletion(occurrence.taskId, occurrence.date)}
            />
          </div>
        </Card>
      ) : null}

      {/* --------------------------- upcoming & completed -------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        {settings.showSections.upcoming ? (
          <Card>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">پیش رو</h2>
              <span className="text-[0.7rem] text-subtle">{toPersianDigits(upcoming.length)} مورد</span>
            </div>
            <div className="space-y-2 p-3">
              {upcoming.length ? (
                upcoming.map((occurrence) => (
                  <OccurrenceRow
                    key={occurrence.id}
                    occurrence={occurrence}
                    settings={settings}
                    onToggle={(o) => toggleCompletion(o.taskId, o.date)}
                    onSkip={(o) => skipOccurrence(o.taskId, o.date)}
                    onEdit={(o) => openEditor(o.task, o.date)}
                    onFocus={handleFocus}
                  />
                ))
              ) : (
                <EmptyState title="چیزی در پیش نیست" description="برای امروز برنامه‌ی باقی‌مانده ندارید." />
              )}
            </div>
          </Card>
        ) : null}

        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">انجام‌شده‌ها</h2>
            <span className="numeral text-[0.7rem] text-subtle">
              {toPersianDigits(completed.length)} / {toPersianDigits(stats.total)}
            </span>
          </div>
          <div className="space-y-2 p-3">
            {completed.length ? (
              completed.map((occurrence) => (
                <OccurrenceRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  settings={settings}
                  onToggle={(o) => toggleCompletion(o.taskId, o.date)}
                  onEdit={(o) => openEditor(o.task, o.date)}
                />
              ))
            ) : (
              <EmptyState
                icon={<CheckCircle2 className="h-6 w-6" />}
                title="هنوز چیزی انجام نشده"
                description="اولین تسک را که تمام کردید همین‌جا علامت بزنید."
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function NowNextCard({
  label,
  occurrence,
  settings,
  nowMinutes,
  onToggle,
  onFocus,
}: {
  label: string;
  occurrence: TaskOccurrence | null;
  settings: ReturnType<typeof useSettings>['settings'];
  nowMinutes: number;
  onToggle: () => void;
  onFocus: () => void;
}) {
  if (!occurrence) {
    return (
      <div className="rounded-card border border-dashed border-line p-4">
        <p className="text-[0.7rem] font-semibold text-subtle">{label}</p>
        <p className="mt-2 text-sm text-muted">موردی وجود ندارد</p>
        <p className="mt-1 text-[0.7rem] text-subtle">
          {label === 'الان' ? 'در این لحظه برنامه‌ای ندارید — وقت آزاد است.' : 'بعدی در تقویم ثبت نشده است.'}
        </p>
      </div>
    );
  }

  const elapsed = Math.max(0, Math.min(occurrence.durationMinutes, nowMinutes - occurrence.startMinutes));
  const progress = Math.round((elapsed / occurrence.durationMinutes) * 100);
  const remaining = Math.max(0, occurrence.endMinutes - nowMinutes);

  return (
    <div className={cn('relative overflow-hidden rounded-card border p-4', `task-color-${occurrence.task.color}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-accent">
            {label}
            {label === 'الان' ? <span className="pulse-ring h-1.5 w-1.5 rounded-full bg-accent" /> : null}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <TaskIcon name={occurrence.task.icon} className="h-4 w-4 text-muted" />
            <h3 className="truncate text-base font-semibold leading-7">{occurrence.task.name}</h3>
          </div>
          <p className="numeral mt-0.5 text-xs text-muted">
            {formatMinutesOfDay(occurrence.startMinutes, settings)} —{' '}
            {formatMinutesOfDay(occurrence.endMinutes, settings)}
            {label === 'الان' && remaining > 0 ? ` • ${remaining} دقیقه مانده` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="secondary" onClick={onToggle} aria-label="علامت انجام شد">
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={onFocus} aria-label="شروع تمرکز">
            <Timer className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {label === 'الان' ? (
        <div className="mt-3">
          <Progress value={progress} tone="task" />
          <p className="numeral mt-1 text-[0.65rem] text-subtle">
            {toPersianDigits(progress)}٪ از این بازه گذشته
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {occurrence.task.reminder.enabled ? (
            <Badge tone="accent">
              یادآور {occurrence.task.reminder.minutesBefore === 0 ? 'سر ساعت' : `${occurrence.task.reminder.minutesBefore} دقیقه قبل`}
            </Badge>
          ) : null}
          <Badge tone="neutral">{formatDuration(occurrence.durationMinutes)}</Badge>
        </div>
      )}
    </div>
  );
}

function HabitChip({ habit, date }: { habit: Habit; date: string }) {
  const { toggleHabit, habitLogs } = usePlanner();
  const done = habitLogs.some((log) => log.habitId === habit.id && log.date === date && log.done);
  return (
    <button
      type="button"
      onClick={() => void toggleHabit(habit.id, date)}
      aria-pressed={done}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
        done
          ? 'border-transparent bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-[var(--success)]'
          : 'border-line bg-surface text-muted hover:text-fg',
      )}
    >
      <TaskIcon name={habit.icon} className="h-3.5 w-3.5" />
      {habit.name}
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
    </button>
  );
}
