'use client';

import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock, Flame, TrendingUp } from 'lucide-react';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { Badge, Card, EmptyState, Progress, Segmented, Skeleton } from '@/components/ui/primitives';
import { buildRangeOccurrences, computeDayStats } from '@/lib/schedule/occurrence';
import { addDays, compareISO, startOfWeek, weekdayOfISO, WEEKDAY_LABELS } from '@/lib/date/iso';
import { formatDuration, formatJalaliDate, toPersianDigits } from '@/lib/date/format';
import { cn } from '@/lib/utils';

type Range = 'today' | 'week' | 'month';

export function StatsScreen() {
  const { settings } = useSettings();
  const { tasks, occurrenceContext, now, completions, focusSessions, habits, habitLogs } = usePlanner();
  const [range, setRange] = useState<Range>('week');

  const from = useMemo(() => {
    if (range === 'today') return now.date;
    if (range === 'week') return startOfWeek(now.date, settings.firstDayOfWeek);
    return addDays(now.date, -29);
  }, [range, now.date, settings.firstDayOfWeek]);

  const byDate = useMemo(
    () => buildRangeOccurrences(tasks, from, now.date, occurrenceContext),
    [tasks, from, now.date, occurrenceContext],
  );

  const days = useMemo(() => Array.from(byDate.entries()).filter(([date]) => compareISO(date, now.date) <= 0), [byDate, now.date]);

  const totals = useMemo(() => {
    let total = 0;
    let completed = 0;
    let missed = 0;
    let scheduledMinutes = 0;
    let completedMinutes = 0;
    for (const [, items] of days) {
      const stats = computeDayStats(items);
      total += stats.total;
      completed += stats.completed;
      missed += stats.missed;
      scheduledMinutes += stats.scheduledMinutes;
      completedMinutes += stats.completedMinutes;
    }
    return {
      total,
      completed,
      missed,
      scheduledMinutes,
      completedMinutes,
      rate: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [days]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, { minutes: number; count: number }>();
    for (const [, items] of days) {
      for (const occurrence of items) {
        if (occurrence.status !== 'completed') continue;
        const key = occurrence.task.category;
        const current = map.get(key) ?? { minutes: 0, count: 0 };
        current.minutes += occurrence.durationMinutes;
        current.count += 1;
        map.set(key, current);
      }
    }
    return Array.from(map.entries())
      .map(([id, value]) => ({
        id,
        name: settings.categories.find((c) => c.id === id)?.name ?? id,
        color: settings.categories.find((c) => c.id === id)?.color ?? 'slate',
        ...value,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [days, settings.categories]);

  const maxCategoryMinutes = Math.max(1, ...categoryTotals.map((c) => c.minutes));

  const streak = useMemo(() => {
    const dates = new Set(completions.filter((c) => c.status === 'completed').map((c) => c.date));
    let count = 0;
    let cursor = now.date;
    for (let i = 0; i < 365; i += 1) {
      if (dates.has(cursor)) count += 1;
      else if (i > 0) break;
      cursor = addDays(cursor, -1);
    }
    return count;
  }, [completions, now.date]);

  const focusMinutes = focusSessions
    .filter((session) => session.date >= from && session.date <= now.date)
    .reduce((sum, session) => sum + (session.actualMinutes ?? 0), 0);

  const habitRate = useMemo(() => {
    if (!habits.length) return 0;
    const totalSlots = habits.length * Math.max(1, days.length);
    const done = habitLogs.filter((log) => log.done && log.date >= from && log.date <= now.date).length;
    return Math.round((done / totalSlots) * 100);
  }, [habits, habitLogs, from, now.date, days.length]);

  if (!tasks.length) {
    return (
      <Card>
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="داده‌ای برای نمایش نیست"
          description="بعد از اینکه چند تسک بسازید و انجامشان را علامت بزنید، آمار روزانه، هفتگی و ماهانه اینجا دیده می‌شود."
        />
      </Card>
    );
  }

  const dailyMax = Math.max(1, ...days.map(([, items]) => computeDayStats(items).total));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div>
            <h1 className="text-base font-semibold">آمار</h1>
            <p className="mt-0.5 text-xs text-muted">
              {from === now.date
                ? formatJalaliDate(now.date, { persianDigits: settings.persianDigits, withWeekday: true })
                : `${formatJalaliDate(from, { persianDigits: settings.persianDigits, style: 'short' })} تا ${formatJalaliDate(now.date, { persianDigits: settings.persianDigits, style: 'short' })}`}
            </p>
          </div>
          <Segmented
            ariaLabel="بازه آمار"
            value={range}
            onChange={setRange}
            options={[
              { value: 'today', label: 'امروز' },
              { value: 'week', label: 'این هفته' },
              { value: 'month', label: '۳۰ روز' },
            ]}
          />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="نرخ انجام" value={`${toPersianDigits(totals.rate)}٪`} hint={`${toPersianDigits(totals.completed)} از ${toPersianDigits(totals.total)}`} />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="انجام‌شده" value={toPersianDigits(totals.completed)} hint={`${toPersianDigits(totals.missed)} از دست رفته`} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="زمان برنامه‌ریزی‌شده" value={formatDuration(totals.scheduledMinutes)} hint={`انجام‌شده: ${formatDuration(totals.completedMinutes)}`} />
        <StatCard icon={<Flame className="h-4 w-4" />} label="زنجیره روزها" value={`${toPersianDigits(streak)} روز`} hint={`تمرکز: ${formatDuration(focusMinutes)}`} />
      </div>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">انجام‌شدن روزانه</h2>
          <p className="mt-0.5 text-xs text-muted">تعداد تسک‌های انجام‌شده در مقابل کل تسک‌های هر روز</p>
        </div>
        <div className="overflow-x-auto p-4">
          <div className="flex min-w-[520px] items-end gap-1.5">
            {days.map(([date, items]) => {
              const stats = computeDayStats(items);
              const height = Math.round((stats.total / dailyMax) * 100);
              const doneHeight = stats.total ? Math.round((stats.completed / stats.total) * height) : 0;
              return (
                <div key={date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex h-32 w-full items-end justify-center">
                    <div
                      className={cn('w-full rounded-t-md bg-surface2', stats.total ? '' : 'opacity-40')}
                      style={{ height: `${Math.max(4, height)}%` }}
                      title={`${date}: ${stats.completed}/${stats.total}`}
                    >
                      <div
                        className="w-full rounded-t-md bg-accent"
                        style={{ height: `${stats.total ? (stats.completed / stats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <span className="numeral text-[0.55rem] text-subtle">
                    {formatJalaliDate(date, { persianDigits: settings.persianDigits, style: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4 text-[0.68rem] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent" />
              انجام‌شده
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-surface2" />
              برنامه‌ریزی‌شده
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">توزیع زمان بر اساس دسته‌بندی</h2>
            <p className="mt-0.5 text-xs text-muted">فقط جلسات انجام‌شده</p>
          </div>
          <div className="space-y-3 p-4">
            {categoryTotals.length ? (
              categoryTotals.map((category) => (
                <div key={category.id} className={cn('space-y-1.5', `task-color-${category.color}`)}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{category.name}</span>
                    <span className="numeral text-muted">
                      {formatDuration(category.minutes)} • {toPersianDigits(category.count)} جلسه
                    </span>
                  </div>
                  <Progress value={(category.minutes / maxCategoryMinutes) * 100} tone="task" />
                </div>
              ))
            ) : (
              <EmptyState title="داده‌ای نیست" description="هنوز تسکی را انجام‌شده علامت نزده‌اید." />
            )}
          </div>
        </Card>

        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">خلاصه‌ی عادت‌ها و بهترین روزها</h2>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium">نرخ عادت‌ها در این بازه</span>
                <span className="numeral text-muted">{toPersianDigits(habitRate)}٪</span>
              </div>
              <Progress value={habitRate} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium">روزهای هفته</p>
              {Object.keys(WEEKDAY_LABELS).map((day) => {
                const items = days.filter(([date]) => weekdayOfISO(date) === day).flatMap(([, list]) => list);
                const stats = computeDayStats(items);
                const rate = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
                return (
                  <div key={day} className="flex items-center gap-3">
                    <span className="w-16 text-[0.7rem] text-muted">{WEEKDAY_LABELS[day as keyof typeof WEEKDAY_LABELS]}</span>
                    <Progress value={rate} className="flex-1" />
                    <span className="numeral w-10 text-end text-[0.68rem] text-subtle">{toPersianDigits(rate)}٪</span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="neutral">کل جلسات: {toPersianDigits(totals.total)}</Badge>
              <Badge tone="success">انجام‌شده: {toPersianDigits(totals.completed)}</Badge>
              <Badge tone="danger">از دست رفته: {toPersianDigits(totals.missed)}</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted">
        <span className="text-accent">{icon}</span>
        <span className="text-[0.7rem] font-medium">{label}</span>
      </div>
      <p className="numeral mt-2 text-xl font-semibold">{value}</p>
      <p className="numeral mt-1 text-[0.68rem] text-subtle">{hint}</p>
    </Card>
  );
}
