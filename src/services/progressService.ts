'use client';

/**
 * ProgressService — the only place that writes progress-domain data.
 * Pure calculations live in `lib/progress/*` and `lib/insights/*`.
 */

import {
  badgeRepository,
  completionRepository,
  dayStateRepository,
  focusRepository,
  rewardRepository,
  sleepRepository,
  taskRepository,
  xpRepository,
} from '@/services/repositories';
import { getDb } from '@/services/db';
import { buildDayOccurrences, type OccurrenceContext } from '@/lib/schedule/occurrence';
import { evaluateBadges, type BadgeStats } from '@/lib/progress/badges';
import { xpForBadge, xpForCompletion, xpForFocus, xpForQuest } from '@/lib/progress/score';
import { buildGarden } from '@/lib/progress/garden';
import { generateQuests, questSatisfied } from '@/lib/progress/quests';
import { addDays, compareISO, timeToMinutes, weekdayOfISO } from '@/lib/date/iso';
import { nowInZone } from '@/lib/date/timezone';
import type {
  BadgeAward,
  DailyQuest,
  DayOverride,
  DayState,
  SleepRecord,
  Task,
  TaskOccurrence,
} from '@/types';

export const BAD_DAY_COOLDOWN_DAYS = 4;

export interface ProgressSnapshot {
  xpBalance: number;
  xpToday: number;
  quests: DailyQuest[];
  badges: BadgeAward[];
  garden: ReturnType<typeof buildGarden>;
  dayState: DayState | null;
  sleep: SleepRecord | null;
}

export class ProgressService {
  /* ---------------------------------- XP ---------------------------------- */

  async awardForCompletion(task: Task, dateISO: string, timezone: string): Promise<number> {
    const now = nowInZone(timezone);
    const ctx: OccurrenceContext = { nowDate: now.date, nowMinutes: now.minutes, completions: new Map() };
    const occurrence = buildDayOccurrences([task], dateISO, ctx)[0];
    if (!occurrence) return 0;
    const { amount, reason } = xpForCompletion(occurrence);
    await xpRepository.add({
      at: new Date().toISOString(),
      date: dateISO,
      amount,
      kind: 'task',
      reason,
      taskId: task.id,
    });
    return amount;
  }

  async awardForFocus(minutes: number, dateISO: string, taskId?: string | null): Promise<number> {
    const amount = xpForFocus(minutes);
    if (amount <= 0) return 0;
    await xpRepository.add({
      at: new Date().toISOString(),
      date: dateISO,
      amount,
      kind: 'focus',
      reason: `${Math.round(minutes)} دقیقه تمرکز`,
      taskId: taskId ?? null,
    });
    return amount;
  }

  async awardForQuests(quests: DailyQuest[], dateISO: string): Promise<number> {
    let total = 0;
    for (const quest of quests) {
      if (!quest.done) continue;
      total += quest.xp;
    }
    if (total > 0) {
      await xpRepository.add({
        at: new Date().toISOString(),
        date: dateISO,
        amount: total,
        kind: 'quest',
        reason: 'ماموریت‌های روزانه',
      });
    }
    return total;
  }

  async spend(amount: number, reason: string): Promise<boolean> {
    const balance = await xpRepository.balance();
    if (balance < amount) return false;
    await xpRepository.add({
      at: new Date().toISOString(),
      date: nowInZone('Asia/Tehran').date,
      amount: -amount,
      kind: 'spend',
      reason,
    });
    return true;
  }

  /* --------------------------------- quests -------------------------------- */

  async ensureQuests(
    dateISO: string,
    tasks: Task[],
    occurrenceContext: OccurrenceContext,
    history: { avoidedTaskIds?: string[]; weekdayDelays?: Partial<Record<string, number>> },
  ): Promise<DailyQuest[]> {
    const state = await dayStateRepository.get(dateISO);
    if (state?.quests?.length) {
      // re-evaluate satisfaction against current occurrences
      const occurrences = buildDayOccurrences(tasks, dateISO, occurrenceContext);
      return state.quests.map((quest) => ({ ...quest, done: questSatisfied(quest, occurrences) }));
    }
    const occurrences = buildDayOccurrences(tasks, dateISO, occurrenceContext);
    const quests = generateQuests({
      occurrences,
      nowMinutes: occurrenceContext.nowMinutes,
      avoidedTaskIds: history.avoidedTaskIds,
      weekdayDelays: history.weekdayDelays,
    });
    const base: DayState =
      state ?? { date: dateISO, quests: [], updatedAt: new Date().toISOString(), badDay: false };
    await dayStateRepository.put({ ...base, quests, questsDate: dateISO });
    return quests;
  }

