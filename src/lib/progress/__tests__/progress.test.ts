import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTask } from '@/lib/schedule/__tests__/helpers';
import { buildDayOccurrences, type OccurrenceContext } from '@/lib/schedule/occurrence';
import { computeDayProgress, levelFromXp, xpForBadge, xpForCompletion, xpForFocus, xpForQuest } from '../score';
import { BADGES_BY_ID, evaluateBadges, type BadgeStats } from '../badges';
import { buildGarden } from '../garden';
import { generateQuests, questSatisfied } from '../quests';
import { buildCoachMessage, coachMomentFrom } from '@/lib/coach/coach';
import { buildCounselorReport, rangeFromPreset } from '@/lib/report/counselor';
import { buildInsights, buildRecoveryPlans } from '@/lib/insights/engine';
import { DEFAULT_CATEGORIES } from '@/lib/constants';
import { progressService, BAD_DAY_COOLDOWN_DAYS } from '@/services/progressService';
import {
  badgeRepository,
  dayStateRepository,
  sleepRepository,
  taskRepository,
  xpRepository,
  rewardRepository,
  completionRepository,
} from '@/services/repositories';
import type { CompletionRecord, FocusSession, Task, TaskOccurrence } from '@/types';

const DATE = '2026-09-05';

function ctx(nowMinutes = 7 * 60, completions: CompletionRecord[] = []): OccurrenceContext {
  return { nowDate: DATE, nowMinutes, completions: new Map(completions.map((record) => [record.id, record])) };
}

function occurrencesOf(tasks: Task[], completions: CompletionRecord[] = [], nowMinutes = 7 * 60): TaskOccurrence[] {
  return buildDayOccurrences(tasks, DATE, ctx(nowMinutes, completions));
}

const math = makeTask({ id: 'math', name: 'ریاضی', start: '08:30', end: '09:30', date: DATE, repeat: { type: 'daily' }, category: 'study' });
const physics = makeTask({ id: 'physics', name: 'فیزیک', start: '09:45', end: '10:45', date: DATE, repeat: { type: 'daily' }, category: 'study' });
const gaming = makeTask({ id: 'gaming', name: 'بازی', start: '21:00', end: '22:00', date: DATE, repeat: { type: 'daily' }, category: 'fun' });
const privateTask = makeTask({ id: 'family', name: 'مهمانی خانوادگی', start: '18:00', end: '20:00', date: DATE, repeat: { type: 'daily' }, category: 'personal' });

function completed(taskId: string, date = DATE): CompletionRecord {
  return { id: `${taskId}:${date}`, taskId, date, status: 'completed', completedAt: `${date}T10:00:00.000Z` };
}

/* ------------------------------- progress score ---------------------------- */

describe('progress score', () => {
  it('is not a simple completion percentage', () => {
    const withWork = computeDayProgress({ occurrences: occurrencesOf([math, physics], [completed('math'), completed('physics')]) });
    const idle = computeDayProgress({ occurrences: occurrencesOf([math]) });
    expect(withWork.score).toBeGreaterThan(idle.score);
    expect(withWork.score).toBeLessThanOrEqual(100);
  });

  it('rewards hard tasks more than easy ones', () => {
    const hard = makeTask({ id: 'h', name: 'سخت', start: '08:30', end: '09:30', date: DATE, difficulty: 'hard', category: 'study' });
    const easy = makeTask({ id: 'e', name: 'آسان', start: '08:30', end: '09:30', date: DATE, difficulty: 'easy', category: 'study' });
    const hardScore = computeDayProgress({ occurrences: occurrencesOf([hard], [completed('h')]) });
    const easyScore = computeDayProgress({ occurrences: occurrencesOf([easy], [completed('e')]) });
    expect(hardScore.score).toBeGreaterThan(easyScore.score);
  });

  it('explains itself with reasons', () => {
    const result = computeDayProgress({ occurrences: occurrencesOf([math], [completed('math')]) });
    expect(result.reasons.some((reason) => reason.label.includes('ریاضی'))).toBe(true);
  });

  it('rewards recovery after a delayed start', () => {
    const base = { occurrences: occurrencesOf([math, physics], [completed('math'), completed('physics')]) };
    const withoutRecovery = computeDayProgress(base);
    const withRecovery = computeDayProgress({ ...base, recoveredFromDelay: true });
    expect(withRecovery.score).toBeGreaterThan(withoutRecovery.score);
    expect(withRecovery.reasons.some((reason) => reason.label.includes('تأخیر'))).toBe(true);
  });

  it('does not treat rest as failure', () => {
    const result = computeDayProgress({ occurrences: occurrencesOf([gaming], [completed('gaming')]) });
    expect(result.score).toBeGreaterThanOrEqual(25);
    // rest completions do not appear as scoring reasons
    expect(result.reasons.some((reason) => reason.label.includes('بازی'))).toBe(false);
  });

  it('keeps missed-task penalties bounded', () => {
    const manyMissed = Array.from({ length: 20 }, (_, index) =>
      makeTask({ id: `m${index}`, name: `کار ${index}`, start: '08:00', end: '09:00', date: DATE, category: 'study' }),
    );
    const result = computeDayProgress({ occurrences: occurrencesOf(manyMissed, [], 10 * 60) });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.reasons.filter((reason) => reason.amount < 0)[0]?.amount).toBeGreaterThanOrEqual(-15);
  });

  it('bad day mode caps pressure instead of punishing', () => {
    const normal = computeDayProgress({ occurrences: occurrencesOf([math, physics]) });
    const badDay = computeDayProgress({ occurrences: occurrencesOf([math, physics]), badDay: true });
    expect(badDay.score).toBeLessThanOrEqual(70);
    expect(badDay.score).toBeGreaterThan(0);
    expect(normal.score).toBeGreaterThan(0);
  });

  it('counts focus sessions separately from scheduled duration', () => {
    const result = computeDayProgress({
      occurrences: occurrencesOf([math]),
      focusSessions: [{ date: DATE, startedAt: `${DATE}T08:30:00.000Z`, plannedMinutes: 60, actualMinutes: 42, completed: true }],
    });
    expect(result.focusMinutes).toBe(42);
    expect(result.plannedMinutes).toBe(60);
  });
});

