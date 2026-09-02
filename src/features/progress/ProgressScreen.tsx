'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  BarChart3,
  Brain,
  Clock,
  Flame,
  Flower2,
  Moon,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { useProgress } from '@/hooks/useProgress';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { useLiveData } from '@/services/useLiveData';
import { completionRepository, dayOverrideRepository, focusRepository, sleepRepository } from '@/services/repositories';
import { buildDayOccurrences } from '@/lib/schedule/occurrence';
import { addDays } from '@/lib/date/iso';
import { formatDuration, formatJalaliDate, toPersianDigits } from '@/lib/date/format';
import { BADGES, BADGES_BY_ID, RARITY_LABELS, RARITY_ORDER } from '@/lib/progress/badges';
import { levelFromXp } from '@/lib/progress/score';
import { Badge, Button, Card, EmptyState, Progress, Segmented, Skeleton, Switch } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { BadgeRarity } from '@/types';

type Tab = 'today' | 'week' | 'insights' | 'badges' | 'garden' | 'sleep';

export function ProgressScreen() {
  const { settings, update } = useSettings();
  const { now, tasks, occurrenceContext, todayOccurrences } = usePlanner();
  const progress = useProgress();
  const [tab, setTab] = useState<Tab>('today');

  const completionsQuery = useLiveData(() => completionRepository.all(), []);
  const focusQuery = useLiveData(() => focusRepository.list(400), []);
  const sleepQuery = useLiveData(() => sleepRepository.list(), []);
  const overridesQuery = useLiveData(() => dayOverrideRepository.list(), []);

  const completions = useMemo(() => completionsQuery.data ?? [], [completionsQuery.data]);
  const focusSessions = useMemo(() => focusQuery.data ?? [], [focusQuery.data]);
  const sleepRecords = sleepQuery.data ?? [];
  const overrides = useMemo(() => overridesQuery.data ?? [], [overridesQuery.data]);

  /* --------------------------- last 14 days trend --------------------------- */
  const week = useMemo(() => {
    const days: { date: string; planned: number; completed: number; minutes: number; rate: number }[] = [];
    for (let index = 13; index >= 0; index -= 1) {
      const date = addDays(now.date, -index);
      const occurrences = buildDayOccurrences(tasks, date, occurrenceContext);
      const considered = occurrences.filter((occurrence) => occurrence.status !== 'skipped');
      const completed = considered.filter((occurrence) => occurrence.status === 'completed');
      days.push({
        date,
        planned: considered.length,
        completed: completed.length,
        minutes: completed.reduce((total, occurrence) => total + occurrence.durationMinutes, 0),
        rate: considered.length ? completed.length / considered.length : 0,
      });
    }
    return days;
  }, [tasks, now.date, occurrenceContext]);

  const weekStats = useMemo(() => {
    const planned = week.reduce((total, day) => total + day.planned, 0);
    const completed = week.reduce((total, day) => total + day.completed, 0);
    const minutes = week.reduce((total, day) => total + day.minutes, 0);
    const focusMinutes = focusSessions
      .filter((session) => session.date >= addDays(now.date, -6))
      .reduce((total, session) => total + (session.actualMinutes ?? 0), 0);
    return { planned, completed, minutes, focusMinutes, rate: planned ? Math.round((completed / planned) * 100) : 0 };
  }, [week, focusSessions, now.date]);

  const level = levelFromXp(Math.max(0, progress.xp.balance));

  return (
    <div className="space-y-4">
      {/* ------------------------------ header card ---------------------------- */}
      <Card className="overflow-hidden">
        <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex items-center gap-4">
            <div className="relative grid h-24 w-24 place-items-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="var(--surface-2)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44}`}
                  strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress.score.score / 100)}`}
                  style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }}
                />
              </svg>
              <div className="text-center">
                <p className="numeral text-2xl font-semibold leading-none">{toPersianDigits(progress.score.score)}</p>
                <p className="mt-1 text-[0.6rem] text-muted">امتیاز روز</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">پیشرفت امروز</p>
              <p className="numeral text-xs text-muted">
                {toPersianDigits(progress.score.completedCount)} از {toPersianDigits(progress.score.plannedCount)} کار •{' '}
                {formatDuration(progress.score.completedMinutes)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">سطح {toPersianDigits(level.level)}</Badge>
                <Badge tone="neutral">XP: {toPersianDigits(progress.xp.balance)}</Badge>
                {progress.garden.plants.length ? (
                  <Badge tone="success">
                    <Flower2 className="h-3 w-3" />
                    {toPersianDigits(progress.garden.totalPlants)} گیاه
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">سطح بعدی</span>
              <span className="numeral text-muted">
                {toPersianDigits(progress.xp.levelCurrent)} / {toPersianDigits(progress.xp.levelNeeded)} XP
              </span>
            </div>
            <Progress value={(progress.xp.levelCurrent / Math.max(1, progress.xp.levelNeeded)) * 100} />
            <p className="text-[0.7rem] leading-6 text-subtle">
              امتیاز روز نشان می‌دهد امروز چطور پیش رفتی؛ XP یک موجودی جداگانه است و در فروشگاه پاداش خرج می‌شود.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <Segmented
            ariaLabel="بخش پیشرفت"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'today', label: 'امروز' },
              { value: 'week', label: 'دو هفته' },
              { value: 'insights', label: 'بینش‌ها' },
              { value: 'badges', label: 'نشان‌ها' },
              { value: 'garden', label: 'باغچه' },
              { value: 'sleep', label: 'خواب' },
            ]}
          />
          <Link href="/report">
            <Button variant="ghost" size="sm">
              بازخورد به مشاور
            </Button>
          </Link>
        </div>
      </Card>

      {tab === 'today' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">چرا این امتیاز؟</h2>
              <p className="mt-0.5 text-xs text-muted">هر مورد از داده‌های واقعی امروز محاسبه شده است.</p>
            </div>
            <ul className="divide-y divide-line">
              {progress.score.reasons.length ? (
                progress.score.reasons.map((reason, index) => (
                  <li key={`${reason.label}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <span className="text-muted">{reason.label}</span>
                    <span className={cn('numeral font-medium', reason.amount > 0 ? 'text-[var(--success)]' : reason.amount < 0 ? 'text-[var(--danger)]' : 'text-subtle')}>
                      {reason.amount > 0 ? `+${toPersianDigits(reason.amount)}` : reason.amount < 0 ? toPersianDigits(reason.amount) : '—'}
                    </span>
                  </li>
                ))
              ) : (
                <EmptyState title="امروز هنوز کاری ثبت نشده" description="با انجام اولین تسک، دلایل تغییر امتیاز همین‌جا نمایش داده می‌شود." />
              )}
            </ul>
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">ماموریت‌های امروز</h2>
              {progress.quests.length ? (
                <ul className="space-y-2">
                  {progress.quests.map((quest) => (
                    <li key={quest.id} className="flex items-start justify-between gap-3 rounded-card border border-line p-3">
                      <div className="min-w-0">
                        <p className={cn('text-xs font-medium', quest.done && 'line-through opacity-60')}>{quest.title}</p>
                        {quest.detail ? <p className="mt-0.5 text-[0.68rem] text-subtle">{quest.detail}</p> : null}
                      </div>
                      <Badge tone={quest.done ? 'success' : 'muted'}>{toPersianDigits(quest.xp)} XP</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">برای امروز ماموریت پیشنهادی نیست؛ برنامه‌ی خودت ملاک است.</p>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Brain className="h-4 w-4 text-accent" />
                مربی
              </h2>
              {progress.coach ? (
                <p className="text-xs leading-6 text-muted">{progress.coach.text}</p>
              ) : (
                <p className="text-xs text-muted">مربی شخصی در تنظیمات خاموش است.</p>
              )}
              <div className="mt-3">
                <Switch
                  checked={settings.progress.coachEnabled}
                  onChange={(value) => void update({ progress: { ...settings.progress, coachEnabled: value } })}
                  label="حالت مربی شخصی"
                  description="پیام‌های کوتاه بر اساس داده‌های خودت"
                />
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'week' ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">روند دو هفته‌ی اخیر</h2>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="accent">نرخ انجام: {toPersianDigits(weekStats.rate)}٪</Badge>
              <Badge tone="neutral">{formatDuration(weekStats.minutes)} کار انجام‌شده</Badge>
              <Badge tone="muted">تمرکز: {formatDuration(weekStats.focusMinutes)}</Badge>
            </div>
          </div>
          <div className="space-y-3 p-4">
            {week.map((day) => (
              <div key={day.date} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[0.68rem] text-muted">
                  {formatJalaliDate(day.date, { persianDigits: true, style: 'short', withWeekday: true })}
                </span>
                <Progress value={day.rate * 100} className="flex-1" />
                <span className="numeral w-16 shrink-0 text-end text-[0.68rem] text-subtle">
                  {day.planned ? `${toPersianDigits(day.completed)}/${toPersianDigits(day.planned)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === 'insights' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {progress.insights.map((insight) => (
            <Card key={insight.id} className="p-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{insight.title}</h3>
                <Badge tone={insight.tone === 'positive' ? 'success' : insight.tone === 'warning' ? 'warning' : 'neutral'}>
                  {insight.confidence === 'high' ? 'اطمینان بالا' : insight.confidence === 'medium' ? 'اطمینان متوسط' : 'داده‌ی کم'}
                </Badge>
              </div>
              <p className="text-xs leading-6 text-muted">{insight.detail}</p>
              <p className="mt-2 text-[0.65rem] text-subtle">تعداد نمونه: {toPersianDigits(insight.sampleSize)}</p>
              {insight.action ? (
                <p className="mt-2 rounded-card border border-dashed border-line px-3 py-2 text-[0.7rem] text-accent">
                  {insight.action.label}
                </p>
              ) : null}
            </Card>
          ))}
          {progress.recovery.length ? (
            <Card className="p-4 sm:col-span-2">
              <h3 className="mb-2 text-sm font-semibold">جبران هوشمند عقب‌افتادگی</h3>
              <ul className="space-y-3">
                {progress.recovery.map((plan) => (
                  <li key={plan.taskId} className="rounded-card border border-line p-3">
                    <p className="text-xs font-medium">
                      {plan.taskName} — {toPersianDigits(plan.missedCount)} جلسه عقب‌افتاده
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[0.7rem] text-muted">
                      {plan.options.map((option) => (
                        <li key={option.label}>• {option.label}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'badges' ? <BadgesPanel unlocked={new Set(progress.badges.map((badge) => badge.id))} /> : null}

      {tab === 'garden' ? <GardenPanel /> : null}

      {tab === 'sleep' ? (
        <SleepPanel records={sleepRecords} today={now.date} />
      ) : null}
    </div>
  );
}

function BadgesPanel({ unlocked }: { unlocked: Set<string> }) {
  const [filter, setFilter] = useState<'all' | BadgeRarity>('all');
  const list = filter === 'all' ? BADGES : BADGES.filter((badge) => badge.rarity === filter);

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-1.5 p-3">
          <Badge tone="accent">به‌دست‌آمده: {toPersianDigits(unlocked.size)}</Badge>
          {RARITY_ORDER.map((rarity) => (
            <button
              key={rarity}
              type="button"
              onClick={() => setFilter(filter === rarity ? 'all' : rarity)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[0.68rem] transition-colors',
                filter === rarity ? 'border-transparent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg',
              )}
            >
              {RARITY_LABELS[rarity]}
            </button>
          ))}
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((badge) => {
          const owned = unlocked.has(badge.id);
          return (
            <Card key={badge.id} className={cn('flex items-start gap-3 p-4', !owned && 'opacity-60')}>
              <span
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-control',
                  owned ? 'bg-accent-soft text-accent' : 'bg-surface2 text-subtle',
                )}
              >
                <Trophy className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{badge.title}</p>
                <p className="mt-0.5 text-[0.7rem] leading-5 text-muted">{badge.description}</p>
                <Badge tone={owned ? 'success' : 'muted'} className="mt-1.5">
                  {RARITY_LABELS[badge.rarity]}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function GardenPanel() {
  const { garden } = useProgress();
  const plants = garden.plants;
  const rows = useMemo(() => {
    const out: typeof plants[] = [];
    for (let index = 0; index < plants.length; index += 6) out.push(plants.slice(index, index + 6));
    return out;
  }, [plants]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Flower2 className="h-4 w-4 text-accent" />
            باغچه‌ی پیشرفت
          </h2>
          <p className="mt-0.5 text-xs text-muted">{garden.message}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="accent">سطح {toPersianDigits(garden.level)}</Badge>
          <Badge tone="success">{toPersianDigits(garden.totalPlants)} گیاه</Badge>
          {garden.milestoneFlowers ? <Badge tone="warning">{toPersianDigits(garden.milestoneFlowers)} شکوفه</Badge> : null}
          {garden.weeds ? <Badge tone="muted">{toPersianDigits(garden.weeds)} علف هرز</Badge> : null}
        </div>
      </div>
      <div className="space-y-6 p-5">
        {rows.length ? (
          rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex flex-wrap items-end justify-center gap-4">
              {row.map((plant) => (
                <div key={plant.id} className="flex w-14 flex-col items-center gap-1">
                  <PlantGlyph stage={plant.stage} color={plant.color} />
                  <span className="w-14 truncate text-center text-[0.6rem] text-subtle" title={plant.label}>
                    {plant.label}
                  </span>
                </div>
              ))}
            </div>
          ))
        ) : (
          <EmptyState
            icon={<Flower2 className="h-6 w-6" />}
            title="باغچه هنوز خالی است"
            description="هر تسک درسی یا مهارتی که کامل شود یک جوانه جدید می‌روید. استراحت و کارهای شخصی در باغچه حساب نمی‌شوند."
          />
        )}
        {garden.weeds ? (
          <p className="text-center text-[0.7rem] text-subtle">
            {toPersianDigits(garden.weeds)} علف هرز فقط یادآور جلسات عقب‌افتاده است؛ با جبران همان درس‌ها پاک می‌شود.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function PlantGlyph({ stage, color }: { stage: 1 | 2 | 3; color: string }) {
  return (
    <div className={cn('flex flex-col items-center', `task-color-${color}`)} style={{ color: 'var(--task)' }}>
      <svg viewBox="0 0 40 56" className="h-14 w-10" aria-hidden>
        <rect x="19" y={stage === 1 ? 34 : 20} width="2" height={stage === 1 ? 22 : 36} rx="1" fill="currentColor" opacity="0.7" />
        {stage >= 1 ? <ellipse cx="13" cy="40" rx="6" ry="3.5" fill="currentColor" opacity="0.85" transform="rotate(-20 13 40)" /> : null}
        {stage >= 1 ? <ellipse cx="27" cy="44" rx="6" ry="3.5" fill="currentColor" opacity="0.85" transform="rotate(20 27 44)" /> : null}
        {stage >= 2 ? <ellipse cx="11" cy="28" rx="7" ry="4" fill="currentColor" opacity="0.9" transform="rotate(-25 11 28)" /> : null}
        {stage >= 2 ? <ellipse cx="29" cy="30" rx="7" ry="4" fill="currentColor" opacity="0.9" transform="rotate(25 29 30)" /> : null}
        {stage >= 3 ? (
          <>
            <circle cx="20" cy="14" r="5.5" fill="currentColor" opacity="0.25" />
            <circle cx="20" cy="14" r="2.6" fill="currentColor" />
            <circle cx="14" cy="18" r="2" fill="currentColor" opacity="0.7" />
            <circle cx="26" cy="18" r="2" fill="currentColor" opacity="0.7" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function SleepPanel({ records, today }: { records: import('@/types').SleepRecord[]; today: string }) {
  const { recordSleep } = useProgress();
  const { settings } = useSettings();
  const recent = useMemo(
    () => records.filter((record) => record.date >= addDays(today, -13)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [records, today],
  );
  const todayRecord = recent.find((record) => record.date === today);

  const average = recent.length
    ? recent.reduce((total, record) => total + (record.durationMinutes ?? 0), 0) / recent.filter((r) => r.durationMinutes).length
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="rounded-card border border-line p-3">
            <p className="text-[0.7rem] text-subtle">میانگین خواب (۱۴ روز)</p>
            <p className="numeral mt-1 text-sm font-semibold">
              {average ? `${toPersianDigits(Math.round(average / 6) / 10)} ساعت` : '—'}
            </p>
          </div>
          <div className="rounded-card border border-line p-3">
            <p className="text-[0.7rem] text-subtle">امروز ساعت بیداری</p>
            <p className="numeral mt-1 text-sm font-semibold">
              {todayRecord?.wakeMinutes != null
                ? `${String(Math.floor(todayRecord.wakeMinutes / 60)).padStart(2, '0')}:${String(todayRecord.wakeMinutes % 60).padStart(2, '0')}`
                : 'ثبت نشده'}
            </p>
          </div>
          <div className="rounded-card border border-line p-3">
            <p className="text-[0.7rem] text-subtle">انرژی (۱ تا ۵)</p>
            <p className="numeral mt-1 text-sm font-semibold">{todayRecord?.energy ? toPersianDigits(todayRecord.energy) : '—'}</p>
          </div>
        </div>
        <div className="border-t border-line p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted">ساعت خواب دیشب</span>
              <input
                type="time"
                className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm"
                value={minutesToTimeInput(todayRecord?.bedMinutes)}
                onChange={(event) => {
                  const [h, m] = event.target.value.split(':').map(Number);
                  if (Number.isFinite(h)) void recordSleep({ date: today, bedMinutes: h * 60 + m });
                }}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted">ساعت بیداری</span>
              <input
                type="time"
                className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm"
                value={minutesToTimeInput(todayRecord?.wakeMinutes)}
                onChange={(event) => {
                  const [h, m] = event.target.value.split(':').map(Number);
                  if (Number.isFinite(h)) void recordSleep({ date: today, wakeMinutes: h * 60 + m });
                }}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted">انرژی امروز</span>
              <input
                type="range"
                min={1}
                max={5}
                defaultValue={todayRecord?.energy ?? 3}
                className="mt-4 w-full accent-[var(--accent)]"
                aria-label="سطح انرژی"
                onMouseUp={(event) => void recordSleep({ date: today, energy: Number((event.target as HTMLInputElement).value) })}
                onTouchEnd={(event) => void recordSleep({ date: today, energy: Number((event.target as HTMLInputElement).value) })}
              />
            </label>
          </div>
          <p className="mt-3 text-[0.7rem] leading-6 text-subtle">
            ثبت خواب اختیاری است و فقط برای برنامه‌ریزی شخصی خودت استفاده می‌شود؛ توصیه‌های این بخش توصیه‌ی درمانی نیست.
          </p>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">۱۴ روز اخیر</h2>
        </div>
        <ul className="divide-y divide-line">
          {recent.map((record) => (
            <li key={record.date} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
              <span className="text-muted">{formatJalaliDate(record.date, { persianDigits: true, withWeekday: true })}</span>
              <span className="numeral text-subtle">
                {record.durationMinutes ? `${toPersianDigits(Math.round(record.durationMinutes / 6) / 10)} ساعت` : '—'}
              </span>
            </li>
          ))}
          {!recent.length ? <li className="px-4 py-6"><EmptyState icon={<Moon className="h-6 w-6" />} title="داده‌ای ثبت نشده" /></li> : null}
        </ul>
      </Card>
      {settings.sleepTracking ? null : <p className="text-xs text-subtle">ردگیری خواب در تنظیمات خاموش است.</p>}
    </div>
  );
}

function minutesToTimeInput(minutes?: number | null): string {
  if (minutes == null) return '';
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export const ProgressIcons = { BadgeCheck, BarChart3, Clock, Flame, Sparkles, Sun, Target, TrendingUp, Zap };