  /* ------------------------------- bad day mode ---------------------------- */

  async canActivateBadDay(dateISO: string): Promise<{ allowed: boolean; nextAvailableInDays: number; lastUsed?: string }> {
    const states = await dayStateRepository.list();
    const used = states
      .filter((state) => state.badDay && state.date !== dateISO)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const last = used[0];
    if (!last) return { allowed: true, nextAvailableInDays: 0 };
    const diffDays = Math.round(
      (Date.UTC(...splitISO(dateISO)) - Date.UTC(...splitISO(last.date))) / 86400000,
    );
    if (diffDays >= BAD_DAY_COOLDOWN_DAYS) return { allowed: true, nextAvailableInDays: 0 };
    return {
      allowed: false,
      nextAvailableInDays: BAD_DAY_COOLDOWN_DAYS - diffDays,
      lastUsed: last.date,
    };
  }

  async setBadDay(dateISO: string, active: boolean): Promise<DayState> {
    const state = (await dayStateRepository.get(dateISO)) ?? {
      date: dateISO,
      badDay: false,
      updatedAt: new Date().toISOString(),
    };
    const next: DayState = {
      ...state,
      badDay: active,
      badDayUsedAt: active ? new Date().toISOString() : state.badDayUsedAt ?? null,
    };
    await dayStateRepository.put(next);
    return next;
  }

  /* ---------------------------------- sleep -------------------------------- */

  async recordSleep(record: SleepRecord): Promise<SleepRecord> {
    const existing = await sleepRepository.get(record.date);
    const duration =
      record.bedMinutes != null && record.wakeMinutes != null
        ? normalizeDuration(record.bedMinutes, record.wakeMinutes)
        : existing?.durationMinutes ?? null;
    const merged: SleepRecord = {
      ...existing,
      ...record,
      durationMinutes: duration,
      updatedAt: new Date().toISOString(),
    };
    await sleepRepository.put(merged);
    return merged;
  }

  /* --------------------------------- badges -------------------------------- */

  async evaluateAndAward(
    tasks: Task[],
    completions: OccurrenceContext['completions'],
    buildOccurrences: (date: string) => TaskOccurrence[],
    today: string,
  ): Promise<BadgeAward[]> {
    const stats = await this.collectBadgeStats(tasks, buildOccurrences, today);
    const shouldUnlock = evaluateBadges(stats);
    const awarded: BadgeAward[] = [];
    for (const id of shouldUnlock) {
      const created = await badgeRepository.award({
        id,
        awardedAt: new Date().toISOString(),
        date: today,
      });
      if (created) {
        awarded.push({ id, awardedAt: new Date().toISOString(), date: today });
      }
    }
    // badges grant a one-off XP bonus (separate from the progress score)
    for (const badge of awarded) {
      const definition = (await import('@/lib/progress/badges')).BADGES_BY_ID[badge.id];
      if (!definition) continue;
      await xpRepository.add({
        at: new Date().toISOString(),
        date: today,
        amount: xpForBadge(definition.rarity),
        kind: 'badge',
        reason: `نشان «${definition.title}»`,
      });
    }
    return awarded;
  }