/* ----------------------------------- XP ------------------------------------ */

describe('xp and levels', () => {
  it('gives XP for completing a task (separate currency from score)', () => {
    const occurrence = occurrencesOf([math], [completed('math')])[0];
    const { amount, reason } = xpForCompletion(occurrence);
    expect(amount).toBeGreaterThan(0);
    expect(reason).toContain('ریاضی');
  });

  it('gives more XP for hard academic work', () => {
    const hard = makeTask({ id: 'h', name: 'سخت', start: '08:30', end: '09:30', date: DATE, difficulty: 'hard', category: 'study' });
    const easy = makeTask({ id: 'e', name: 'آسان', start: '08:30', end: '09:30', date: DATE, difficulty: 'easy', category: 'study' });
    expect(xpForCompletion(occurrencesOf([hard])[0]).amount).toBeGreaterThan(
      xpForCompletion(occurrencesOf([easy])[0]).amount,
    );
  });

  it('xp values stay small enough not to break the reward store', () => {
    expect(xpForFocus(50)).toBeLessThanOrEqual(30);
    expect(xpForQuest('hard')).toBe(40);
    expect(xpForBadge('legendary')).toBe(300);
    expect(xpForBadge('common')).toBe(20);
  });

  it('computes levels progressively', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(500).level).toBe(2);
    expect(levelFromXp(2000).level).toBeGreaterThan(2);
    const level = levelFromXp(650);
    expect(level.level).toBe(2);
    expect(level.current).toBe(150);
  });
});

/* ---------------------------------- badges --------------------------------- */

describe('badges', () => {
  const base: BadgeStats = {
    totalCompletions: 0,
    hardCompletions: 0,
    focusMinutesTotal: 0,
    longestFocusSession: 0,
    dailyRates: [],
    activeDays: 0,
    earlyStartDays: 0,
    recoveryCount: 0,
    backlogRecovered: 0,
    categoryCompletions: {},
    questCompletions: 0,
    balancedDays: 0,
    sleepStreak: 0,
    punctualStarts: 0,
    shiftCount: 0,
    badDaysUsed: 0,
    comebackAfter: 0,
    gardenPlants: 0,
  };

  it('unlocks the first badge after one completion', () => {
    expect(evaluateBadges({ ...base, totalCompletions: 1 })).toContain('first-step');
  });

  it('requires a real streak for the legendary executor badge', () => {
    const rates = Array.from({ length: 40 }, () => ({ date: 'x', rate: 1, planned: 240 }));
    expect(evaluateBadges({ ...base, dailyRates: rates })).toContain('legend-executor');
    // 29 perfect days, one miss, then perfect again -> longest run is 29
    const almost = [...rates.slice(0, 29), { date: 'x', rate: 0.2, planned: 240 }, { date: 'y', rate: 1, planned: 240 }];
    expect(evaluateBadges({ ...base, dailyRates: almost })).not.toContain('legend-executor');
  });

  it('does not unlock hard badges from thin data', () => {
    expect(evaluateBadges(base)).not.toContain('marathon');
    expect(evaluateBadges(base)).not.toContain('long-haul');
  });

  it('has a varied catalogue with meaningful rarities', () => {
    const rarities = new Set(Object.values(BADGES_BY_ID).map((badge) => badge.rarity));
    expect(rarities.size).toBe(5);
    expect(Object.keys(BADGES_BY_ID).length).toBeGreaterThanOrEqual(20);
    expect(Object.values(BADGES_BY_ID).filter((badge) => badge.rarity === 'legendary').length).toBeLessThanOrEqual(3);
  });
});

