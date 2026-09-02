/**
 * Local insight engine — deterministic statistics over the user's own history.
 * Every claim carries a sample size; nothing is asserted without enough data.
 */

import { addDays, compareISO, weekdayOfISO, WEEKDAY_LABELS } from '@/lib/date/iso';
import type {
  CompletionRecord,
  DayOverride,
  DayState,
  FocusSession,
  SleepRecord,
  Task,
  TaskOccurrence,
} from '@/types';

export interface Insight {
  id: string;
  title: string;
  detail: string;
  /** suggested action, if any */
  action?: { label: string; kind: 'lighten-day' | 'move-hard-task' | 'split-task' | 'recover' | 'sleep' };
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high';
  tone: 'positive' | 'neutral' | 'warning';
}

export interface InsightInput {
  tasks: Task[];
  completions: CompletionRecord[];
  focusSessions: FocusSession[];
  sleepRecords: SleepRecord[];
  dayOverrides: DayOverride[];
  dayStates: DayState[];
  today: string;
  /** occurrence builder for historical days (injected to keep this pure) */
  buildOccurrences: (date: string) => TaskOccurrence[];
}

export interface RecoveryPlan {
  taskId: string;
  taskName: string;
  missedCount: number;
  options: { label: string; detail: string }[];
}

const MIN_DAYS_FOR_PATTERN = 4;

export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];
  const days = recentDates(input.today, 60);

  // ---- collect per-day occurrence snapshots
  const byDate = new Map<string, TaskOccurrence[]>();
  for (const date of days) byDate.set(date, input.buildOccurrences(date));

  // ---- peak focus hours
  insights.push(peakFocusHours(input.focusSessions, input.today));

  // ---- weekday morning delay pattern
  insights.push(weekdayDelayPattern(byDate, input.dayOverrides, input.today));

  // ---- avoidance detection
  insights.push(...avoidanceInsights(byDate, input.today));

  // ---- sleep consistency
  insights.push(sleepInsight(input.sleepRecords, input.today));

  // ---- backlog recovery
  insights.push(...recoveryInsights(byDate, input.today));

  // ---- workload realism
  const workload = workloadInsight(byDate, input.today);
  if (workload) insights.push(workload);

  return insights.filter((insight): insight is Insight => insight !== null);
}

/* ------------------------------- peak hours -------------------------------- */

function peakFocusHours(sessions: FocusSession[], today: string): Insight {
  const recent = sessions.filter((session) => session.date >= addDays(today, -30) && session.completed);
  if (recent.length < 5) {
    return {
      id: 'peak-hours',
      title: 'ساعت‌های پرتوان',
      detail: 'برای تشخیص ساعت‌های پرتوان حداقل ۵ جلسه‌ی تمرکز کامل لازم است؛ فعلاً داده کافی نیست.',
      sampleSize: recent.length,
      confidence: 'low',
      tone: 'neutral',
    };
  }
  const buckets = new Map<number, { count: number; minutes: number }>();
  for (const session of recent) {
    const hour = Number(session.startedAt.slice(11, 13));
    const bucket = buckets.get(hour) ?? { count: 0, minutes: 0 };
    bucket.count += 1;
    bucket.minutes += session.actualMinutes ?? 0;
    buckets.set(hour, bucket);
  }
  const best = Array.from(buckets.entries()).sort((a, b) => b[1].minutes - a[1].minutes)[0];
  const next = Array.from(buckets.entries()).sort((a, b) => b[1].minutes - a[1].minutes)[1];
  const label = `${toPersian(best[0])} تا ${toPersian(best[0] + 1)}`;
  const detail = next
    ? `بیشترین انجام موفق تسک‌ها بین ${label} ثبت شده و بعد از آن ساعت ${toPersian(next[0])} تا ${toPersian(next[0] + 1)}.`
    : `بیشترین انجام موفق تسک‌ها بین ${label} ثبت شده.`;

  return {
    id: 'peak-hours',
    title: 'ساعت‌های پرتوان تو',
    detail,
    action: { label: 'کارهای سخت را در همین بازه بگذار', kind: 'move-hard-task' },
    sampleSize: recent.length,
    confidence: recent.length >= 15 ? 'high' : 'medium',
    tone: 'positive',
  };
}

/* --------------------------- weekday delay pattern ------------------------- */

