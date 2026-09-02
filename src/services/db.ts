/**
 * IndexedDB database (Dexie).
 *
 * The instance is created lazily so importing this module never touches
 * `indexedDB` during SSR / prerender.
 */

import Dexie, { type Table } from 'dexie';
import type {
  AppMeta,
  BadgeAward,
  XpEntry,
  CompletionRecord,
  DayOverride,
  DayState,
  RedemptionRecord,
  RewardItem,
  SleepRecord,
  FocusSession,
  Habit,
  HabitLog,
  Settings,
  Task,
} from '@/types';

export class PlannerDatabase extends Dexie {
  tasks!: Table<Task, string>;
  completions!: Table<CompletionRecord, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  focusSessions!: Table<FocusSession, number>;
  settings!: Table<{ key: string; value: Settings }, string>;
  meta!: Table<AppMeta, string>;
  dayOverrides!: Table<DayOverride, string>;
  sleepRecords!: Table<SleepRecord, string>;
  rewards!: Table<RewardItem, string>;
  redemptions!: Table<RedemptionRecord, number>;
  xpLedger!: Table<XpEntry, number>;
  badges!: Table<BadgeAward, string>;
  dayStates!: Table<DayState, string>;

  constructor() {
    super('planner-db');
    this.version(1).stores({
      tasks: 'id, name, category, date, endDate, archived, updatedAt',
      completions: 'id, taskId, date, [taskId+date]',
      habits: 'id, archived, createdAt',
      habitLogs: 'id, habitId, date',
      focusSessions: '++id, date, taskId',
      settings: 'key',
      meta: 'key',
    });

    // v2: daily schedule overrides (late wake-up / flexible day) + import history
    this.version(2).stores({
      tasks: 'id, name, category, date, endDate, archived, updatedAt',
      completions: 'id, taskId, date, [taskId+date]',
      habits: 'id, archived, createdAt',
      habitLogs: 'id, habitId, date',
      focusSessions: '++id, date, taskId',
      settings: 'key',
      meta: 'key',
      dayOverrides: 'date, updatedAt',
    });

    // v3: progress domain — XP ledger, rewards, badges, sleep, day states
    this.version(3).stores({
      tasks: 'id, name, category, date, endDate, archived, updatedAt',
      completions: 'id, taskId, date, [taskId+date]',
      habits: 'id, archived, createdAt',
      habitLogs: 'id, habitId, date',
      focusSessions: '++id, date, taskId',
      settings: 'key',
      meta: 'key',
      dayOverrides: 'date, updatedAt',
      sleepRecords: 'date',
      rewards: 'id, archived',
      redemptions: '++id, at, rewardId',
      xpLedger: '++id, date, kind',
      badges: 'id, awardedAt',
      dayStates: 'date',
    });
  }
}

let instance: PlannerDatabase | null = null;

/** Throws a Persian error when IndexedDB is unavailable (private mode, SSR…). */
export function getDb(): PlannerDatabase {
  if (typeof indexedDB === 'undefined') {
    throw new Error('پایگاه داده محلی فقط در مرورگر در دسترس است.');
  }
  if (!instance) instance = new PlannerDatabase();
  return instance;
}

export function dbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

export async function diagnoseStorage(): Promise<{ ok: boolean; message: string }> {
  if (!dbAvailable()) {
    return { ok: false, message: 'این مرورگر از IndexedDB پشتیبانی نمی‌کند؛ داده‌ها ذخیره نمی‌شوند.' };
  }
  try {
    const database = getDb();
    await database.open();
    return { ok: true, message: 'پایگاه داده محلی آماده است.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `دسترسی به پایگاه داده محلی ممکن نیست: ${message}`,
    };
  }
}
