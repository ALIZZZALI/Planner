/**
 * Repository layer — the single gateway between UI and storage.
 * Swapping IndexedDB for a server API later means re-implementing these
 * classes only; no UI or scheduling code changes.
 */

import { getDb } from './db';
import { CATEGORY_KINDS, DEFAULT_SETTINGS } from '@/lib/constants';
import type {
  AppMeta,
  BadgeAward,
  CompletionRecord,
  DayOverride,
  DayState,
  RedemptionRecord,
  RewardItem,
  SleepRecord,
  XpEntry,
  FocusSession,
  Habit,
  HabitLog,
  Settings,
  Task,
} from '@/types';

const SETTINGS_KEY = 'app';

function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  if (!stored) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    showSections: { ...DEFAULT_SETTINGS.showSections, ...(stored.showSections ?? {}) },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(stored.notifications ?? {}) },
    focus: { ...DEFAULT_SETTINGS.focus, ...(stored.focus ?? {}) },
    categories: (stored.categories?.length ? stored.categories : DEFAULT_SETTINGS.categories).map(
      (category) => ({ ...category, kind: category.kind ?? CATEGORY_KINDS[category.id] ?? 'general' }),
    ),
    shift: { ...DEFAULT_SETTINGS.shift, ...(stored.shift ?? {}) },
    progress: { ...DEFAULT_SETTINGS.progress, ...(stored.progress ?? {}) },
    report: { ...DEFAULT_SETTINGS.report, ...(stored.report ?? {}) },
    history: { ...DEFAULT_SETTINGS.history, ...(stored.history ?? {}) },
    sleepTracking: stored.sleepTracking ?? DEFAULT_SETTINGS.sleepTracking,
    version: 1,
  };
}