function weekdayDelayPattern(
  byDate: Map<string, TaskOccurrence[]>,
  overrides: DayOverride[],
  today: string,
): Insight {
  const delayByWeekday = new Map<string, number[]>();
  for (const override of overrides) {
    if (override.globalShiftMinutes <= 0) continue;
    if (compareISO(override.date, today) > 0) continue;
    const weekday = weekdayOfISO(override.date);
    const list = delayByWeekday.get(weekday) ?? [];
    list.push(override.globalShiftMinutes);
    delayByWeekday.set(weekday, list);
  }

  let worst: { weekday: string; average: number; count: number } | null = null;
  for (const [weekday, values] of delayByWeekday) {
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    if (!worst || average > worst.average) worst = { weekday, average, count: values.length };
  }

  if (!worst || worst.count < MIN_DAYS_FOR_PATTERN) {
    return {
      id: 'weekday-delay',
      title: 'الگوی هفتگی',
      detail: 'هنوز داده‌ی کافی برای گفتن اینکه کدام روزها معمولاً دیر شروع می‌شوند وجود ندارد.',
      sampleSize: worst?.count ?? 0,
      confidence: 'low',
      tone: 'neutral',
    };
  }

  return {
    id: 'weekday-delay',
    title: `${WEEKDAY_LABELS[worst.weekday as keyof typeof WEEKDAY_LABELS]}ها`,
    detail: `در ${toPersian(worst.count)} مورد، برنامه‌ی این روزها به‌طور میانگین ${toPersian(Math.round(worst.average))} دقیقه عقب افتاده است.`,
    action: { label: 'برنامه‌ی این روز را سبک‌تر کنیم؟', kind: 'lighten-day' },
    sampleSize: worst.count,
    confidence: worst.count >= 8 ? 'high' : 'medium',
    tone: 'warning',
  };
}

/* ------------------------------ avoidance ---------------------------------- */

function avoidanceInsights(byDate: Map<string, TaskOccurrence[]>, today: string): Insight[] {
  const stats = new Map<string, { name: string; missed: number; total: number; skipped: number }>();
  const window = Array.from(byDate.entries()).filter(([date]) => date <= today && date >= addDays(today, -30));
  for (const [, occurrences] of window) {
    for (const occurrence of occurrences) {
      if (['rest', 'fun', 'social'].includes(occurrence.task.category)) continue;
      const entry = stats.get(occurrence.taskId) ?? {
        name: occurrence.task.name,
        missed: 0,
        total: 0,
        skipped: 0,
      };
      entry.total += 1;
      if (occurrence.status === 'missed') entry.missed += 1;
      if (occurrence.status === 'skipped') entry.skipped += 1;
      stats.set(occurrence.taskId, entry);
    }
  }

  return Array.from(stats.entries())
    .filter(([, value]) => value.total >= 4 && value.missed + value.skipped >= 3)
    .sort((a, b) => b[1].missed + b[1].skipped - (a[1].missed + a[1].skipped))
    .slice(0, 3)
    .map(([taskId, value]) => ({
      id: `avoidance-${taskId}`,
      title: `${value.name} چند بار عقب افتاده`,
      detail: `از ${toPersian(value.total)} جلسه، ${toPersian(value.missed)} جلسه انجام نشد و ${toPersian(value.skipped)} جلسه رد شد.`,
      action: { label: 'به دو بخش کوچک‌تر تقسیمش کنیم؟', kind: 'split-task' },
      sampleSize: value.total,
      confidence: value.total >= 8 ? 'high' : 'medium',
      tone: 'warning' as const,
    }));
}

/* --------------------------------- sleep ----------------------------------- */

function sleepInsight(records: SleepRecord[], today: string): Insight {
  const recent = records.filter((record) => record.date >= addDays(today, -30) && record.durationMinutes);
  if (recent.length < 4) {
    return {
      id: 'sleep',
      title: 'خواب و انرژی',
      detail: 'برای دیدن روند خواب چند روز دیگر ثبت نیاز است.',
      sampleSize: recent.length,
      confidence: 'low',
      tone: 'neutral',
    };
  }
  const durations = recent.map((record) => record.durationMinutes ?? 0);
  const average = durations.reduce((total, value) => total + value, 0) / durations.length;
  const variance =
    durations.reduce((total, value) => total + (value - average) ** 2, 0) / durations.length;
  const spread = Math.sqrt(variance);
  const detail =
    spread > 75
      ? `میانگین خواب ${toPersian(Math.round(average / 6) / 10)} ساعت است اما ساعت خواب تغییرات زیادی دارد (±${toPersian(Math.round(spread / 6) / 10)} ساعت).`
      : `میانگین خواب ${toPersian(Math.round(average / 6) / 10)} ساعت و نسبتاً منظم است.`;

  return {
    id: 'sleep',
    title: 'خواب و انرژی',
    detail,
    action: spread > 75 ? { label: 'ساعت خواب ثابت‌تری امتحان کن', kind: 'sleep' } : undefined,
    sampleSize: recent.length,
    confidence: recent.length >= 14 ? 'high' : 'medium',
    tone: spread > 75 ? 'warning' : 'positive',
  };
}

