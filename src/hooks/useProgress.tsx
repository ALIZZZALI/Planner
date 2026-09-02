'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePlanner } from './usePlanner';
import { useSettings } from './useSettings';
import { useLiveData } from '@/services/useLiveData';
import {
  badgeRepository,
  completionRepository,
  dayOverrideRepository,
  dayStateRepository,
  focusRepository,
  rewardRepository,
  sleepRepository,
  xpRepository,
} from '@/services/repositories';
import { progressService } from '@/services/progressService';
import { computeDayProgress, levelFromXp, type ScoreBreakdown } from '@/lib/progress/score';
import { BADGES_BY_ID } from '@/lib/progress/badges';
import { buildGarden } from '@/lib/progress/garden';
import { buildInsights, buildRecoveryPlans, type RecoveryPlan } from '@/lib/insights/engine';
import { coachMomentFrom, buildCoachMessage, type CoachMessage } from '@/lib/coach/coach';
import { makeOccurrenceBuilder } from '@/services/progressService';
import { useToast } from '@/components/ui/toast';
import type { BadgeAward, DailyQuest, RewardItem, SleepRecord, TaskOccurrence } from '@/types';

export interface ProgressContextValue {
  score: ScoreBreakdown;
  xp: { balance: number; today: number; level: number; levelCurrent: number; levelNeeded: number };
  badges: BadgeAward[];
  quests: DailyQuest[];
  garden: ReturnType<typeof buildGarden>;
  insights: ReturnType<typeof buildInsights>;
  recovery: RecoveryPlan[];
  coach: CoachMessage | null;
  sleep: SleepRecord | null;
  badDay: boolean;
  rewards: RewardItem[];
  loading: boolean;
  refresh: () => void;
  completeTask: (taskId: string, dateISO: string) => Promise<void>;
  startFocus: (minutes: number, taskId?: string | null, taskName?: string | null) => Promise<void>;
  finishFocus: (minutes: number, taskId?: string | null, taskName?: string | null) => Promise<void>;
  recordSleep: (record: Partial<SleepRecord> & { date: string }) => Promise<void>;
  toggleBadDay: () => Promise<void>;
  badDayCooldown: { allowed: boolean; nextAvailableInDays: number };
  saveReward: (reward: RewardItem) => Promise<void>;
  deleteReward: (id: string) => Promise<void>;
  redeemReward: (reward: RewardItem) => Promise<boolean>;
  celebrate: (kind: 'small' | 'big' | 'badge' | 'garden') => void;
  celebration: { kind: 'small' | 'big' | 'badge' | 'garden'; key: number } | null;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const { tasks, now, occurrenceContext, toggleCompletion, todayOccurrences, addFocusSession, refresh: refreshPlanner } = usePlanner();
  const { push } = useToast();
  const [tick, setTick] = useState(0);
  const [coachMessage, setCoachMessage] = useState<CoachMessage | null>(null);
  const [celebration, setCelebration] = useState<ProgressContextValue['celebration']>(null);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  const xpQuery = useLiveData(() => xpRepository.all(), [tick]);
  const badgeQuery = useLiveData(() => badgeRepository.list(), [tick]);
  const stateQuery = useLiveData(() => dayStateRepository.get(now.date), [tick, now.date]);
  const sleepQuery = useLiveData(() => sleepRepository.get(now.date), [tick, now.date]);
  const rewardQuery = useLiveData(() => rewardRepository.list(), [tick]);
  const focusQuery = useLiveData(() => focusRepository.list(300), [tick]);
  const completionsQuery = useLiveData(() => completionRepository.all(), [tick]);
  const overridesQuery = useLiveData(() => dayOverrideRepository.list(), [tick]);

  const xpEntries = useMemo(() => xpQuery.data ?? [], [xpQuery.data]);
  const badges = useMemo(() => badgeQuery.data ?? [], [badgeQuery.data]);
  const dayState = stateQuery.data ?? null;
  const sleep = sleepQuery.data ?? null;
  const rewards = useMemo(() => rewardQuery.data ?? [], [rewardQuery.data]);
  const focusSessions = useMemo(() => focusQuery.data ?? [], [focusQuery.data]);
  const completions = useMemo(() => completionsQuery.data ?? [], [completionsQuery.data]);
  const overrides = useMemo(() => overridesQuery.data ?? [], [overridesQuery.data]);

  /* ------------------------------- score ------------------------------- */
  const score = useMemo(
    () =>
      computeDayProgress({
        occurrences: todayOccurrences,
        focusSessions: focusSessions.filter((session) => session.date === now.date),
        recoveredFromDelay: Boolean(
          overrides.find((override) => override.date === now.date && override.globalShiftMinutes > 0),
        ),
        badDay: dayState?.badDay ?? false,
      }),
    [todayOccurrences, focusSessions, now.date, overrides, dayState],
  );

