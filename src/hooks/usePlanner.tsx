'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  completionRepository,
  dayOverrideRepository,
  focusRepository,
  habitRepository,
  taskRepository,
} from '@/services/repositories';
import { useLiveData } from '@/services/useLiveData';
import { buildDayOccurrences, type OccurrenceContext } from '@/lib/schedule/occurrence';
import { nowInZone } from '@/lib/date/timezone';
import { createReminderEngine } from '@/services/notificationService';
import { resolveTimezone, useSettings } from './useSettings';
import {
  applyScheduleShift,
  resetDailySchedule,
  undoScheduleShift,
  type ShiftOptions,
  type ShiftPreview,
} from '@/lib/schedule/dayShift';
import type {
  CompletionRecord,
  DayOverride,
  FocusSession,
  Habit,
  HabitLog,
  Task,
  TaskOccurrence,
} from '@/types';

export interface NowState {
  date: string;
  minutes: number;
  hh: number;
  mm: number;
  ss: number;
}

export interface PlannerContextValue {
  /** false during SSR/hydration so time text can be masked until mounted */
  tasks: Task[];
  completions: CompletionRecord[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  loading: boolean;
  error: string | null;
  now: NowState;
  clockReady: boolean;
  timezone: string;
  todayOccurrences: TaskOccurrence[];
  occurrenceContext: OccurrenceContext;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  archiveTask: (id: string, archived: boolean) => Promise<void>;
  toggleCompletion: (taskId: string, date: string, done?: boolean) => Promise<void>;
  skipOccurrence: (taskId: string, date: string) => Promise<void>;
  saveHabit: (habit: Habit) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  toggleHabit: (habitId: string, date: string, done?: boolean) => Promise<boolean>;
  addFocusSession: (session: Omit<FocusSession, 'id'>) => Promise<void>;
  dayOverride: DayOverride | null;
  todayShiftMinutes: number;
  /** writes a previewed shift for one date only (templates untouched) */
  applyShift: (dateISO: string, preview: ShiftPreview, options: ShiftOptions, note?: string) => Promise<DayOverride>;
  undoShift: (dateISO: string) => Promise<boolean>;
  resetDay: (dateISO: string) => Promise<void>;
  recordWakeUp: (dateISO: string, actualMinutes: number, plannedMinutes: number | null) => Promise<DayOverride>;
  clearWakeUp: (dateISO: string) => Promise<void>;
  loadSampleData: () => Promise<number>;
  refresh: () => void;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

const CLOCK_PLACEHOLDER: NowState = { date: '1970-01-01', minutes: 0, hh: 0, mm: 0, ss: 0 };

export function PlannerProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const timezone = resolveTimezone(settings);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [tick, setTick] = useState(0);
  const tasksQuery = useLiveData<Task[]>(() => taskRepository.list(), [tick]);
  const completionsQuery = useLiveData<CompletionRecord[]>(() => completionRepository.all(), [tick]);
  const habitsQuery = useLiveData<Habit[]>(() => habitRepository.list(), [tick]);
  const habitLogsQuery = useLiveData<HabitLog[]>(() => habitRepository.allLogs(), [tick]);
  const focusQuery = useLiveData<FocusSession[]>(() => focusRepository.list(300), [tick]);
  const overridesQuery = useLiveData<DayOverride[]>(() => dayOverrideRepository.list(), [tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  /* ------------------------------- clock tick ------------------------------ */
  /**
   * The clock starts from a deterministic placeholder so that the first client
   * render matches the prerendered HTML (avoids hydration mismatches); the real
   * value is filled in right after mount.
   */
  const [now, setNow] = useState<NowState>(CLOCK_PLACEHOLDER);
  const [clockReady, setClockReady] = useState(false);

  useEffect(() => {
    // Only update state when the *minute* changes: re-rendering the whole tree
    // every 15s (with identical values) forced every derived schedule to be
    // recomputed for no visible reason.
    const compute = () => {
      const value = nowInZone(resolveTimezone(settingsRef.current));
      setNow((current) =>
        current.date === value.date && current.minutes === value.minutes
          ? current
          : {
              date: value.date,
              minutes: value.minutes,
              hh: value.hh,
              mm: value.mm,
              ss: value.ss,
            },
      );
    };
    compute();
    setClockReady(true);
    const interval = window.setInterval(compute, 15000);
    return () => window.clearInterval(interval);
  }, [timezone]);

  /* --------------------------------- data --------------------------------- */
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const completions = useMemo(() => completionsQuery.data ?? [], [completionsQuery.data]);
  const habits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const habitLogs = useMemo(() => habitLogsQuery.data ?? [], [habitLogsQuery.data]);
  const focusSessions = useMemo(() => focusQuery.data ?? [], [focusQuery.data]);
  const dayOverrides = useMemo(() => overridesQuery.data ?? [], [overridesQuery.data]);

  /** date -> override; fed into every derived schedule so Today, Calendar and
   *  reminders all see the same shifted times without any extra wiring. */
  const dayOverrideMap = useMemo(
    () => new Map(dayOverrides.map((override) => [override.date, override])),
    [dayOverrides],
  );

  const completionsMap = useMemo(
    () => new Map(completions.map((record) => [record.id, record])),
    [completions],
  );

  const occurrenceContext = useMemo<OccurrenceContext>(
    () => ({
      nowDate: now.date,
      nowMinutes: now.minutes,
      completions: completionsMap,
      dayOverrides: dayOverrideMap,
    }),
    [now.date, now.minutes, completionsMap, dayOverrideMap],
  );

  // Latest snapshot for the background reminder loop, so the interval is
  // installed once instead of being recreated on every data change.
  const reminderRef = useRef<{
    tasks: Task[];
    completions: Map<string, CompletionRecord>;
    overrides: Map<string, DayOverride>;
    minutes: number;
    date: string;
  }>({ tasks, completions: completionsMap, overrides: dayOverrideMap, minutes: now.minutes, date: now.date });
  reminderRef.current = { tasks, completions: completionsMap, overrides: dayOverrideMap, minutes: now.minutes, date: now.date };

  const todayOccurrences = useMemo(
    () => buildDayOccurrences(tasks, now.date, occurrenceContext),
    [tasks, now.date, occurrenceContext],
  );

  /* ------------------------------- reminders ------------------------------ */
  const reminderEngine = useMemo(() => createReminderEngine(() => settingsRef.current), []);
  const remindersEnabled = settings.notifications.enabled;

  useEffect(() => {
    if (!remindersEnabled) return;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      try {
        const snapshot = reminderRef.current;
        const occurrences = buildDayOccurrences(snapshot.tasks, snapshot.date, {
          nowDate: snapshot.date,
          nowMinutes: snapshot.minutes,
          completions: snapshot.completions,
          dayOverrides: snapshot.overrides,
        });
        await reminderEngine.scheduler.evaluate(occurrences, snapshot.date, snapshot.minutes);
      } catch {
        /* reminder failures must never break the app */
      }
    };
    void run();
    const interval = window.setInterval(run, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [remindersEnabled, reminderEngine]);

  useEffect(() => {
    if (!remindersEnabled) return;
    void reminderEngine.notifications.registerServiceWorker();
  }, [remindersEnabled, reminderEngine]);

  /* ------------------------------- mutations ------------------------------ */
  const saveTask = useCallback(
    async (task: Task) => {
      await taskRepository.put({ ...task, updatedAt: new Date().toISOString() });
      refresh();
    },
    [refresh],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await taskRepository.remove(id);
      refresh();
    },
    [refresh],
  );

  const archiveTask = useCallback(
    async (id: string, archived: boolean) => {
      await taskRepository.archive(id, archived);
      refresh();
    },
    [refresh],
  );

  const toggleCompletion = useCallback(
    async (taskId: string, date: string, done?: boolean) => {
      const record = completionsMap.get(`${taskId}:${date}`);
      const shouldComplete = done ?? record?.status !== 'completed';
      await completionRepository.set(taskId, date, shouldComplete ? 'completed' : null);
      refresh();
    },
    [completionsMap, refresh],
  );

  const skipOccurrence = useCallback(
    async (taskId: string, date: string) => {
      const record = completionsMap.get(`${taskId}:${date}`);
      if (record?.status === 'skipped') {
        await completionRepository.set(taskId, date, null);
      } else {
        await completionRepository.set(taskId, date, 'skipped');
      }
      refresh();
    },
    [completionsMap, refresh],
  );

  const saveHabit = useCallback(
    async (habit: Habit) => {
      await habitRepository.put(habit);
      refresh();
    },
    [refresh],
  );

  const deleteHabit = useCallback(
    async (id: string) => {
      await habitRepository.remove(id);
      refresh();
    },
    [refresh],
  );

  const toggleHabit = useCallback(
    async (habitId: string, date: string, done?: boolean) => {
      const value = await habitRepository.toggle(habitId, date, done);
      refresh();
      return value;
    },
    [refresh],
  );

  const addFocusSession = useCallback(
    async (session: Omit<FocusSession, 'id'>) => {
      await focusRepository.add(session);
      refresh();
    },
    [refresh],
  );

  /* ------------------------- daily schedule shifting ------------------------ */
  const todayOverride = useMemo(
    () => dayOverrideMap.get(now.date) ?? null,
    [dayOverrideMap, now.date],
  );

  const todayShiftMinutes = todayOverride
    ? todayOverride.globalShiftMinutes +
      Object.values(todayOverride.taskShifts ?? {}).reduce((sum, value) => sum + value, 0)
    : 0;

  const applyShift = useCallback(
    async (dateISO: string, preview: ShiftPreview, options: ShiftOptions, note?: string) => {
      const db = (await import('@/services/db')).getDb();
      const current = await dayOverrideRepository.ensure(dateISO);
      const next = applyScheduleShift(current, preview, options, note);
      await db.transaction('rw', db.dayOverrides, async () => {
        await dayOverrideRepository.put(next);
      });
      refresh();
      return next;
    },
    [refresh],
  );

  const undoShift = useCallback(
    async (dateISO: string) => {
      const current = await dayOverrideRepository.get(dateISO);
      if (!current) return false;
      const { next, undone } = undoScheduleShift(current);
      if (!undone) return false;
      if (next && (next.globalShiftMinutes !== 0 || Object.keys(next.taskShifts ?? {}).length)) {
        await dayOverrideRepository.put(next);
      } else {
        await dayOverrideRepository.remove(dateISO);
      }
      refresh();
      return true;
    },
    [refresh],
  );

  const resetDay = useCallback(
    async (dateISO: string) => {
      const current = await dayOverrideRepository.get(dateISO);
      if (current) await dayOverrideRepository.remove(dateISO);
      refresh();
    },
    [refresh],
  );

  const recordWakeUp = useCallback(
    async (dateISO: string, actualMinutes: number, plannedMinutes: number | null) => {
      const current = await dayOverrideRepository.ensure(dateISO);
      const next: DayOverride = {
        ...current,
        actualWakeUpMinutes: actualMinutes,
        plannedWakeUpMinutes: plannedMinutes ?? current.plannedWakeUpMinutes ?? null,
      };
      await dayOverrideRepository.put(next);
      refresh();
      return next;
    },
    [refresh],
  );

  const clearWakeUp = useCallback(
    async (dateISO: string) => {
      const current = await dayOverrideRepository.get(dateISO);
      if (!current) return;
      await dayOverrideRepository.put({ ...current, actualWakeUpMinutes: null });
      refresh();
    },
    [refresh],
  );

  const loadSampleData = useCallback(async () => {
    const today = nowInZone(resolveTimezone(settingsRef.current)).date;
    const { buildSampleHabits, buildSampleTasks } = await import('@/lib/sampleData');
    const sampleTasks = buildSampleTasks(today).map((task) => ({
      ...task,
      id: `${task.id}-${Date.now().toString(36).slice(-4)}`,
    }));
    await taskRepository.putMany(sampleTasks);
    await habitRepository.putMany(buildSampleHabits());
    refresh();
    return sampleTasks.length;
  }, [refresh]);

  const value = useMemo<PlannerContextValue>(
    () => ({
      tasks,
      completions,
      habits,
      habitLogs,
      focusSessions,
      loading: tasksQuery.loading || completionsQuery.loading,
      error: tasksQuery.error ?? completionsQuery.error,
      now,
      clockReady,
      timezone,
      todayOccurrences,
      occurrenceContext,
      saveTask,
      deleteTask,
      archiveTask,
      toggleCompletion,
      skipOccurrence,
      saveHabit,
      deleteHabit,
      toggleHabit,
      addFocusSession,
      dayOverride: todayOverride,
      todayShiftMinutes,
      applyShift,
      undoShift,
      resetDay,
      recordWakeUp,
      clearWakeUp,
      loadSampleData,
      refresh,
    }),
    [
      tasks,
      completions,
      habits,
      habitLogs,
      focusSessions,
      tasksQuery.loading,
      completionsQuery.loading,
      tasksQuery.error,
      completionsQuery.error,
      now,
      clockReady,
      timezone,
      todayOccurrences,
      occurrenceContext,
      saveTask,
      deleteTask,
      archiveTask,
      toggleCompletion,
      skipOccurrence,
      saveHabit,
      deleteHabit,
      toggleHabit,
      addFocusSession,
      todayOverride,
      todayShiftMinutes,
      applyShift,
      undoShift,
      resetDay,
      recordWakeUp,
      clearWakeUp,
      loadSampleData,
      refresh,
    ],
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner(): PlannerContextValue {
  const context = useContext(PlannerContext);
  if (!context) throw new Error('usePlanner باید داخل PlannerProvider استفاده شود.');
  return context;
}