/* ------------------------------ recovery plan ------------------------------ */

export function buildRecoveryPlans(
  byDate: Map<string, TaskOccurrence[]>,
  today: string,
  freeMinutesPerDay = 45,
): RecoveryPlan[] {
  const missed = new Map<string, { name: string; count: number; minutes: number }>();
  for (const [date, occurrences] of byDate) {
    if (compareISO(date, today) > 0) continue;
    for (const occurrence of occurrences) {
      if (occurrence.status !== 'missed') continue;
      if (['rest', 'fun', 'social'].includes(occurrence.task.category)) continue;
      const entry = missed.get(occurrence.taskId) ?? {
        name: occurrence.task.name,
        count: 0,
        minutes: occurrence.durationMinutes,
      };
      entry.count += 1;
      missed.set(occurrence.taskId, entry);
    }
  }

  return Array.from(missed.entries())
    .filter(([, value]) => value.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4)
    .map(([taskId, value]) => {
      const totalMinutes = value.count * value.minutes;
      const perDay = Math.max(15, Math.round(value.minutes / 2));
      const daysNeeded = Math.max(1, Math.ceil(totalMinutes / freeMinutesPerDay));
      const sessionsPerWeek = Math.min(6, value.count + 2);
      return {
        taskId,
        taskName: value.name,
        missedCount: value.count,
        options: [
          {
            label: `اگر این هفته ${toPersian(sessionsPerWeek)} جلسه ${value.name} بگذاری، تا آخر هفته به برنامه برمی‌گردی.`,
            detail: `حدود ${toPersian(totalMinutes)} دقیقه کار عقب‌افتاده.`,
          },
          {
            label: `اگر روزی ${toPersian(perDay)} دقیقه اضافه کنی، حدود ${toPersian(daysNeeded)} روزه جبران می‌شود.`,
            detail: 'بدون تغییر بقیه‌ی برنامه.',
          },
          {
            label: 'یا یکی از کارهای کم‌اهمیت این هفته را موقتاً سبک‌تر کن.',
            detail: 'انتخاب با توست؛ برنامه به‌صورت خودکار تغییر نمی‌کند.',
          },
        ],
      };
    });
}

function recoveryInsights(byDate: Map<string, TaskOccurrence[]>, today: string): Insight[] {
  const plans = buildRecoveryPlans(byDate, today);
  return plans.slice(0, 2).map((plan) => ({
    id: `recovery-${plan.taskId}`,
    title: `جبران هوشمند: ${plan.taskName}`,
    detail: `${toPersian(plan.missedCount)} جلسه عقب افتاده. ${plan.options[0].label}`,
    action: { label: 'گزینه‌های جبران را ببین', kind: 'recover' },
    sampleSize: plan.missedCount,
    confidence: 'high',
    tone: 'neutral',
  }));
}

/* -------------------------------- workload --------------------------------- */

function workloadInsight(byDate: Map<string, TaskOccurrence[]>, today: string): Insight | null {
  const recent = Array.from(byDate.entries())
    .filter(([date]) => date <= today && date >= addDays(today, -14))
    .map(([, occurrences]) =>
      occurrences
        .filter((occurrence) => !['rest', 'fun', 'social'].includes(occurrence.task.category))
        .reduce((total, occurrence) => total + occurrence.durationMinutes, 0),
    )
    .filter((minutes) => minutes > 0);
  if (recent.length < 5) return null;
  const average = recent.reduce((total, value) => total + value, 0) / recent.length;
  if (average > 480) {
    return {
      id: 'workload',
      title: 'بار برنامه‌ی روزانه',
      detail: `میانگین برنامه‌ی غیراستراحت روزانه ${toPersian(Math.round(average / 6) / 10)} ساعت است؛ برنامه‌ی سنگین می‌تواند پایداری را کم کند.`,
      action: { label: 'کمی سبک‌ترش کنیم؟', kind: 'lighten-day' },
      sampleSize: recent.length,
      confidence: 'medium',
      tone: 'warning',
    };
  }
  return {
    id: 'workload',
    title: 'بار برنامه‌ی روزانه',
    detail: `میانگین برنامه‌ی غیراستراحت روزانه ${toPersian(Math.round(average / 6) / 10)} ساعت است و قابل اجرا به نظر می‌رسد.`,
    sampleSize: recent.length,
    confidence: 'medium',
    tone: 'positive',
  };
}

/* -------------------------------- helpers ---------------------------------- */

export function recentDates(today: string, count: number): string[] {
  const dates: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) dates.push(addDays(today, -index));
  return dates;
}

function toPersian(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}
