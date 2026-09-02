'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { useTaskEditor } from '@/features/tasks/TaskEditorProvider';
import { Timeline } from '@/components/Timeline';
import { OccurrenceRow } from '@/components/OccurrenceRow';
import { Badge, Button, Card, EmptyState, Segmented } from '@/components/ui/primitives';
import { buildDayOccurrences, buildRangeOccurrences, computeDayStats } from '@/lib/schedule/occurrence';
import { addDays, compareISO, startOfWeek, WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/lib/date/iso';
import { formatDuration, formatJalaliDate, formatMinutesOfDay, toPersianDigits, weekdayLabel } from '@/lib/date/format';
import { cn } from '@/lib/utils';
import type { TaskOccurrence } from '@/types';

type ViewMode = 'day' | 'week';

export function ScheduleScreen() {
  const { settings } = useSettings();
  const { tasks, occurrenceContext, now, toggleCompletion, skipOccurrence } = usePlanner();
  const { openEditor } = useTaskEditor();
  const [mode, setMode] = useState<ViewMode>('day');
  const [anchor, setAnchor] = useState<string | null>(null);

  const todayISO = now.date;
  const baseDate = anchor ?? todayISO;

  const dayOccurrences = useMemo(
    () => buildDayOccurrences(tasks, baseDate, occurrenceContext),
    [tasks, baseDate, occurrenceContext],
  );

  const weekDates = useMemo(() => {
    const start = startOfWeek(baseDate, settings.firstDayOfWeek);
    const order = rotateWeek(settings.firstDayOfWeek);
    return order.map((_, index) => addDays(start, index));
  }, [baseDate, settings.firstDayOfWeek]);

  const weekMap = useMemo(
    () => buildRangeOccurrences(tasks, weekDates[0], weekDates[weekDates.length - 1], occurrenceContext),
    [tasks, weekDates, occurrenceContext],
  );

  const stats = useMemo(() => computeDayStats(dayOccurrences), [dayOccurrences]);

  const groups = useMemo(() => {
    const morning = dayOccurrences.filter((o) => o.startMinutes < 12 * 60);
    const afternoon = dayOccurrences.filter((o) => o.startMinutes >= 12 * 60 && o.startMinutes < 18 * 60);
    const evening = dayOccurrences.filter((o) => o.startMinutes >= 18 * 60);
    return [
      { label: 'صبح', items: morning },
      { label: 'بعدازظهر', items: afternoon },
      { label: 'شب', items: evening },
    ].filter((group) => group.items.length);
  }, [dayOccurrences]);

  const shift = (amount: number) => {
    setAnchor(addDays(baseDate, mode === 'day' ? amount : amount * 7));
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" aria-label="قبلی" onClick={() => shift(-1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAnchor(todayISO)}>
              امروز
            </Button>
            <Button variant="secondary" size="icon" aria-label="بعدی" onClick={() => shift(1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              ariaLabel="نوع نمایش"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'day', label: 'روز' },
                { value: 'week', label: 'هفته' },
              ]}
            />
            <Button size="sm" onClick={() => openEditor(undefined, baseDate)}>
              <Plus className="h-4 w-4" />
              تسک
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h1 className="text-base font-semibold">
              {mode === 'day' ? weekdayLabel(baseDate) : 'هفته'}
            </h1>
            <p className="numeral mt-0.5 text-xs text-muted">
              {mode === 'day'
                ? formatJalaliDate(baseDate, { persianDigits: settings.persianDigits })
                : `${formatJalaliDate(weekDates[0], { persianDigits: settings.persianDigits, style: 'short' })} تا ${formatJalaliDate(
                    weekDates[weekDates.length - 1],
                    { persianDigits: settings.persianDigits, style: 'short' },
                  )}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{toPersianDigits(stats.total)} بلوک</Badge>
            <Badge tone="success">{toPersianDigits(stats.completed)} انجام‌شده</Badge>
            <Badge tone="muted">{formatDuration(stats.scheduledMinutes)}</Badge>
          </div>
        </div>

        {mode === 'day' ? (
          <div className="space-y-4 p-3">
            {groups.length ? (
              groups.map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="px-1 text-[0.7rem] font-semibold text-subtle">{group.label}</p>
                  {group.items.map((occurrence) => (
                    <OccurrenceRow
                      key={occurrence.id}
                      occurrence={occurrence}
                      settings={settings}
                      onToggle={(o) => toggleCompletion(o.taskId, o.date)}
                      onSkip={(o) => skipOccurrence(o.taskId, o.date)}
                      onEdit={(o) => openEditor(o.task, o.date)}
                    />
                  ))}
                </div>
              ))
            ) : (
              <EmptyState
                icon={<CalendarDays className="h-6 w-6" />}
                title="این روز خالی است"
                description="یک تسک اضافه کنید یا برنامه‌ی آماده را از فایل JSON وارد کنید."
                action={
                  <Button variant="secondary" onClick={() => openEditor(undefined, baseDate)}>
                    <Plus className="h-4 w-4" />
                    افزودن تسک
                  </Button>
                }
              />
            )}
            <div className="pt-2">
              <Timeline
                occurrences={dayOccurrences}
                nowMinutes={now.date === baseDate ? now.minutes : -1}
                settings={settings}
                onOpen={(occurrence) => openEditor(occurrence.task, occurrence.date)}
                onToggle={(occurrence) => toggleCompletion(occurrence.taskId, occurrence.date)}
                scrollToNow={now.date === baseDate}
              />
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto p-3">
            <div className="grid min-w-[720px] grid-cols-7 gap-2">
              {weekDates.map((date) => {
                const items = weekMap.get(date) ?? [];
                const dayStats = computeDayStats(items);
                const isToday = compareISO(date, todayISO) === 0;
                return (
                  <div
                    key={date}
                    className={cn(
                      'rounded-card border p-2',
                      isToday ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface',
                    )}
                  >
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-[0.7rem] font-semibold">{WEEKDAY_LABELS[weekdayOf(date)]}</span>
                      <span className="numeral text-[0.65rem] text-subtle">
                        {formatJalaliDate(date, { persianDigits: settings.persianDigits, style: 'short' })}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {items.slice(0, 6).map((occurrence) => (
                        <button
                          key={occurrence.id}
                          type="button"
                          onClick={() => openEditor(occurrence.task, occurrence.date)}
                          className={cn(
                            'w-full rounded-md px-1.5 py-1 text-start text-[0.68rem] leading-4 transition-opacity hover:opacity-80',
                            `task-color-${occurrence.task.color}`,
                            occurrence.status === 'completed' && 'opacity-50',
                            settings.timelineStyle === 'blocks'
                              ? 'bg-[color-mix(in_oklab,var(--task)_25%,transparent)]'
                              : 'bg-[color-mix(in_oklab,var(--task)_12%,transparent)]',
                          )}
                          style={{ borderInlineStart: '2px solid var(--task)' }}
                        >
                          <span className="numeral block text-[0.6rem] text-muted">
                            {formatMinutesOfDay(occurrence.startMinutes, settings)}
                          </span>
                          <span className={cn('block truncate', occurrence.status === 'completed' && 'line-through')}>
                            {occurrence.task.name}
                          </span>
                        </button>
                      ))}
                      {items.length > 6 ? (
                        <p className="numeral text-[0.6rem] text-subtle">+{toPersianDigits(items.length - 6)} مورد دیگر</p>
                      ) : null}
                      {!items.length ? <p className="py-3 text-center text-[0.65rem] text-subtle">—</p> : null}
                    </div>
                    {items.length ? (
                      <p className="numeral mt-2 text-[0.6rem] text-subtle">
                        {toPersianDigits(dayStats.completed)}/{toPersianDigits(dayStats.total)}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function rotateWeek(first: (typeof WEEKDAY_ORDER)[number]) {
  const index = WEEKDAY_ORDER.indexOf(first);
  return [...WEEKDAY_ORDER.slice(index), ...WEEKDAY_ORDER.slice(0, index)];
}

function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const map: Record<number, string> = { 6: 'sat', 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' };
  return map[js] as keyof typeof WEEKDAY_LABELS;
}