/* ---------------------------------- garden --------------------------------- */

describe('garden', () => {
  it('grows a plant per completed work task and ignores rest/personal', () => {
    const garden = buildGarden({
      tasks: [math, physics, gaming, privateTask],
      completions: [completed('math'), completed('physics'), completed('gaming'), completed('family')],
      badges: [],
      today: DATE,
    });
    expect(garden.plants).toHaveLength(2);
    expect(garden.plants.map((plant) => plant.label)).toContain('ریاضی');
  });

  it('stages plants by repetition and adds flowers on milestones', () => {
    const completions = [completed('math', '2026-09-05'), completed('math', '2026-09-04'), completed('math', '2026-09-03')];
    const garden = buildGarden({ tasks: [math], completions, badges: [], today: DATE });
    expect(garden.plants[0].stage).toBe(3);
    expect(garden.plants[0].kind).toBe('flower');
  });

  it('shows weeds from skipped work as a reminder only', () => {
    const skipped: CompletionRecord = { id: `physics:${DATE}`, taskId: 'physics', date: DATE, status: 'skipped', completedAt: '' };
    const garden = buildGarden({ tasks: [math, physics], completions: [completed('math'), skipped], badges: [], today: DATE });
    expect(garden.weeds).toBe(1);
    expect(garden.message).not.toContain('تنبلی');
  });

  it('is deterministic', () => {
    const input = { tasks: [math], completions: [completed('math')], badges: [] as never[], today: DATE };
    expect(buildGarden(input).plants).toEqual(buildGarden(input).plants);
  });
});

/* ---------------------------------- quests --------------------------------- */

describe('daily quests', () => {
  it('derives quests only from real tasks', () => {
    const quests = generateQuests({ occurrences: occurrencesOf([math, physics]), nowMinutes: 7 * 60 });
    expect(quests.length).toBeGreaterThan(0);
    expect(quests.length).toBeLessThanOrEqual(3);
    expect(quests.every((quest) => quest.xp <= 40)).toBe(true);
    for (const quest of quests) {
      expect([math.id, physics.id]).toContain(quest.taskId);
    }
  });

  it('prioritises an avoided task', () => {
    const quests = generateQuests({
      occurrences: occurrencesOf([math, physics]),
      nowMinutes: 7 * 60,
      avoidedTaskIds: [physics.id],
    });
    expect(quests[0].taskId).toBe('physics');
    expect(quests[0].title).toContain('نیمه‌کاره');
  });

  it('satisfies a quest when its task is completed', () => {
    const quests = generateQuests({ occurrences: occurrencesOf([math]), nowMinutes: 7 * 60 });
    expect(questSatisfied(quests[0], occurrencesOf([math], [completed('math')]))).toBe(true);
    expect(questSatisfied(quests[0], occurrencesOf([math]))).toBe(false);
  });

  it('generates nothing when there is no real work', () => {
    expect(generateQuests({ occurrences: occurrencesOf([gaming]), nowMinutes: 7 * 60 })).toHaveLength(0);
  });
});

/* ---------------------------------- coach ---------------------------------- */