  const xp = useMemo(() => {
    const balance = xpEntries.reduce((total, entry) => total + entry.amount, 0);
    const today = xpEntries
      .filter((entry) => entry.date === now.date)
      .reduce((total, entry) => total + entry.amount, 0);
    const { level, current, needed } = levelFromXp(Math.max(0, balance));
    return { balance, today, level, levelCurrent: current, levelNeeded: needed };
  }, [xpEntries, now.date]);

  const garden = useMemo(
    () => buildGarden({ tasks, completions, badges, today: now.date, windowDays: 7 }),
    [tasks, completions, badges, now.date],
  );

  /* ------------------------- quests (per real tasks) ------------------- */
  const quests = useMemo<DailyQuest[]>(() => dayState?.quests ?? [], [dayState]);

  useEffect(() => {
    if (!settings.progress.questsEnabled) return;
    let cancelled = false;
    void progressService
      .ensureQuests(now.date, tasks, occurrenceContext, {})
      .then((result) => {
        if (!cancelled && result.length) refresh();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // quests are generated once per day
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.date, tasks.length, settings.progress.questsEnabled]);

  /* ------------------------------ insights ----------------------------- */
  const occurrenceBuilder = useMemo(
    () =>
      makeOccurrenceBuilder(
        tasks,
        occurrenceContext.completions,
        occurrenceContext.dayOverrides ?? new Map(),
        now.date,
      ),
    [tasks, occurrenceContext, now.date],
  );

  const insights = useMemo(
    () =>
      buildInsights({
        tasks,
        completions,
        focusSessions,
        sleepRecords: sleep ? [sleep] : [],
        dayOverrides: overrides,
        dayStates: dayState ? [dayState] : [],
        today: now.date,
        buildOccurrences: occurrenceBuilder,
      }),
    [tasks, completions, focusSessions, sleep, overrides, dayState, now.date, occurrenceBuilder],
  );

  const recovery = useMemo(
    () => buildRecoveryPlans(new Map([[now.date, occurrenceBuilder(now.date)]]), now.date),
    [occurrenceBuilder, now.date],
  );

  /* -------------------------------- coach ------------------------------ */
  useEffect(() => {
    if (!settings.progress.coachEnabled) return;
    const moment = coachMomentFrom(now.minutes);
    const recentRates = insights.find((insight) => insight.id === 'workload')
      ? []
      : [];
    void recentRates;
    const message = buildCoachMessage({
      moment,
      occurrences: todayOccurrences,
      nowMinutes: now.minutes,
      focusMinutesToday: score.focusMinutes,
      recentRates: [],
      lastMessageId: coachMessage?.id ?? null,
    });
    setCoachMessage(message);
    // recompute when the moment changes or meaningful data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.progress.coachEnabled, now.date, Math.floor(now.minutes / 60), score.completedCount, score.focusMinutes]);

  /* ---------------------------- celebrations --------------------------- */
  const celebrate = useCallback(
    (kind: 'small' | 'big' | 'badge' | 'garden') => {
      if (!settings.progress.animations) return;
      setCelebration({ kind, key: Date.now() });
      window.setTimeout(() => setCelebration(null), kind === 'small' ? 1200 : 2600);
    },
    [settings.progress.animations],
  );

  /* ------------------------- completion side-effects -------------------- */
  const completeTask = useCallback(
    async (taskId: string, dateISO: string) => {
      const task = tasks.find((item) => item.id === taskId);
      const before = todayOccurrences.find((occurrence) => occurrence.taskId === taskId);
      await toggleCompletion(taskId, dateISO, true);

      if (task && settings.progress.enabled) {
        try {
          const gained = await progressService.awardForCompletion(task, dateISO, settings.timezone);
          if (gained) {
            const hard = (task.difficulty ?? 'normal') === 'hard';
            push(`${gained}+ XP`, 'success', `انجام ${task.name}`);
            celebrate(hard ? 'big' : 'small');
          }
          // quest + badge evaluation happens after the write settles
          window.setTimeout(() => {
            void progressService
              .evaluateAndAward(
                tasks,
                occurrenceContext.completions,
                occurrenceBuilder,
                now.date,
              )
              .then((awarded) => {
                if (awarded.length) {
                  awarded.forEach((badge) => {
                    const definition = BADGES_BY_ID[badge.id];
                    if (definition) {
                      push(`نشان جدید: ${definition.title}`, 'success', definition.description);
                    }
                  });
                  celebrate('badge');
                }
                refresh();
              })
              .catch(() => undefined);
          }, 400);
        } catch {
          /* progress must never block task completion */
        }
      }
      void before;
    },
    [tasks, todayOccurrences, toggleCompletion, settings.progress.enabled, settings.timezone, push, celebrate, occurrenceContext, occurrenceBuilder, now.date, refresh],
  );

  const startFocus = useCallback(
    async (minutes: number, taskId?: string | null, taskName?: string | null) => {
      await addFocusSession({
        taskId: taskId ?? null,
        taskName: taskName ?? null,
        date: now.date,
        startedAt: new Date().toISOString(),
        plannedMinutes: minutes,
        completed: false,
      });
    },
    [addFocusSession, now.date],
  );

  const finishFocus = useCallback(
    async (minutes: number, taskId?: string | null, taskName?: string | null) => {
      if (minutes <= 0) return;
      await addFocusSession({
        taskId: taskId ?? null,
        taskName: taskName ?? null,
        date: now.date,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        plannedMinutes: minutes,
        actualMinutes: minutes,
        completed: true,
      });
      if (settings.progress.xpEnabled) {
        await progressService.awardForFocus(minutes, now.date, taskId);
        if (minutes >= 45) celebrate('big');
        else celebrate('small');
      }
      refresh();
      refreshPlanner();
    },
    [addFocusSession, now.date, settings.progress.xpEnabled, celebrate, refresh, refreshPlanner],
  );

  const recordSleep = useCallback(
    async (record: Partial<SleepRecord> & { date: string }) => {
      const saved = await progressService.recordSleep({
        bedMinutes: null,
        wakeMinutes: null,
        durationMinutes: null,
        energy: null,
        ...record,
      } as SleepRecord);
      push('خواب و انرژی امروز ثبت شد.', 'success');
      void saved;
      refresh();
    },
    [push, refresh],
  );

  const [badDayCooldown, setBadDayCooldown] = useState({ allowed: true, nextAvailableInDays: 0 });
  useEffect(() => {
    let cancelled = false;
    void progressService
      .canActivateBadDay(now.date)
      .then((status) => {
        if (!cancelled) setBadDayCooldown({ allowed: status.allowed, nextAvailableInDays: status.nextAvailableInDays });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [now.date, dayState?.badDay, tick]);

  const toggleBadDay = useCallback(async () => {
    const current = dayState?.badDay ?? false;
    if (!current) {
      const status = await progressService.canActivateBadDay(now.date);
      if (!status.allowed) {
        push('حالت روز سخت فعال نیست.', 'error', `دفعه بعدی: ${status.nextAvailableInDays} روز دیگر`);
        return;
      }
      await progressService.setBadDay(now.date, true);
      push('حالت روز سخت فعال شد.', 'info', 'فقط کارهای مهم را نشان می‌دهیم؛ عادی است.');
    } else {
      await progressService.setBadDay(now.date, false);
      push('حالت روز سخت خاموش شد.', 'info');
    }
    refresh();
  }, [dayState?.badDay, now.date, push, refresh]);

  const saveReward = useCallback(
    async (reward: RewardItem) => {
      await rewardRepository.put(reward);
      refresh();
    },
    [refresh],
  );

  const deleteReward = useCallback(
    async (id: string) => {
      await rewardRepository.remove(id);
      refresh();
    },
    [refresh],
  );

  const redeemReward = useCallback(
    async (reward: RewardItem) => {
      const ok = await progressService.spend(reward.priceXp, `خرید پاداش: ${reward.name}`);
      if (!ok) {
        push('XP کافی نیست.', 'error', `برای «${reward.name}» به ${reward.priceXp} XP نیاز است.`);
        return false;
      }
      await rewardRepository.redeem({
        rewardId: reward.id,
        name: reward.name,
        priceXp: reward.priceXp,
        at: new Date().toISOString(),
      });
      push('پاداش ثبت شد؛ لذت ببر!', 'success', `${reward.priceXp} XP خرج شد.`);
      celebrate('garden');
      refresh();
      return true;
    },
    [push, celebrate, refresh],
  );

  const value = useMemo<ProgressContextValue>(
    () => ({
      score,
      xp,
      badges,
      quests,
      garden,
      insights,
      recovery,
      coach: coachMessage,
      sleep,
      badDay: dayState?.badDay ?? false,
      rewards,
      loading: xpQuery.loading,
      refresh,
      completeTask,
      startFocus,
      finishFocus,
      recordSleep,
      toggleBadDay,
      badDayCooldown,
      saveReward,
      deleteReward,
      redeemReward,
      celebrate,
      celebration,
    }),
    [
      score, xp, badges, quests, garden, insights, recovery, coachMessage, sleep,
      dayState?.badDay, rewards, xpQuery.loading, refresh, completeTask, startFocus,
      finishFocus, recordSleep, toggleBadDay, saveReward, deleteReward, redeemReward,
      celebrate, celebration, badDayCooldown,
    ],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const context = useContext(ProgressContext);
  if (!context) throw new Error('useProgress باید داخل ProgressProvider استفاده شود.');
  return context;
}

export type { TaskOccurrence };