export class TaskRepository {
  async list(): Promise<Task[]> {
    const rows = await getDb().tasks.toArray();
    return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  async listActive(): Promise<Task[]> {
    const rows = await getDb().tasks.filter((t) => !t.archived).toArray();
    return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  async get(id: string): Promise<Task | undefined> {
    return getDb().tasks.get(id);
  }

  async exists(id: string): Promise<boolean> {
    return (await getDb().tasks.get(id)) !== undefined;
  }

  async put(task: Task): Promise<void> {
    await getDb().tasks.put(task);
  }

  async putMany(tasks: Task[]): Promise<void> {
    await getDb().tasks.bulkPut(tasks);
  }

  async remove(id: string): Promise<void> {
    await getDb().tasks.delete(id);
    const db = getDb();
    const orphan = await db.completions.where('taskId').equals(id).toArray();
    if (orphan.length) await db.completions.bulkDelete(orphan.map((c) => c.id));
  }

  async archive(id: string, archived = true): Promise<void> {
    const db = getDb();
    const task = await db.tasks.get(id);
    if (!task) return;
    await db.tasks.put({ ...task, archived, updatedAt: new Date().toISOString() });
  }

  async count(): Promise<number> {
    return getDb().tasks.count();
  }

  /** Used by "replace" imports: wipe definitions but keep completion history. */
  async replaceDefinitions(tasks: Task[], keepHistory = true): Promise<void> {
    const db = getDb();
    await db.transaction('rw', db.tasks, async () => {
      await db.tasks.clear();
      await db.tasks.bulkPut(tasks);
    });
    if (!keepHistory) await db.completions.clear();
  }

  async clearAll(): Promise<void> {
    const db = getDb();
    await db.tasks.clear();
    await db.completions.clear();
  }
}

export class CompletionRepository {
  async all(): Promise<CompletionRecord[]> {
    return getDb().completions.toArray();
  }

  async forTask(taskId: string): Promise<CompletionRecord[]> {
    return getDb().completions.where('taskId').equals(taskId).toArray();
  }

  async forDate(dateISO: string): Promise<CompletionRecord[]> {
    return getDb().completions.where('date').equals(dateISO).toArray();
  }

  async forRange(fromISO: string, toISO: string): Promise<CompletionRecord[]> {
    const rows = await getDb().completions.toArray();
    return rows.filter((r) => r.date >= fromISO && r.date <= toISO);
  }

  async get(taskId: string, dateISO: string): Promise<CompletionRecord | undefined> {
    return getDb().completions.get(`${taskId}:${dateISO}`);
  }

  async set(taskId: string, dateISO: string, status: 'completed' | 'skipped' | null): Promise<void> {
    const db = getDb();
    const id = `${taskId}:${dateISO}`;
    if (status === null) {
      await db.completions.delete(id);
      return;
    }
    await db.completions.put({
      id,
      taskId,
      date: dateISO,
      status,
      completedAt: new Date().toISOString(),
    });
  }

  async bulkPut(records: CompletionRecord[]): Promise<void> {
    await getDb().completions.bulkPut(records);
  }

  async statsBetween(fromISO: string, toISO: string) {
    const rows = await this.forRange(fromISO, toISO);
    const completed = rows.filter((r) => r.status === 'completed').length;
    const skipped = rows.filter((r) => r.status === 'skipped').length;
    return { total: rows.length, completed, skipped };
  }
}

const EMPTY_OVERRIDE = (date: string): DayOverride => ({
  date,
  globalShiftMinutes: 0,
  taskShifts: {},
  actualWakeUpMinutes: null,
  plannedWakeUpMinutes: null,
  log: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export class DayOverrideRepository {
  async get(dateISO: string): Promise<DayOverride | undefined> {
    return getDb().dayOverrides.get(dateISO);
  }

  async getMany(dates: string[]): Promise<Map<string, DayOverride>> {
    const rows = await getDb().dayOverrides.bulkGet(dates);
    const map = new Map<string, DayOverride>();
    rows.forEach((row) => {
      if (row) map.set(row.date, row);
    });
    return map;
  }

  async list(): Promise<DayOverride[]> {
    return getDb().dayOverrides.toArray();
  }

  async put(override: DayOverride): Promise<void> {
    await getDb().dayOverrides.put({ ...override, updatedAt: new Date().toISOString() });
  }

  async remove(dateISO: string): Promise<void> {
    await getDb().dayOverrides.delete(dateISO);
  }

  async clearRange(fromISO: string, toISO: string): Promise<number> {
    const db = getDb();
    const rows = await db.dayOverrides.toArray();
    const doomed = rows.filter((row) => row.date >= fromISO && row.date <= toISO).map((r) => r.date);
    if (doomed.length) await db.dayOverrides.bulkDelete(doomed);
    return doomed.length;
  }

  /** Reads or creates the (empty) override record for a date. */
  async ensure(dateISO: string): Promise<DayOverride> {
    const existing = await this.get(dateISO);
    if (existing) return existing;
    const fresh = EMPTY_OVERRIDE(dateISO);
    await getDb().dayOverrides.put(fresh);
    return fresh;
  }
}

export class SettingsRepository {
  async load(): Promise<Settings> {
    const row = await getDb().settings.get(SETTINGS_KEY);
    return mergeSettings(row?.value);
  }

  async save(patch: Partial<Settings>): Promise<Settings> {
    const db = getDb();
    const current = await this.load();
    const next = mergeSettings({ ...current, ...patch });
    await db.settings.put({ key: SETTINGS_KEY, value: next });
    return next;
  }

  async reset(): Promise<Settings> {
    await getDb().settings.delete(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS };
  }
}

export class HabitRepository {
  async list(): Promise<Habit[]> {
    const rows = await getDb().habits.toArray();
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async put(habit: Habit): Promise<void> {
    await getDb().habits.put(habit);
  }

  async putMany(habits: Habit[]): Promise<void> {
    await getDb().habits.bulkPut(habits);
  }

  async remove(id: string): Promise<void> {
    const db = getDb();
    await db.habits.delete(id);
    const logs = await db.habitLogs.where('habitId').equals(id).toArray();
    if (logs.length) await db.habitLogs.bulkDelete(logs.map((l) => l.id));
  }

  async logsForRange(fromISO: string, toISO: string): Promise<HabitLog[]> {
    const rows = await getDb().habitLogs.toArray();
    return rows.filter((l) => l.date >= fromISO && l.date <= toISO);
  }

  async allLogs(): Promise<HabitLog[]> {
    return getDb().habitLogs.toArray();
  }

  async toggle(habitId: string, dateISO: string, done?: boolean): Promise<boolean> {
    const db = getDb();
    const id = `${habitId}:${dateISO}`;
    const existing = await db.habitLogs.get(id);
    const next = done ?? !existing?.done;
    await db.habitLogs.put({
      id,
      habitId,
      date: dateISO,
      done: next,
      updatedAt: new Date().toISOString(),
    });
    return next;
  }

  async bulkPutLogs(logs: HabitLog[]): Promise<void> {
    await getDb().habitLogs.bulkPut(logs);
  }
}

export class FocusRepository {
  async list(limit = 200): Promise<FocusSession[]> {
    const rows = await getDb().focusSessions.orderBy('date').reverse().limit(limit).toArray();
    return rows;
  }

  async add(session: FocusSession): Promise<number> {
    return getDb().focusSessions.add(session);
  }

  async update(session: FocusSession): Promise<void> {
    if (session.id === undefined) return;
    await getDb().focusSessions.put(session);
  }

  async forRange(fromISO: string, toISO: string): Promise<FocusSession[]> {
    const rows = await getDb().focusSessions.toArray();
    return rows.filter((s) => s.date >= fromISO && s.date <= toISO);
  }
}

export class XpRepository {
  async all(): Promise<XpEntry[]> {
    return getDb().xpLedger.toArray();
  }

  async forRange(fromISO: string, toISO: string): Promise<XpEntry[]> {
    const rows = await getDb().xpLedger.toArray();
    return rows.filter((row) => row.date >= fromISO && row.date <= toISO);
  }

  async add(entry: Omit<XpEntry, 'id'>): Promise<void> {
    await getDb().xpLedger.add(entry);
  }

  async balance(): Promise<number> {
    const rows = await getDb().xpLedger.toArray();
    return rows.reduce((total, row) => total + row.amount, 0);
  }

  async clear(): Promise<void> {
    await getDb().xpLedger.clear();
  }
}

export class RewardRepository {
  async list(): Promise<RewardItem[]> {
    return getDb().rewards.toArray();
  }

  async put(reward: RewardItem): Promise<void> {
    await getDb().rewards.put(reward);
  }

  async remove(id: string): Promise<void> {
    await getDb().rewards.delete(id);
  }

  async redeem(record: RedemptionRecord): Promise<void> {
    await getDb().redemptions.add(record);
  }

  async redemptions(limit = 100): Promise<RedemptionRecord[]> {
    const rows = await getDb().redemptions.toArray();
    return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
  }
}

export class BadgeRepository {
  async list(): Promise<BadgeAward[]> {
    return getDb().badges.toArray();
  }

  async has(id: string): Promise<boolean> {
    return (await getDb().badges.get(id)) !== undefined;
  }

  async award(badge: BadgeAward): Promise<boolean> {
    const db = getDb();
    if (await db.badges.get(badge.id)) return false;
    await db.badges.put(badge);
    return true;
  }

  async markSeen(ids: string[]): Promise<void> {
    const db = getDb();
    await db.badges.bulkPut(
      (await db.badges.toArray()).filter((badge) => ids.includes(badge.id)).map((badge) => ({ ...badge, seen: true })),
    );
  }
}

export class SleepRepository {
  async list(): Promise<SleepRecord[]> {
    return getDb().sleepRecords.toArray();
  }

  async forRange(fromISO: string, toISO: string): Promise<SleepRecord[]> {
    const rows = await getDb().sleepRecords.toArray();
    return rows.filter((row) => row.date >= fromISO && row.date <= toISO);
  }

  async put(record: SleepRecord): Promise<void> {
    await getDb().sleepRecords.put({ ...record, updatedAt: new Date().toISOString() });
  }

  async get(dateISO: string): Promise<SleepRecord | undefined> {
    return getDb().sleepRecords.get(dateISO);
  }
}

export class DayStateRepository {
  async get(dateISO: string): Promise<DayState | undefined> {
    return getDb().dayStates.get(dateISO);
  }

  async list(): Promise<DayState[]> {
    return getDb().dayStates.toArray();
  }

  async forRange(fromISO: string, toISO: string): Promise<DayState[]> {
    const rows = await getDb().dayStates.toArray();
    return rows.filter((row) => row.date >= fromISO && row.date <= toISO);
  }

  async put(state: DayState): Promise<void> {
    await getDb().dayStates.put({ ...state, updatedAt: new Date().toISOString() });
  }
}

export class MetaRepository {
  async get(key: string): Promise<AppMeta | undefined> {
    return getDb().meta.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    await getDb().meta.put({ key, value, updatedAt: new Date().toISOString() });
  }

  async all(): Promise<AppMeta[]> {
    return getDb().meta.toArray();
  }
}

export const taskRepository = new TaskRepository();
export const completionRepository = new CompletionRepository();
export const settingsRepository = new SettingsRepository();
export const habitRepository = new HabitRepository();
export const focusRepository = new FocusRepository();
export const dayOverrideRepository = new DayOverrideRepository();
export const xpRepository = new XpRepository();
export const rewardRepository = new RewardRepository();
export const badgeRepository = new BadgeRepository();
export const sleepRepository = new SleepRepository();
export const dayStateRepository = new DayStateRepository();
export const metaRepository = new MetaRepository();