describe('coach', () => {
  it('names the first real task in the morning', () => {
    const message = buildCoachMessage({ moment: 'morning', occurrences: occurrencesOf([math, physics]), nowMinutes: 7 * 60, focusMinutesToday: 0, recentRates: [] });
    expect(message.text).toContain('ریاضی');
  });

  it('summarises the day in the evening with Persian numerals', () => {
    const message = buildCoachMessage({ moment: 'evening', occurrences: occurrencesOf([math, physics], [completed('math')]), nowMinutes: 21 * 60, focusMinutesToday: 0, recentRates: [] });
    expect(message.text).toContain('۱ کار از ۲');
  });

  it('suggests recovery rather than shaming after missed work', () => {
    const past = makeTask({ id: 'chem', name: 'شیمی', start: '08:00', end: '09:00', date: '2026-09-04', repeat: { type: 'daily' }, category: 'study' });
    const occurrences = buildDayOccurrences([past], DATE, ctx(21 * 60, []));
    const message = buildCoachMessage({ moment: 'evening', occurrences, nowMinutes: 21 * 60, focusMinutesToday: 0, recentRates: [] });
    expect(message.tone).not.toBe('challenge');
    expect(message.text.length).toBeGreaterThan(0);
  });

  it('never repeats the same message twice in a row', () => {
    const input = {
      moment: 'morning' as const,
      occurrences: occurrencesOf([math, physics]),
      nowMinutes: 7 * 60,
      focusMinutesToday: 0,
      recentRates: [0.9, 0.9, 0.9], // produces a second candidate so rotation is possible
    };
    const first = buildCoachMessage(input);
    const second = buildCoachMessage({ ...input, lastMessageId: first.id });
    expect(second.id).not.toBe(first.id);
  });

  it('maps the time of day to a coach moment', () => {
    expect(coachMomentFrom(8 * 60)).toBe('morning');
    expect(coachMomentFrom(14 * 60)).toBe('midday');
    expect(coachMomentFrom(22 * 60)).toBe('evening');
  });
});

/* -------------------------------- counselor -------------------------------- */

describe('counselor report', () => {
  const categories = DEFAULT_CATEGORIES;

  function reportFor(tasks: Task[], completions: CompletionRecord[]) {
    // end of day: unfinished past blocks count as missed, exactly like the screen
    const byDate = new Map<string, TaskOccurrence[]>();
    byDate.set(DATE, buildDayOccurrences(tasks, DATE, ctx(23 * 60 + 59, completions)));
    return buildCounselorReport({
      range: rangeFromPreset(1, DATE),
      tasks,
      categories,
      excludedCategories: ['personal'],
      completions,
      focusSessions: [],
      dayOverrides: [],
      occurrencesByDate: byDate,
    });
  }

  it('never includes personal tasks', () => {
    const report = reportFor([math, privateTask], [completed('math'), completed('family')]);
    expect(report.text).toContain('ریاضی');
    expect(report.text).not.toContain('مهمانی');
    expect(report.text).not.toContain('شخصی');
  });

  it('states facts instead of grading performance', () => {
    const report = reportFor([math, physics], [completed('math')]);
    expect(report.text).toContain('فیزیک');
    expect(report.text).not.toMatch(/عالی|ضعیف|خوب بود|بد بود|امتیاز/);
  });

  it('reports unfinished work naturally (per subject)', () => {
    const report = reportFor([math, physics], [completed('math')]);
    expect(report.text).toContain('ریاضی طبق برنامه');
    expect(report.text).toContain('فیزیک در این بازه انجام نشد و ۱ جلسه باقی مانده');
  });

  it('reports partial completion with counts, like a student would say it', () => {
    const daily = makeTask({ id: 'phys-daily', name: 'فیزیک', start: '09:45', end: '10:45', date: '2026-09-01', repeat: { type: 'daily' }, category: 'study' });
    const byDate = new Map<string, TaskOccurrence[]>();
    const days = ['2026-09-03', '2026-09-04', '2026-09-05'];
    const done: CompletionRecord[] = [
      { id: 'phys-daily:2026-09-03', taskId: 'phys-daily', date: '2026-09-03', status: 'completed', completedAt: '' },
      { id: 'phys-daily:2026-09-04', taskId: 'phys-daily', date: '2026-09-04', status: 'completed', completedAt: '' },
    ];
    for (const day of days) {
      byDate.set(
        day,
        buildDayOccurrences([daily], day, {
          nowDate: DATE,
          nowMinutes: 23 * 60 + 59,
          completions: new Map(done.map((record) => [record.id, record])),
        }),
      );
    }
    const report = buildCounselorReport({
      range: rangeFromPreset(3, DATE),
      tasks: [daily],
      categories,
      excludedCategories: ['personal'],
      completions: done,
      focusSessions: [],
      dayOverrides: [],
      occurrencesByDate: byDate,
    });
    expect(report.text).toContain('فیزیک ۲ جلسه از ۳ جلسه انجام شد و ۱ جلسه باقی مانده');
  });

  it('says plainly when there is not enough data', () => {
    const report = reportFor([], []);
    expect(report.hasEnoughData).toBe(false);
    expect(report.text).toContain('اطلاعات کافی');
  });

  it('supports every requested preset range', () => {
    for (const days of [180, 90, 60, 30, 28, 21, 14, 7, 6, 5, 4, 3, 2, 1]) {
      const range = rangeFromPreset(days, DATE);
      expect(range.from).toBeTruthy();
      expect(range.label).toBeTruthy();
    }
  });

  it('never emits raw HTML into report lines', () => {
    const report = reportFor([math], [completed('math')]);
    expect(report.text).not.toContain('<');
  });
});