  private async collectBadgeStats(
    tasks: Task[],
    buildOccurrences: (date: string) => TaskOccurrence[],
    today: string,
  ): Promise<BadgeStats> {
    const [focus, overrides, sleepRecords, dayStates, gardenInput] = await Promise.all([
      focusRepository.list(500),
      (await import('@/services/repositories')).dayOverrideRepository.list(),
      sleepRepository.list(),
      dayStateRepository.list(),
      completionRepository.all(),
    ]);

    const dailyRates: { date: string; rate: number; planned: number }[] = [];
    const categoryCompletions: Record<string, number> = {};
    let totalCompletions = 0;
    let hardCompletions = 0;
    let earlyStartDays = 0;
    let balancedDays = 0;
    let punctualStarts = 0;

    for (let index = 59; index >= 0; index -= 1) {
      const date = addDays(today, -index);
      const occurrences = buildOccurrences(date);
      const planned = occurrences.filter((occurrence) => occurrence.status !== 'skipped');
      if (!planned.length) {
        dailyRates.push({ date, rate: 0, planned: 0 });
        continue;
      }
      const completed = planned.filter((occurrence) => occurrence.status === 'completed');
      const plannedMinutes = planned.reduce((total, occurrence) => total + occurrence.durationMinutes, 0);
      dailyRates.push({ date, rate: completed.length / planned.length, planned: plannedMinutes });

      const hasStudy = completed.some((occurrence) => ['study', 'homework', 'class'].includes(occurrence.task.category));
      const hasRest = completed.some((occurrence) => ['rest', 'fun', 'social'].includes(occurrence.task.category));
      if (hasStudy && hasRest) balancedDays += 1;

      for (const occurrence of completed) {
        totalCompletions += 1;
        if ((occurrence.task.difficulty ?? 'normal') === 'hard') hardCompletions += 1;
        categoryCompletions[occurrence.task.category] = (categoryCompletions[occurrence.task.category] ?? 0) + 1;
        if (occurrence.startMinutes <= 8 * 60) earlyStartDays += 1;
        if (!occurrence.shiftMinutes) punctualStarts += 1;
      }
    }
    // earlyStartDays counts occurrences; convert to "days" semantics for the badge
    earlyStartDays = Math.min(earlyStartDays, dailyRates.length);

    const focusMinutesTotal = focus.reduce((total, session) => total + (session.actualMinutes ?? 0), 0);
    const longestFocusSession = focus.reduce((total, session) => Math.max(total, session.actualMinutes ?? 0), 0);

    const sleepStreak = computeSleepStreak(sleepRecords, today);
    const recoveryCount = overrides.filter((override) => override.globalShiftMinutes > 0 && override.log.length > 0).length;
    const activeDays = dailyRates.filter((day) => day.planned > 0).length;

    return {
      totalCompletions,
      hardCompletions,
      focusMinutesTotal,
      longestFocusSession,
      dailyRates,
      activeDays,
      earlyStartDays,
      recoveryCount,
      backlogRecovered: 0,
      categoryCompletions,
      questCompletions: 0,
      balancedDays,
      sleepStreak,
      punctualStarts,
      shiftCount: overrides.length,
      badDaysUsed: dayStates.filter((state) => state.badDay).length,
      comebackAfter: 0,
      gardenPlants: buildGarden({ tasks, completions: gardenInput, badges: [], today, windowDays: 7 }).plants.length,
    };
  }

  /* -------------------------------- snapshot ------------------------------- */

  async snapshot(
    today: string,
    tasks: Task[],
    occurrenceContext: OccurrenceContext,
  ): Promise<ProgressSnapshot> {
    const [xpEntries, badges, dayState, sleep, completions] = await Promise.all([
      xpRepository.all(),
      badgeRepository.list(),
      dayStateRepository.get(today),
      sleepRepository.get(today),
      completionRepository.all(),
    ]);
    return {
      xpBalance: xpEntries.reduce((total, entry) => total + entry.amount, 0),
      xpToday: xpEntries.filter((entry) => entry.date === today).reduce((total, entry) => total + entry.amount, 0),
      quests: dayState?.quests ?? [],
      badges,
      garden: buildGarden({ tasks, completions, badges, today, windowDays: 7 }),
      dayState: dayState ?? null,
      sleep: sleep ?? null,
    };
  }

  async resetProgress(): Promise<void> {
    const db = getDb();
    await db.transaction('rw', [db.xpLedger, db.badges, db.dayStates], async () => {
      await db.xpLedger.clear();
      await db.badges.clear();
      await db.dayStates.clear();
    });
  }
}

function splitISO(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}

function normalizeDuration(bedMinutes: number, wakeMinutes: number): number {
  const bed = bedMinutes % 1440;
  let duration = wakeMinutes - bed;
  if (duration <= 0) duration += 1440;
  return duration;
}

function computeSleepStreak(records: SleepRecord[], today: string): number {
  const map = new Map(records.map((record) => [record.date, record]));
  let streak = 0;
  let cursor = today;
  for (let index = 0; index < 60; index += 1) {
    const record = map.get(cursor);
    if (!record) break;
    const duration = record.durationMinutes ?? 0;
    if (duration >= 420 && duration <= 540) streak += 1;
    else if (index > 0) break;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export const progressService = new ProgressService();

/** Helper used by the insight engine to build historical occurrences. */
export function makeOccurrenceBuilder(
  tasks: Task[],
  completions: Map<string, import('@/types').CompletionRecord>,
  overrides: Map<string, DayOverride>,
  nowDate: string,
) {
  const cache = new Map<string, TaskOccurrence[]>();
  return (date: string): TaskOccurrence[] => {
    const cached = cache.get(date);
    if (cached) return cached;
    const occurrences = buildDayOccurrences(tasks, date, {
      nowDate,
      nowMinutes: 0,
      completions,
      dayOverrides: overrides,
    });
    if (cache.size > 90) cache.clear();
    cache.set(date, occurrences);
    return occurrences;
  };
}

export { compareISO, timeToMinutes, weekdayOfISO };
