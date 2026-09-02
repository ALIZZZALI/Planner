'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { useTaskEditor } from '@/features/tasks/TaskEditorProvider';
import { OccurrenceRow } from '@/components/OccurrenceRow';
import { Badge, Button, Card, EmptyState, Segmented } from '@/components/ui/primitives';
import { Timeline } from '@/components/Timeline';
import { buildDayOccurrences, buildRangeOccurrences, computeDayStats } from '@/lib/schedule/occurrence';
import {
  addDays,
  addJalaliMonths,
  compareISO,
  isoToJalali,
  jalaliMonthLength,
  jalaliMonthStartISO,
  startOfWeek,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
} from '@/lib/date/iso';
import { formatJalaliDate, toPersianDigits } from '@/lib/date/format';
import { JALALI_MONTHS } from '@/lib/date/jalali';
import { cn } from '@/lib/utils';

type Mode = 'day' | 'week' | 'month';

export function CalendarScreen() {
  const { settings } = useSettings();
  const { tasks, occurrenceContext, now, toggleCompletion, skipOccurrence } = usePlanner();
  const { openEditor } = useTaskEditor();
  const [mode, setMode] = useState<Mode>('month');
  const [selected, setSelected] = useState<string | null>(null);

  const todayISO = now.date;
  const activeDate = selected ?? todayISO;

  const monthGrid = useMemo(() => {
    if (settings.calendar === 'persian') {
      const { jy, jm } = isoToJalali(activeDate);
      const start = jalaliMonthStartISO(jy, jm);
      const length = jalaliMonthLength(jy, jm);
      const dates: string[] = [];
      for (let day = 0; day < length; day += 1) dates.push(addDays(start, day));
      return { dates, title: `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}` };
    }
    const [y, m] = activeDate.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dates: string[] = [];
    for (let day = 0; day < length; day += 1) dates.push(addDays(start, day));
    return { dates, title: `${y} / ${toPersianDigits(m)}` };
  }, [activeDate, settings.calendar]);

  const shift = (direction: number) => {
    if (mode === 'day') setSelected(addDays(activeDate, direction));
    else if (mode === 'week') setSelected(addDays(activeDate, direction * 7));
    else {
      const next =
        settings.calendar === 'persian'
          ? addJalaliMonths(activeDate, direction)
          : addMonthsGregorian(activeDate, direction);
      setSelected(next);
    }
  };

  const range = useMemo(() => {
    if (mode === 'month') {
      const first = monthGrid.dates[0];
      const last = monthGrid.dates[monthGrid.dates.length - 1];
      const leading = rotateWeek(settings.firstDayOfWeek).indexOf(weekdayOf(first));
      const start = addDays(first, -leading);
      const total = Math.ceil((leading + monthGrid.dates.length) / 7) * 7;
      const dates: string[] = [];
      for (let i = 0; i < total; i += 1) dates.push(addDays(start, i));
      return { start: dates[0], end: dates[dates.length - 1], dates };
    }
    if (mode === 'week') {
      const start = startOfWeek(activeDate, settings.firstDayOfWeek);
      const dates = rotateWeek(settings.firstDayOfWeek).map((_, index) => addDays(start, index));
      return { start: dates[0], end: dates[6], dates };
    }
    return { start: activeDate, end: activeDate, dates: [activeDate] };
  }, [mode, monthGrid.dates, activeDate, settings.firstDayOfWeek]);

  const occurrencesByDate = useMemo(
    () => buildRangeOccurrences(tasks, range.start, range.end, occurrenceContext),
    [tasks, range.start, range.end, occurrenceContext],
  );

  const dayOccurrences = useMemo(
    () => (mode === 'month' ? buildDayOccurrences(tasks, activeDate, occurrenceContext) : occurrencesByDate.get(activeDate) ?? []),
    [mode, tasks, activeDate, occurrenceContext, occurrencesByDate],
  );
  const dayStats = useMemo(() => computeDayStats(dayOccurrences), [dayOccurrences]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" aria-label="قبلی" onClick={() => shift(-1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
              امروز
            </Button>
            <Button variant="secondary" size="icon" aria-label="بعدی" onClick={() => shift(1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              {mode === 'month' ? monthGrid.title : formatJalaliDate(activeDate, { persianDigits: settings.persianDigits, withWeekday: true })}
            </span>
            <Segmented
              ariaLabel="بازه‌ی تقویم"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'day', label: 'روز' },
                { value: 'week', label: 'هفته' },
                { value: 'month', label: 'ماه' },
              ]}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          {mode === 'month' ? (
            <MonthGrid
              dates={range.dates}
              inMonth={monthGrid.dates}
              occurrencesByDate={occurrencesByDate}
              selected={activeDate}
              todayISO={todayISO}
              onSelect={setSelected}
            />
          ) : mode === 'week' ? (
            <WeekGrid dates={range.dates} occurrencesByDate={occurrencesByDate} todayISO={todayISO} onSelect={setSelected} />
          ) : (
            <div className="p-3">
              <Timeline
                occurrences={dayOccurrences}
                nowMinutes={todayISO === activeDate ? now.minutes : -1}
                settings={settings}
                onOpen={(occurrence) => openEditor(occurrence.task, occurrence.date)}
                onToggle={(occurrence) => toggleCompletion(occurrence.taskId, occurrence.date)}
              />
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{formatJalaliDate(activeDate, { persianDigits: settings.persianDigits, withWeekday: true })}</h2>
              <p className="numeral mt-0.5 text-[0.7rem] text-muted">
                {toPersianDigits(dayStats.completed)} از {toPersianDigits(dayStats.total)} انجام شده
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => openEditor(undefined, activeDate)}>
              <Plus className="h-4 w-4" />
              تسک
            </Button>
          </div>
          <div className="space-y-2 p-3">
            {dayOccurrences.length ? (
              dayOccurrences.map((occurrence) => (
                <OccurrenceRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  settings={settings}
                  compact
                  onToggle={(o) => toggleCompletion(o.taskId, o.date)}
                  onSkip={(o) => skipOccurrence(o.taskId, o.date)}
                  onEdit={(o) => openEditor(o.task, o.date)}
                />
              ))
            ) : (
              <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="برنامه‌ای در این روز نیست" description="روی «تسک» بزنید تا برای این روز زمانی اضافه کنید." />
            )}
            {dayOccurrences.length ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge tone="neutral">کل: {toPersianDigits(dayStats.total)}</Badge>
                <Badge tone="success">انجام‌شده: {toPersianDigits(dayStats.completed)}</Badge>
                {dayStats.missed ? <Badge tone="danger">از‌دست‌رفته: {toPersianDigits(dayStats.missed)}</Badge> : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MonthGrid({
  dates,
  inMonth,
  occurrencesByDate,
  selected,
  todayISO,
  onSelect,
}: {
  dates: string[];
  inMonth: string[];
  occurrencesByDate: Map<string, import('@/types').TaskOccurrence[]>;
  selected: string;
  todayISO: string;
  onSelect: (date: string) => void;
}) {
  const order = rotateWeek('sat');
  return (
    <div className="p-2">
      <div className="mb-1 grid grid-cols-7 gap-1">
        {order.map((day) => (
          <div key={day} className="py-1 text-center text-[0.65rem] font-semibold text-subtle">
            {WEEKDAY_LABELS[day].slice(0, 3)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((date) => {
          const items = occurrencesByDate.get(date) ?? [];
          const stats = computeDayStats(items);
          const isToday = compareISO(date, todayISO) === 0;
          const isSelected = compareISO(date, selected) === 0;
          const inCurrentMonth = inMonth.includes(date);
          const jalali = isoToJalali(date);
          const density = items.length;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-label={`روز ${jalali.jd} ${JALALI_MONTHS[jalali.jm - 1]}`}
              aria-pressed={isSelected}
              className={cn(
                'flex min-h-[64px] flex-col items-center gap-1 rounded-lg border p-1 text-center transition-colors',
                isSelected ? 'border-accent bg-accent-soft/50' : 'border-transparent hover:bg-surface2',
                !inCurrentMonth && 'opacity-35',
              )}
            >
              <span
                className={cn(
                  'numeral mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[0.7rem]',
                  isToday && 'bg-accent font-semibold text-accent-fg',
                )}
              >
                {toPersianDigits(jalali.jd)}
              </span>
              {density ? (
                <span className="flex flex-wrap items-center justify-center gap-0.5">
                  {items.slice(0, 4).map((occurrence) => (
                    <span
                      key={occurrence.id}
                      className={cn('h-1.5 w-1.5 rounded-full', `task-color-${occurrence.task.color}`)}
                      style={{ backgroundColor: 'var(--task)' }}
                    />
                  ))}
                </span>
              ) : null}
              {density ? (
                <span className="numeral text-[0.58rem] leading-3 text-subtle">
                  {toPersianDigits(stats.completed)}/{toPersianDigits(density)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  dates,
  occurrencesByDate,
  todayISO,
  onSelect,
}: {
  dates: string[];
  occurrencesByDate: Map<string, import('@/types').TaskOccurrence[]>;
  todayISO: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-7 sm:divide-y-0">
      {dates.map((date) => {
        const items = occurrencesByDate.get(date) ?? [];
        const isToday = compareISO(date, todayISO) === 0;
        const jalali = isoToJalali(date);
        return (
          <div key={date} className={cn('p-2 sm:border-e sm:border-line sm:last:border-e-0', isToday && 'bg-accent-soft/30')}>
            <button
              type="button"
              onClick={() => onSelect(date)}
              className="mb-2 flex w-full items-baseline justify-between"
            >
              <span className="text-[0.7rem] font-semibold">{WEEKDAY_LABELS[weekdayOf(date)]}</span>
              <span className={cn('numeral text-[0.65rem]', isToday ? 'text-accent' : 'text-subtle')}>
                {toPersianDigits(jalali.jd)}
              </span>
            </button>
            <div className="space-y-1">
              {items.map((occurrence) => (
                <div
                  key={occurrence.id}
                  className={cn(
                    'rounded-md px-1.5 py-1 text-[0.68rem] leading-4',
                    `task-color-${occurrence.task.color}`,
                    occurrence.status === 'completed' && 'opacity-50',
                  )}
                  style={{
                    borderInlineStart: '2px solid var(--task)',
                    background: 'color-mix(in oklab, var(--task) 10%, transparent)',
                  }}
                >
                  {occurrence.task.name}
                </div>
              ))}
              {!items.length ? <p className="text-[0.65rem] text-subtle">—</p> : null}
            </div>
          </div>
        );
      })}
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
  const map: Record<number, keyof typeof WEEKDAY_LABELS> = {
    6: 'sat',
    0: 'sun',
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
  };
  return map[js];
}

function addMonthsGregorian(iso: string, amount: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + amount;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
