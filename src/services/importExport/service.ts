/**
 * ImportExportService — a schedule migration tool, not a file uploader.
 *
 * Flow: validate → (optional date/time/category transforms) → preview →
 * conflict resolution → atomic apply, with local backups + import history.
 * Everything runs offline against IndexedDB through the repository layer.
 */

import {
  CURRENT_SCHEMA_VERSION,
  migratePayload,
  normalizePayloadFields,
  normalizeTasks,
  sanitizeDisplayText,
  validateScheduleObject,
  validateScheduleText,
  type FieldMapping,
  type NormalizeTransforms,
  type RawPayload,
  type RecordIssue,
  type ValidationIssue,
} from './schema';
import {
  completionRepository,
  dayOverrideRepository,
  habitRepository,
  metaRepository,
  settingsRepository,
  taskRepository,
} from '@/services/repositories';
import { getDb } from '@/services/db';
import { buildDayOccurrences, type OccurrenceContext } from '@/lib/schedule/occurrence';
import { addDays, compareISO } from '@/lib/date/iso';
import { COLOR_TOKENS } from '@/lib/constants';
import { isValidTimeZone } from '@/lib/date/timezone';
import { uid } from '@/lib/utils';
import type {
  Category,
  CompletionRecord,
  DayOverride,
  Habit,
  Settings,
  Task,
  Weekday,
} from '@/types';

export interface ImportIssue extends RecordIssue {}

export interface DuplicateCandidate {
  incoming: Task;
  existing: Task;
  signal: 'id+date' | 'name+date+start' | 'recurrence';
}

export interface ImportOptions extends NormalizeTransforms {
  /** maps the file's earliest start date onto this date */
  newStartDate?: string;
}

export type ImportMode = 'merge' | 'replace' | 'addNew' | 'updateExisting';
export type IdResolution = 'use-imported' | 'keep-existing' | 'new-id';

export interface ImportPreview {
  valid: boolean;
  tooNew: boolean;
  version: number;
  migrationNotes: string[];
  added: Task[];
  changed: { incoming: Task; existing: Task }[];
  unchanged: Task[];
  conflicts: { incoming: Task; existing: Task; date: string }[];
  duplicates: DuplicateCandidate[];
  invalid: ImportIssue[];
  duplicateIds: string[];
  completions: CompletionRecord[];
  habits: Habit[];
  categories: Category[];
  dayOverrides: DayOverride[];
  totalIncoming: number;
  fixedCount: number;
  recurringCount: number;
  dateRange: { from: string | null; to: string | null };
  fileTimezone: string | null;
  error: string | null;
}

export interface ParseOutcome {
  preview: ImportPreview | null;
  structuralIssues: ValidationIssue[];
  error: string | null;
  fieldMappings: FieldMapping[];
  timezoneMismatch: { file: string; app: string } | null;
}

export interface ApplyOptions {
  importCompletions: boolean;
  importHabits: boolean;
  importCategories: boolean;
  importDayOverrides: boolean;
  keepHistory: boolean;
  idResolution: IdResolution;
  categoryMapping: Record<string, string>;
  backupBefore: boolean;
}

export interface ImportResult {
  added: number;
  updated: number;
  removed: number;
  duplicatesIgnored: number;
  warnings: string[];
}

export interface BackupRecord {
  id: string;
  createdAt: string;
  label: string;
  taskCount: number;
  kind: 'auto' | 'manual';
  payload: string;
}

export interface ImportHistoryEntry {
  at: string;
  source: string;
  mode: ImportMode;
  added: number;
  updated: number;
  removed: number;
  success: boolean;
  warnings: number;
  message?: string;
}

const HISTORY_KEY = 'import-history';
const BACKUP_PREFIX = 'backup:';