/* --------------------------------- insights -------------------------------- */

describe('insights', () => {
  const sessions: FocusSession[] = Array.from({ length: 8 }, (_, index) => ({
    date: `2026-09-0${(index % 5) + 1}`,
    startedAt: `2026-09-0${(index % 5) + 1}T10:00:00.000Z`,
    plannedMinutes: 50,
    actualMinutes: 45,
    completed: true,
  }));

  it('refuses strong claims without data', () => {
    const insights = buildInsights({
      tasks: [math],
      completions: [],
      focusSessions: [],
      sleepRecords: [],
      dayOverrides: [],
      dayStates: [],
      today: DATE,
      buildOccurrences: () => [],
    });
    const peak = insights.find((insight) => insight.id === 'peak-hours');
    expect(peak?.confidence).toBe('low');
    expect(peak?.detail).toContain('داده کافی نیست');
  });

  it('detects peak focus hours with a sample size', () => {
    const insights = buildInsights({
      tasks: [math],
      completions: [],
      focusSessions: sessions,
      sleepRecords: [],
      dayOverrides: [],
      dayStates: [],
      today: DATE,
      buildOccurrences: () => [],
    });
    const peak = insights.find((insight) => insight.id === 'peak-hours');
    expect(peak?.detail).toContain('۱۰ تا ۱۱');
    expect(peak?.sampleSize).toBe(8);
  });

  it('reports a weekday delay pattern only with repetition', () => {
    // four past *Tuesdays* so the same weekday really repeats
    const overrides = ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25'].map((date) => ({
      date,
      globalShiftMinutes: 70,
      taskShifts: {},
      log: [],
      createdAt: '',
      updatedAt: '',
    }));
    const insights = buildInsights({
      tasks: [math],
      completions: [],
      focusSessions: [],
      sleepRecords: [],
      dayOverrides: overrides,
      dayStates: [],
      today: DATE,
      buildOccurrences: () => [],
    });
    const pattern = insights.find((insight) => insight.id === 'weekday-delay');
    expect(pattern?.sampleSize).toBeGreaterThanOrEqual(4);
    expect(pattern?.detail).toMatch(/۴ مورد|۳ مورد/);
  });

  it('flags task avoidance with counts, not accusations', () => {
    const tasks = [math];
    const build = () => buildDayOccurrences(tasks, DATE, ctx(0, []));
    const insights = buildInsights({
      tasks,
      completions: [],
      focusSessions: [],
      sleepRecords: [],
      dayOverrides: [],
      dayStates: [],
      today: DATE,
      buildOccurrences: build,
    });
    const avoidance = insights.find((insight) => insight.id.startsWith('avoidance-'));
    if (avoidance) {
      expect(avoidance.tone).toBe('warning');
      expect(avoidance.detail).not.toContain('تنبل');
    }
  });

  it('proposes practical recovery options', () => {
    // a *past* day with no completion produces a missed occurrence
    const yesterday = '2026-09-04';
    const earlierMath = makeTask({ id: 'math-old', name: 'ریاضی', start: '08:30', end: '09:30', date: '2026-09-01', repeat: { type: 'daily' }, category: 'study' });
    const pastCtx: OccurrenceContext = { nowDate: DATE, nowMinutes: 0, completions: new Map() };
    const plans = buildRecoveryPlans(
      new Map([[yesterday, buildDayOccurrences([earlierMath], yesterday, pastCtx)]]),
      DATE,
      45,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].options.length).toBeGreaterThanOrEqual(3);
    expect(plans[0].options[0].label).toContain('جلسه');
  });

  it('sleep insight stays neutral and non-medical', () => {
    const insights = buildInsights({
      tasks: [math],
      completions: [],
      focusSessions: [],
      sleepRecords: [{ date: DATE, durationMinutes: 480, updatedAt: '' }],
      dayOverrides: [],
      dayStates: [],
      today: DATE,
      buildOccurrences: () => [],
    });
    const sleep = insights.find((insight) => insight.id === 'sleep');
    expect(sleep?.detail).not.toMatch(/بیمار|درمان|تشخیص/);
  });
});