function tasksEqual(a: Task, b: Task): boolean {
  const fields: (keyof Task)[] = [
    'name', 'date', 'endDate', 'start', 'end', 'repeat', 'category', 'icon',
    'color', 'priority', 'reminder', 'notes', 'occurrenceLimit', 'fixedTime',
  ];
  return fields.every((field) => JSON.stringify(a[field]) === JSON.stringify(b[field]));
}

export interface ExportOptions {
  includeCompletions?: boolean;
  includeHabits?: boolean;
  includeSettings?: boolean;
  includeCategories?: boolean;
  includeDayOverrides?: boolean;
  includeShiftHistory?: boolean;
  taskIds?: string[] | null;
  rangeFrom?: string | null;
  rangeTo?: string | null;
  categoryIds?: string[] | null;
  /** export one day's effective (shifted) times instead of the templates */
  effectiveForDate?: string | null;
  kind?: 'schedule' | 'backup';
}

export class ImportExportService {
  /* ------------------------------- validation ------------------------------ */

  async parse(text: string, nowISO: string, options: ImportOptions = {}): Promise<ParseOutcome> {
    const validation = validateScheduleText(text);
    if (!validation.ok || !validation.payload) {
      return { preview: null, structuralIssues: validation.issues, error: null, fieldMappings: [], timezoneMismatch: null };
    }
    const { mappings } = this.collectMappings(text);
    return this.buildPreview(validation.payload, nowISO, options, mappings);
  }

  async parseObject(raw: unknown, nowISO: string, options: ImportOptions = {}): Promise<ParseOutcome> {
    const validation = validateScheduleObject(raw);
    if (!validation.ok || !validation.payload) {
      return { preview: null, structuralIssues: validation.issues, error: null, fieldMappings: [], timezoneMismatch: null };
    }
    return this.buildPreview(validation.payload, nowISO, options, []);
  }

  private collectMappings(text: string): { mappings: FieldMapping[] } {
    try {
      const result = normalizePayloadFields(JSON.parse(text));
      return { mappings: result.mappings };
    } catch {
      return { mappings: [] };
    }
  }

  private async buildPreview(
    payload: RawPayload,
    nowISO: string,
    options: ImportOptions,
    fieldMappings: FieldMapping[],
  ): Promise<ParseOutcome> {
    const migrated = migratePayload(payload);
    const settings = await settingsRepository.load();

    let transforms: NormalizeTransforms = { ...options };
    if (options.newStartDate && payload.tasks.length) {
      const earliest = payload.tasks
        .map((task) => task.date)
        .filter(Boolean)
        .sort()[0];
      if (earliest) {
        const [y1, m1, d1] = earliest.split('-').map(Number);
        const [y2, m2, d2] = options.newStartDate.split('-').map(Number);
        const delta = Math.round(
          (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
        );
        if (delta !== 0) transforms = { ...transforms, dateShiftDays: delta };
      }
    }

    const normalized = normalizeTasks(
      migrated.payload,
      {
        color: settings.accent,
        category: settings.categories[0]?.id ?? 'personal',
        icon: 'book',
        priority: 'normal',
        minutesBefore: settings.notifications.defaultMinutesBefore,
        categories: settings.categories.map((c) => c.id),
      },
      nowISO,
      transforms,
    );

    const existing = await taskRepository.list();
    const byId = new Map(existing.map((task) => [task.id, task]));
    const added: Task[] = [];
    const changed: { incoming: Task; existing: Task }[] = [];
    const unchanged: Task[] = [];
    const duplicates: DuplicateCandidate[] = [];

    const existingSignature = new Map<string, Task>();
    for (const task of existing) existingSignature.set(`${task.name}|${task.date}|${task.start}`, task);

    for (const task of normalized.tasks) {
      const current = byId.get(task.id);
      if (current) {
        if (tasksEqual(task, current)) unchanged.push(task);
        else changed.push({ incoming: task, existing: current });
        continue;
      }
      const signature = existingSignature.get(`${task.name}|${task.date}|${task.start}`);
      if (signature) {
        duplicates.push({ incoming: task, existing: signature, signal: 'name+date+start' });
        continue;
      }
      if (task.repeat.type !== 'none') {
        const similar = existing.find(
          (candidate) =>
            candidate.name === task.name &&
            candidate.start === task.start &&
            candidate.end === task.end &&
            JSON.stringify(candidate.repeat) === JSON.stringify(task.repeat),
        );
        if (similar) {
          duplicates.push({ incoming: task, existing: similar, signal: 'recurrence' });
          continue;
        }
      }
      added.push(task);
    }

    const conflicts = await this.detectConflicts(normalized.tasks, existing, nowISO);
    const timezoneMismatch =
      migrated.payload.timezone && migrated.payload.timezone !== settings.timezone
        ? { file: migrated.payload.timezone, app: settings.timezone }
        : null;

    const completions: CompletionRecord[] = (migrated.payload.completions ?? [])
      .filter((record) => Boolean(record.taskId) && Boolean(record.date))
      .map((record) => ({
        id: `${record.taskId}:${record.date}`,
        taskId: record.taskId,
        date: record.date,
        status: record.status,
        completedAt: record.completedAt ?? new Date().toISOString(),
        minutesSpent: record.minutesSpent,
        note: record.note,
      }));

    const habits: Habit[] = (migrated.payload.habits ?? []).map((habit) => ({
      id: habit.id ?? uid('habit'),
      name: sanitizeDisplayText(habit.name),
      icon: habit.icon ?? 'check',
      color: (COLOR_TOKENS.includes(habit.color as Settings['accent']) ? habit.color : 'emerald') as Habit['color'],
      cadence: habit.cadence ?? 'daily',
      days: (habit.days ?? ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']) as Weekday[],
      reminderTime: habit.reminderTime ?? null,
      createdAt: new Date().toISOString(),
    }));

    const categories: Category[] = (migrated.payload.categories ?? []).map((category) => ({
      id: category.id,
      name: sanitizeDisplayText(category.name),
      color: (COLOR_TOKENS.includes(category.color as Settings['accent']) ? category.color : 'blue') as Category['color'],
      icon: category.icon ?? 'star',
    }));

    const dates = normalized.tasks.map((task) => task.date).sort();
    const overrides = await this.buildDayOverrides(migrated.payload);

    const preview: ImportPreview = {
      valid: normalized.issues.every((issue) => issue.errors.length === 0),
      tooNew: migrated.tooNew,
      version: migrated.payload.version ?? CURRENT_SCHEMA_VERSION,
      migrationNotes: migrated.notes,
      added,
      changed,
      unchanged,
      conflicts,
      duplicates,
      invalid: normalized.issues.filter((issue) => issue.errors.length > 0 || issue.warnings.length > 0),
      duplicateIds: normalized.duplicateIds,
      completions,
      habits,
      categories,
      dayOverrides: overrides,
      totalIncoming: migrated.payload.tasks.length,
      fixedCount: normalized.tasks.filter((task) => task.fixedTime).length,
      recurringCount: normalized.tasks.filter((task) => task.repeat.type !== 'none').length,
      dateRange: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
      fileTimezone: migrated.payload.timezone ?? null,
      error: null,
    };

    return { preview, structuralIssues: [], error: null, fieldMappings, timezoneMismatch };
  }

  private async buildDayOverrides(payload: RawPayload): Promise<DayOverride[]> {
    const map = new Map<string, DayOverride>();
    const now = new Date().toISOString();

    for (const entry of payload.dailyOverrides ?? []) {
      const record =
        map.get(entry.date) ??
        ({
          date: entry.date,
          globalShiftMinutes: 0,
          taskShifts: {},
          actualWakeUpMinutes: null,
          plannedWakeUpMinutes: null,
          log: [],
          createdAt: now,
          updatedAt: now,
        } satisfies DayOverride);
      record.taskShifts[entry.taskId] = entry.timeShiftMinutes;
      record.globalShiftMinutes = 0;
      map.set(entry.date, record);
    }

    for (const entry of payload.dayOverrides ?? []) {
      const record =
        map.get(entry.date) ??
        ({
          date: entry.date,
          globalShiftMinutes: 0,
          taskShifts: {},
          actualWakeUpMinutes: null,
          plannedWakeUpMinutes: null,
          log: [],
          createdAt: now,
          updatedAt: now,
        } satisfies DayOverride);
      record.globalShiftMinutes = entry.offsetMinutes ?? 0;
      if (entry.actualWakeUpMinutes != null) record.actualWakeUpMinutes = entry.actualWakeUpMinutes;
      if (entry.plannedWakeUpMinutes !== undefined) record.plannedWakeUpMinutes = entry.plannedWakeUpMinutes;
      map.set(entry.date, record);
    }

    return Array.from(map.values());
  }

  /** Time collisions between incoming and existing definitions (sampled days). */
  private async detectConflicts(
    incoming: Task[],
    existing: Task[],
    nowISO: string,
  ): Promise<ImportPreview['conflicts']> {
    const conflicts: ImportPreview['conflicts'] = [];
    const ctx: OccurrenceContext = { nowDate: nowISO, nowMinutes: 0, completions: new Map() };
    const sampleDates = [nowISO, addDays(nowISO, 1), addDays(nowISO, 2), addDays(nowISO, 7), addDays(nowISO, 13)];

    const existingByDate = new Map<string, { task: Task; start: number; end: number }[]>();
    for (const date of sampleDates) {
      existingByDate.set(
        date,
        buildDayOccurrences(existing, date, ctx).map((occurrence) => ({
          task: occurrence.task,
          start: occurrence.startMinutes,
          end: occurrence.endMinutes,
        })),
      );
    }

    for (const incomingTask of incoming) {
      for (const date of sampleDates) {
        if (conflicts.some((c) => c.incoming.id === incomingTask.id && c.date === date)) continue;
        const occurrences = buildDayOccurrences([incomingTask], date, ctx).filter((o) => o.date === date);
        if (!occurrences.length) continue;
        const candidates = existingByDate.get(date) ?? [];
        for (const occurrence of occurrences) {
          const clash = candidates.find(
            (candidate) =>
              candidate.task.id !== incomingTask.id &&
              candidate.start < occurrence.endMinutes &&
              occurrence.startMinutes < candidate.end,
          );
          if (clash) {
            conflicts.push({ incoming: incomingTask, existing: clash.task, date });
            break;
          }
        }
      }
    }
    return conflicts.slice(0, 40);
  }

  /* --------------------------------- apply -------------------------------- */

  async apply(
    preview: ImportPreview,
    mode: ImportMode,
    selectedIds: Set<string>,
    options: ApplyOptions,
    source = 'unknown',
  ): Promise<ImportResult> {
    const warnings: string[] = [];
    let backupId: string | null = null;
    if (options.backupBefore) {
      backupId = (await this.createBackup(`قبل از import — ${new Date().toLocaleString('fa-IR')}`, 'auto')).id;
    }

    const mapCategory = (task: Task): Task => ({
      ...task,
      category: options.categoryMapping[task.category] ?? task.category,
    });

    const resolveIds = (tasks: Task[]): Task[] =>
      tasks.map((task) => {
        if (options.idResolution !== 'new-id') return task;
        return { ...task, id: `${task.id}-${uid('copy').split('-').slice(-2).join('')}` };
      });

    const selected = (list: Task[]) => list.filter((task) => selectedIds.has(task.id));
    let duplicatesIgnored = 0;
    const writable: Task[] = [];

    const changedSelected = selected(preview.changed.map((entry) => entry.incoming));
    const addedSelected = selected(preview.added);

    if (mode === 'addNew') {
      writable.push(...resolveIds(addedSelected.map(mapCategory)));
      duplicatesIgnored = preview.duplicates.length;
    } else if (mode === 'updateExisting') {
      writable.push(...changedSelected.map(mapCategory));
      duplicatesIgnored = preview.duplicates.length;
    } else {
      // merge / replace
      writable.push(...resolveIds(addedSelected.map(mapCategory)), ...changedSelected.map(mapCategory));
      duplicatesIgnored = 0;
    }

    let removed = 0;
    const db = getDb();

    try {
      await db.transaction('rw', db.tasks, db.completions, db.dayOverrides, async () => {
        if (mode === 'replace') {
          const existing = await taskRepository.list();
          const keep = new Set(writable.map((task) => task.id));
          removed = existing.filter((task) => !keep.has(task.id)).length;
          await taskRepository.replaceDefinitions(writable, options.keepHistory);
        } else {
          await taskRepository.putMany(writable);
        }

        if (options.importCategories && preview.categories.length) {
          const settings = await settingsRepository.load();
          const merged = [...settings.categories];
          for (const category of preview.categories) {
            if (!merged.some((item) => item.id === category.id)) merged.push(category);
          }
          await settingsRepository.save({ categories: merged });
        }

        if (options.importCompletions && preview.completions.length) {
          const validIds = new Set(writable.map((task) => task.id));
          const usable = preview.completions.filter((record) => validIds.has(record.taskId));
          if (usable.length !== preview.completions.length) {
            warnings.push('برخی رکوردهای تاریخچه به تسک‌های واردنشده اشاره می‌کردند و نادیده گرفته شدند.');
          }
          await completionRepository.bulkPut(usable);
        }

        if (options.importHabits && preview.habits.length) {
          await habitRepository.putMany(preview.habits);
        }

        if (options.importDayOverrides && preview.dayOverrides.length) {
          for (const override of preview.dayOverrides) await dayOverrideRepository.put(override);
        }
      });
    } catch (error) {
      if (backupId) await this.restoreBackup(backupId);
      throw new Error(
        `import ناقص ماند و به حالت قبل برگشت: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const result: ImportResult = {
      added: mode === 'updateExisting' ? 0 : addedSelected.length,
      updated: changedSelected.length,
      removed,
      duplicatesIgnored,
      warnings,
    };

    await this.recordHistory({
      at: new Date().toISOString(),
      source,
      mode,
      added: result.added,
      updated: result.updated,
      removed: result.removed,
      success: true,
      warnings: warnings.length + preview.invalid.length,
    });

    return result;
  }

  /* --------------------------------- export ------------------------------- */

  async export(options: ExportOptions = {}): Promise<string> {
    const [tasks, settings, completions, habits, dayOverrides] = await Promise.all([
      taskRepository.list(),
      settingsRepository.load(),
      options.includeCompletions === false ? Promise.resolve([]) : completionRepository.all(),
      options.includeHabits === false ? Promise.resolve([]) : habitRepository.list(),
      options.includeDayOverrides === false ? Promise.resolve([]) : dayOverrideRepository.list(),
    ]);

    let selected = tasks;
    if (options.taskIds?.length) {
      const wanted = new Set(options.taskIds);
      selected = selected.filter((task) => wanted.has(task.id));
    }
    if (options.categoryIds?.length) {
      const wanted = new Set(options.categoryIds);
      selected = selected.filter((task) => wanted.has(task.category));
    }
    if (options.rangeFrom) selected = selected.filter((task) => compareISO(task.date, options.rangeFrom!) >= 0);
    if (options.rangeTo) {
      selected = selected.filter((task) => (task.endDate ? compareISO(task.endDate, options.rangeTo!) <= 0 : compareISO(task.date, options.rangeTo!) <= 0));
    }

    const taskIdSet = new Set(selected.map((task) => task.id));
    const overrideMap = new Map(dayOverrides.map((override) => [override.date, override]));

    const serializedTasks = selected.map((task) => {
      const effective = options.effectiveForDate
        ? this.effectiveTimes(task, options.effectiveForDate, overrideMap.get(options.effectiveForDate))
        : null;
      return {
        id: task.id,
        name: task.name,
        date: task.date,
        endDate: task.endDate ?? undefined,
        start: effective ? effective.start : task.start,
        end: effective ? effective.end : task.end,
        repeat: {
          type: task.repeat.type,
          ...(task.repeat.days?.length ? { days: task.repeat.days } : {}),
          ...(task.repeat.every ? { every: task.repeat.every } : {}),
        },
        category: task.category,
        icon: task.icon,
        color: task.color,
        priority: task.priority,
        fixedTime: task.fixedTime ?? false,
        reminder: {
          enabled: task.reminder.enabled,
          minutesBefore: task.reminder.minutesBefore,
          atEnd: task.reminder.atEnd,
        },
        notes: task.notes ?? '',
        occurrenceLimit: task.occurrenceLimit ?? undefined,
        ...(task.meta ? { meta: task.meta } : {}),
      };
    });

    const payload: Record<string, unknown> = {
      version: CURRENT_SCHEMA_VERSION,
      kind: options.kind ?? 'schedule',
      app: 'planner',
      timezone: settings.timezone,
      exportedAt: new Date().toISOString(),
      tasks: serializedTasks,
    };

    if (options.includeCompletions !== false && completions.length) {
      payload.completions = completions
        .filter((record) => taskIdSet.has(record.taskId))
        .map((record) => ({
          taskId: record.taskId,
          date: record.date,
          status: record.status,
          completedAt: record.completedAt,
        }));
    }

    if (options.includeHabits !== false && habits.length) {
      payload.habits = habits.map((habit) => ({
        id: habit.id,
        name: habit.name,
        icon: habit.icon,
        color: habit.color,
        cadence: habit.cadence,
        days: habit.days,
        reminderTime: habit.reminderTime ?? undefined,
      }));
    }

    if (options.includeCategories !== false) {
      payload.categories = settings.categories.map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
      }));
    }

    if (options.includeDayOverrides !== false) {
      const overrides = dayOverrides.filter(
        (override) =>
          override.globalShiftMinutes !== 0 ||
          Object.keys(override.taskShifts ?? {}).length > 0 ||
          override.actualWakeUpMinutes != null,
      );
      payload.dayOverrides = overrides.map((override) => ({
        date: override.date,
        offsetMinutes: override.globalShiftMinutes,
        actualWakeUpMinutes: override.actualWakeUpMinutes ?? undefined,
        ...(options.includeShiftHistory ? { log: override.log } : {}),
      }));
      payload.dailyOverrides = overrides.flatMap((override) =>
        Object.entries(override.taskShifts ?? {}).map(([taskId, minutes]) => ({
          taskId,
          date: override.date,
          timeShiftMinutes: minutes,
        })),
      );
    }

    if (options.includeSettings) {
      payload.settings = {
        timezone: settings.timezone,
        calendar: settings.calendar,
        persianDigits: settings.persianDigits,
        hour12: settings.hour12,
        theme: settings.theme,
        accent: settings.accent,
        focus: settings.focus,
      };
    }

    return JSON.stringify(payload, null, 2);
  }

  private effectiveTimes(task: Task, dateISO: string, override?: DayOverride): { start: string; end: string } | null {
    if (!override || task.fixedTime) return null;
    const shift = (override.globalShiftMinutes ?? 0) + (override.taskShifts?.[task.id] ?? 0);
    if (!shift) return null;
    const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const wrap = (minutes: number) => `${String(Math.floor((((minutes % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String((((minutes % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;
    return { start: wrap(toMinutes(task.start) + shift), end: wrap(toMinutes(task.end) + shift) };
  }

  /* -------------------------- backups and history -------------------------- */

  async createBackup(label: string, kind: 'auto' | 'manual' = 'manual'): Promise<BackupRecord> {
    const [tasks, completions, habits, habitLogs, dayOverrides, settings] = await Promise.all([
      taskRepository.list(),
      completionRepository.all(),
      habitRepository.list(),
      habitRepository.allLogs(),
      dayOverrideRepository.list(),
      settingsRepository.load(),
    ]);
    const record: BackupRecord = {
      id: `${BACKUP_PREFIX}${Date.now()}`,
      createdAt: new Date().toISOString(),
      label: sanitizeDisplayText(label),
      taskCount: tasks.length,
      kind,
      payload: JSON.stringify({ tasks, completions, habits, habitLogs, dayOverrides, settings }),
    };
    await metaRepository.set(record.id, record);
    await this.pruneBackups();
    return record;
  }

  async listBackups(): Promise<BackupRecord[]> {
    const rows = await metaRepository.all();
    return rows
      .filter((row) => row.key.startsWith(BACKUP_PREFIX))
      .map((row) => row.value as unknown as BackupRecord)
      .filter((record) => record && typeof record === 'object' && 'payload' in record)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async restoreBackup(id: string): Promise<{ tasks: number }> {
    const row = await metaRepository.get(id);
    if (!row) throw new Error('این پشتیبان پیدا نشد.');
    const record = row.value as unknown as BackupRecord;
    const parsed = JSON.parse(record.payload) as {
      tasks: Task[];
      completions: CompletionRecord[];
      habits: Habit[];
      habitLogs: import('@/types').HabitLog[];
      dayOverrides: DayOverride[];
      settings: Settings;
    };
    const db = getDb();
    await db.transaction(
      'rw',
      [db.tasks, db.completions, db.habits, db.habitLogs, db.dayOverrides, db.settings],
      async () => {
        await taskRepository.replaceDefinitions(parsed.tasks ?? [], false);
        await db.completions.clear();
        if (parsed.completions?.length) await completionRepository.bulkPut(parsed.completions);
        await db.habits.clear();
        if (parsed.habits?.length) await habitRepository.putMany(parsed.habits);
        await db.habitLogs.clear();
        if (parsed.habitLogs?.length) await habitRepository.bulkPutLogs(parsed.habitLogs);
        await db.dayOverrides.clear();
        for (const override of parsed.dayOverrides ?? []) await dayOverrideRepository.put(override);
        if (parsed.settings) await settingsRepository.save(parsed.settings);
      },
    );
    return { tasks: parsed.tasks?.length ?? 0 };
  }

  private async pruneBackups(limit = 10) {
    const backups = await this.listBackups();
    const doomed = backups.slice(limit).map((record) => record.id);
    const db = getDb();
    if (doomed.length) await db.meta.bulkDelete(doomed);
  }

  async recordHistory(entry: ImportHistoryEntry) {
    const row = await metaRepository.get(HISTORY_KEY);
    const current = Array.isArray(row?.value) ? (row.value as ImportHistoryEntry[]) : [];
    const next = [entry, ...current].slice(0, 20);
    await metaRepository.set(HISTORY_KEY, next);
  }

  async getImportHistory(): Promise<ImportHistoryEntry[]> {
    const row = await metaRepository.get(HISTORY_KEY);
    return Array.isArray(row?.value) ? (row.value as ImportHistoryEntry[]) : [];
  }

  /** Used by the UI to warn about timezone differences without altering times. */
  describeTimezone(fileTimezone: string | null, appTimezone: string): string | null {
    if (!fileTimezone) return null;
    if (!isValidTimeZone(fileTimezone)) return `منطقه‌ی زمانی فایل («${fileTimezone}») نامعتبر است.`;
    if (fileTimezone === appTimezone) return null;
    return `فایل با منطقه زمانی ${fileTimezone} ساخته شده و برنامه روی ${appTimezone} است.`;
  }
}

export const importExportService = new ImportExportService();