/* ----------------------------- persistence layer --------------------------- */

describe('progress persistence (offline)', () => {
  beforeAll(async () => {
    const { getDb } = await import('@/services/db');
    await getDb().open();
  });

  beforeEach(async () => {
    const { getDb } = await import('@/services/db');
    await taskRepository.clearAll();
    await getDb().xpLedger.clear();
    await getDb().badges.clear();
    await getDb().dayStates.clear();
    await getDb().sleepRecords.clear();
    await getDb().rewards.clear();
    await getDb().redemptions.clear();
    await (await import('@/services/db')).getDb().completions.clear();
  });

  it('awards XP for a completion and keeps the ledger auditable', async () => {
    await taskRepository.put(math);
    const gained = await progressService.awardForCompletion(math, DATE, 'Asia/Tehran');
    expect(gained).toBeGreaterThan(0);
    const entries = await xpRepository.all();
    expect(entries).toHaveLength(1);
    expect(entries[0].reason).toContain('ریاضی');
    expect(await xpRepository.balance()).toBe(gained);
  });

  it('does not double-award the same badge', async () => {
    const first = await badgeRepository.award({ id: 'first-step', awardedAt: new Date().toISOString(), date: DATE });
    const second = await badgeRepository.award({ id: 'first-step', awardedAt: new Date().toISOString(), date: DATE });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await badgeRepository.list()).toHaveLength(1);
  });

  it('enforces the bad day cooldown of 4 days', async () => {
    await dayStateRepository.put({ date: '2026-09-01', badDay: true, badDayUsedAt: new Date().toISOString(), updatedAt: '' });
    // 2026-09-01 is 4 days before 2026-09-05
    const status = await progressService.canActivateBadDay(DATE);
    expect(status.allowed).toBe(true);
    await dayStateRepository.put({ date: '2026-09-03', badDay: true, badDayUsedAt: new Date().toISOString(), updatedAt: '' });
    const blocked = await progressService.canActivateBadDay(DATE);
    expect(blocked.allowed).toBe(false);
    expect(blocked.nextAvailableInDays).toBeGreaterThan(0);
    expect(BAD_DAY_COOLDOWN_DAYS).toBe(4);
  });

  it('records sleep and computes duration across midnight', async () => {
    await progressService.recordSleep({ date: DATE, bedMinutes: 23 * 60 + 30, wakeMinutes: 7 * 60, updatedAt: '' });
    const record = await sleepRepository.get(DATE);
    expect(record?.durationMinutes).toBe(7 * 60 + 30);
  });

  it('spends XP only when the balance allows it', async () => {
    await progressService.awardForCompletion(math, DATE, 'Asia/Tehran');
    const before = await xpRepository.balance();
    const ok = await progressService.spend(20, 'خرید پاداش');
    expect(ok).toBe(true);
    const after = await xpRepository.balance();
    expect(after).toBe(before - 20);
    expect(await progressService.spend(1_000_000, 'خرید بزرگ')).toBe(false);
  });

  it('stores rewards and redemptions locally', async () => {
    const reward = { id: 'r1', name: '۳۰ دقیقه بازی', priceXp: 100, icon: 'star', createdAt: new Date().toISOString() };
    await rewardRepository.put(reward);
    await progressService.awardForCompletion(makeTask({ id: 't', name: 'x', start: '08:00', end: '12:00', date: DATE, category: 'study' }), DATE, 'Asia/Tehran');
    const spent = await progressService.spend(reward.priceXp, `خرید پاداش: ${reward.name}`);
    expect(spent).toBe(true);
    await rewardRepository.redeem({ rewardId: reward.id, name: reward.name, priceXp: reward.priceXp, at: new Date().toISOString() });
    expect(await rewardRepository.redemptions()).toHaveLength(1);
  });

  it('generates quests once per day and re-evaluates completion', async () => {
    await taskRepository.put(math);
    const first = await progressService.ensureQuests(DATE, [math], ctx(7 * 60), {});
    expect(first.length).toBeGreaterThan(0);
    const second = await progressService.ensureQuests(DATE, [math], ctx(7 * 60), {});
    expect(second.map((quest) => quest.id)).toEqual(first.map((quest) => quest.id));
  });
});
