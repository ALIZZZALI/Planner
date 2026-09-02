/**
 * JSON import schema — version 2 (backward compatible with version 1).
 *
 * v2 additions:
 *   - `tasks[].fixedTime` (movable vs fixed-time)
 *   - `dailyOverrides[]` (per-day shift state)
 *   - `categories[]`, `settings`, `kind` (full backup packages)
 *   - tolerant field aliases (`title`, `from`, `startTime`, `fixed`, `until`, …)
 *
 * Everything is strict after alias normalisation: unknown keys and invalid enum
 * values are rejected so nothing is imported by accident.
 */

import { z } from 'zod';
import { isISODate, isTimeString, compareISO } from '@/lib/date/iso';
import type { Task } from '@/types';

export const CURRENT_SCHEMA_VERSION = 2;

export const RECURRENCE_TYPES = [
  'none',
  'daily',
  'weekly',
  'weekdays',
  'weekends',
  'even',
  'odd',
  'interval',
  'monthly',
] as const;

export const weekdaySchema = z.enum(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']);

export const repeatSchema = z
  .object({
    type: z.enum(RECURRENCE_TYPES),
    days: z.array(weekdaySchema).optional(),
    every: z.number().int().positive().max(365).optional(),
    /** accepted alias of the top-level endDate */
    until: z.string().optional(),
  })
  .strict();

export const reminderSchema = z
  .object({
    enabled: z.boolean().optional(),
    minutesBefore: z.number().int().min(0).max(1440).optional(),
    atEnd: z.boolean().optional(),
    sound: z.boolean().optional(),
    vibrate: z.boolean().optional(),
  })
  .strict();

export const prioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export const taskInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1, { message: 'نام تسک الزامی است' }),
    date: z.string({ message: 'تاریخ شروع الزامی است' }),
    endDate: z.string().nullable().optional(),
    start: z.string({ message: 'زمان شروع الزامی است' }),
    end: z.string({ message: 'زمان پایان الزامی است' }),
    repeat: repeatSchema.optional(),
    category: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    priority: prioritySchema.optional(),
    reminder: reminderSchema.optional(),
    notes: z.string().optional(),
    completed: z.boolean().optional(),
    fixedTime: z.boolean().optional(),
    occurrenceLimit: z.number().int().positive().max(9999).nullable().optional(),
    meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  })
  .strict();

export const completionInputSchema = z
  .object({
    taskId: z.string(),
    date: z.string(),
    status: z.enum(['completed', 'skipped']),
    completedAt: z.string().optional(),
    minutesSpent: z.number().optional(),
    note: z.string().optional(),
  })
  .strict();

export const habitInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    icon: z.string().optional(),
    color: z.string().optional(),
    cadence: z.enum(['daily', 'weekdays', 'weekends', 'custom']).optional(),
    days: z.array(weekdaySchema).optional(),
    reminderTime: z.string().nullable().optional(),
  })
  .strict();

export const categoryInputSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    icon: z.string().optional(),
    color: z.string().optional(),
  })
  .strict();

export const taskOverrideInputSchema = z
  .object({
    taskId: z.string(),
    date: z.string(),
    timeShiftMinutes: z.number().int().min(-720).max(720),
  })
  .strict();

export const dayOverrideInputSchema = z
  .object({
    date: z.string(),
    offsetMinutes: z.number().int().min(-720).max(720).optional(),
    actualWakeUpMinutes: z.number().int().min(0).max(1439).optional(),
    plannedWakeUpMinutes: z.number().int().min(0).max(1439).nullable().optional(),
  })
  .strict();

export const schedulePayloadSchema = z
  .object({
    version: z.number().optional(),
    kind: z.enum(['schedule', 'backup']).optional(),
    app: z.string().optional(),
    timezone: z.string().optional(),
    exportedAt: z.string().optional(),
    tasks: z.array(taskInputSchema),
    completions: z.array(completionInputSchema).optional(),
    habits: z.array(habitInputSchema).optional(),
    categories: z.array(categoryInputSchema).optional(),
    dailyOverrides: z.array(taskOverrideInputSchema).optional(),
    dayOverrides: z.array(dayOverrideInputSchema).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type RawTaskInput = z.infer<typeof taskInputSchema>;
export type RawPayload = z.infer<typeof schedulePayloadSchema>;

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  payload?: RawPayload;
  issues: ValidationIssue[];
}

export interface FieldMapping {
  from: string;
  to: string;
  count: number;
}

export interface NormalizedPayload {
  payload: unknown;
  mappings: FieldMapping[];
  droppedKeys: string[];
}

/* ------------------------------ alias mapping ------------------------------ */

const TASK_FIELD_ALIASES: Record<string, string> = {
  title: 'name',
  task: 'name',
  taskName: 'name',
  label: 'name',
  subject: 'name',
  from: 'start',
  startTime: 'start',
  begins: 'start',
  begin: 'start',
  to: 'end',
  endTime: 'end',
  finish: 'end',
  finishes: 'end',
  fixed: 'fixedTime',
  isFixed: 'fixedTime',
  pinned: 'fixedTime',
  fixedtime: 'fixedTime',
  description: 'notes',
  note: 'notes',
  recurrence: 'repeat',
  startDate: 'date',
  day: 'date',
  until: 'endDate',
  repeatUntil: 'endDate',
  colour: 'color',
  tag: 'category',
};

/**
 * Normalises non-standard field names before validation. Unknown keys are NOT
 * silently dropped here — they still fail validation afterwards.
 */
export function normalizePayloadFields(raw: unknown): NormalizedPayload {
  const mappingCounts = new Map<string, number>();
  const addMapping = (from: string, to: string) => {
    const key = `${from}->${to}`;
    mappingCounts.set(key, (mappingCounts.get(key) ?? 0) + 1);
  };

  if (typeof raw !== 'object' || raw === null) return { payload: raw, mappings: [], droppedKeys: [] };
  const source = raw as Record<string, unknown>;

  const tasks = Array.isArray(source.tasks) ? source.tasks : null;
  const mappedTasks = tasks
    ? tasks.map((entry) => {
        if (typeof entry !== 'object' || entry === null) return entry;
        const task = { ...(entry as Record<string, unknown>) };
        for (const [alias, canonical] of Object.entries(TASK_FIELD_ALIASES)) {
          if (alias in task && !(canonical in task)) {
            task[canonical] = task[alias];
            delete task[alias];
            addMapping(alias, canonical);
          }
        }
        // nested repeat.until -> endDate
        if (task.repeat && typeof task.repeat === 'object' && !Array.isArray(task.repeat)) {
          const repeat = task.repeat as Record<string, unknown>;
          if ('until' in repeat && !('endDate' in task)) {
            task.endDate = repeat.until;
            delete repeat.until;
            addMapping('repeat.until', 'endDate');
          }
          if ('weekdays' in repeat && !('days' in repeat) && Array.isArray(repeat.weekdays)) {
            repeat.days = repeat.weekdays;
            delete repeat.weekdays;
            addMapping('repeat.weekdays', 'repeat.days');
          }
        }
        return task;
      })
    : null;

  const payload = { ...source };
  if (mappedTasks) payload.tasks = mappedTasks;

  const mappings: FieldMapping[] = Array.from(mappingCounts.entries()).map(([key, count]) => {
    const [from, to] = key.split('->');
    return { from, to, count };
  });

  return { payload, mappings, droppedKeys: [] };
}

/** Parse + structural validation. Never throws. */
export function validateScheduleText(text: string): ValidationResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, issues: [{ path: 'root', message: 'متن JSON خالی است.' }] };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, issues: [{ path: 'root', message: `ساختار JSON نامعتبر است: ${message}` }] };
  }
  return validateScheduleObject(normalizePayloadFields(raw).payload);
}

export function validateScheduleObject(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ path: 'root', message: 'ریشه‌ی فایل باید یک شیء JSON با فیلد tasks باشد.' }],
    };
  }
  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.tasks)) {
    return {
      ok: false,
      issues: [{ path: 'tasks', message: 'فیلد tasks باید یک آرایه باشد.' }],
    };
  }
  const parsed = schedulePayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'root',
      message: translateZodMessage(issue.message, issue.path.join('.')),
    }));
    return { ok: false, issues };
  }
  return { ok: true, payload: parsed.data, issues: [] };
}

function translateZodMessage(message: string, path: string): string {
  if (message.includes('Unrecognized key')) {
    const key = message.match(/'([^']+)'/)?.[1] ?? '';
    return `کلید ناشناخته «${key}» در مسیر ${path}`;
  }
  if (message.includes('Invalid enum value')) {
    const value = message.match(/'([^']+)'/)?.[1] ?? '';
    return `مقدار «${value}» در مسیر ${path} مجاز نیست`;
  }
  if (message.includes('Required')) return `فیلد ${path} الزامی است`;
  return `${path}: ${message}`;
}

/* -------------------------------- migrations ------------------------------- */

type Migration = (payload: RawPayload) => { payload: RawPayload; notes: string[] };

const MIGRATIONS: Record<number, Migration> = {
  // v1 -> v2: nothing destructive; only defaults for the new fields.
  1: (payload) => ({
    payload: {
      ...payload,
      tasks: payload.tasks.map((task) => ({ ...task, fixedTime: task.fixedTime ?? false })),
    },
    notes: ['فایل نسخه ۱ خوانده شد؛ فیلد زمان ثابت با مقدار پیش‌فرض «قابل جابه‌جایی» اضافه شد.'],
  }),
  2: (payload) => ({ payload, notes: [] }),
};

export interface MigrationOutcome {
  payload: RawPayload;
  notes: string[];
  tooNew: boolean;
}

export function migratePayload(payload: RawPayload): MigrationOutcome {
  const fileVersion = typeof payload.version === 'number' ? payload.version : 1;
  if (fileVersion > CURRENT_SCHEMA_VERSION) {
    return {
      payload: { ...payload, version: CURRENT_SCHEMA_VERSION },
      notes: [
        `این فایل با نسخه ${fileVersion} ساخته شده و نسخه‌ی برنامه ${CURRENT_SCHEMA_VERSION} است؛ ممکن است ناسازگار باشد.`,
      ],
      tooNew: true,
    };
  }

  let current = payload;
  const notes: string[] = [];
  let version = fileVersion;
  while (version <= CURRENT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (migrate) {
      const result = migrate(current);
      current = result.payload;
      notes.push(...result.notes);
    }
    if (version === CURRENT_SCHEMA_VERSION) break;
    version += 1;
  }
  return { payload: { ...current, version: CURRENT_SCHEMA_VERSION }, notes, tooNew: false };
}

/* ------------------------------ normalization ------------------------------ */

export interface RecordIssue {
  id: string;
  name: string;
  errors: string[];
  warnings: string[];
}

export interface NormalizeResult {
  tasks: Task[];
  issues: RecordIssue[];
  duplicateIds: string[];
}

export interface NormalizeDefaults {
  color: Task['color'];
  category: string;
  icon: string;
  priority: Task['priority'];
  minutesBefore: number;
  categories: string[];
}

const VALID_COLORS = new Set([
  'blue', 'indigo', 'violet', 'cyan', 'teal', 'emerald', 'lime', 'amber',
  'orange', 'red', 'rose', 'pink', 'slate',
]);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'critical']);
const KNOWN_ICONS = new Set([
  'book', 'pencil', 'presentation', 'calculator', 'atom', 'flask', 'dna', 'code', 'cpu', 'image',
  'message', 'youtube', 'gamepad', 'dumbbell', 'heart', 'moon', 'sun', 'coffee', 'clock', 'check',
  'user', 'brain', 'globe', 'music', 'camera', 'target', 'star', 'sparkles', 'zap', 'briefcase',
  'graduation', 'laptop', 'phone', 'bus', 'car', 'food', 'water', 'study',
]);

export interface NormalizeTransforms {
  dateShiftDays?: number;
  timeShiftMinutes?: number;
  rangeFrom?: string;
  rangeTo?: string;
  categoryFilter?: string[];
}

/** Semantic validation + defaults + optional date/time transforms. */
export function normalizeTasks(
  payload: RawPayload,
  defaults: NormalizeDefaults,
  nowISO: string,
  transforms: NormalizeTransforms = {},
): NormalizeResult {
  const tasks: Task[] = [];
  const issues: RecordIssue[] = [];
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const timestamp = new Date().toISOString();

  const shiftDays = transforms.dateShiftDays ?? 0;
  const timeShift = transforms.timeShiftMinutes ?? 0;

  payload.tasks.forEach((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const label = raw.name || raw.id || `تسک ${index + 1}`;

    if (!isISODate(raw.date)) {
      errors.push(`تاریخ شروع «${raw.date}» معتبر نیست (قالب درست: YYYY-MM-DD).`);
    }
    if (raw.endDate != null && !isISODate(raw.endDate)) {
      errors.push(`تاریخ پایان «${raw.endDate}» معتبر نیست.`);
    }
    if (raw.endDate != null && isISODate(raw.date) && isISODate(raw.endDate)) {
      if (compareISO(raw.endDate, raw.date) < 0) errors.push('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.');
    }
    if (!isTimeString(raw.start)) errors.push(`زمان شروع «${raw.start}» معتبر نیست (قالب درست: HH:MM).`);
    if (!isTimeString(raw.end)) errors.push(`زمان پایان «${raw.end}» معتبر نیست (قالب درست: HH:MM).`);
    if (raw.repeat?.type === 'weekly' && raw.repeat.days && raw.repeat.days.length === 0) {
      errors.push('برای تکرار هفتگی حداقل یک روز باید انتخاب شود.');
    }
    if (raw.repeat?.type === 'weekly' && !raw.repeat.days?.length) {
      warnings.push('تکرار هفتگی بدون روز مشخص؛ شنبه تا پنجشنبه اعمال شد.');
    }

    const id = raw.id?.trim() || `import-${slug(raw.name)}-${nowISO}-${index}`;
    if (seen.has(id)) {
      duplicateIds.push(id);
      errors.push(`شناسه‌ی تکراری: «${id}» در فایل بیش از یک بار آمده است.`);
    }
    seen.add(id);

    if (raw.color && !VALID_COLORS.has(raw.color)) warnings.push(`رنگ «${raw.color}» شناخته نشد؛ رنگ پیش‌فرض اعمال شد.`);
    if (raw.priority && !VALID_PRIORITIES.has(raw.priority)) warnings.push(`اولویت «${raw.priority}» شناخته نشد؛ «معمولی» اعمال شد.`);
    if (raw.icon && !KNOWN_ICONS.has(raw.icon)) warnings.push(`آیکون «${raw.icon}» شناخته نشد؛ آیکون پیش‌فرض اعمال شد.`);
    if (raw.category && defaults.categories.length && !defaults.categories.includes(raw.category)) {
      warnings.push(`دسته‌بندی «${raw.category}» در برنامه موجود نیست؛ باید ساخته یا نگاشت شود.`);
    }
    if (timeShift !== 0) warnings.push(`زمان‌ها ${timeShift > 0 ? '+' : ''}${timeShift} دقیقه جابه‌جا می‌شوند.`);
    if (shiftDays !== 0) warnings.push(`تاریخ‌ها ${shiftDays > 0 ? '+' : ''}${shiftDays} روز جابه‌جا می‌شوند.`);

    if (transforms.rangeFrom && isISODate(raw.date) && compareISO(raw.date, transforms.rangeFrom) < 0) {
      errors.push(`خارج از بازه‌ی انتخابی import (قبل از ${transforms.rangeFrom}).`);
    }
    if (transforms.rangeTo && isISODate(raw.date) && compareISO(raw.date, transforms.rangeTo) > 0) {
      errors.push(`خارج از بازه‌ی انتخابی import (بعد از ${transforms.rangeTo}).`);
    }
    if (transforms.categoryFilter?.length && !transforms.categoryFilter.includes(raw.category ?? defaults.category)) {
      errors.push('دسته‌بندی این تسک در فیلتر انتخابی import نیست.');
    }

    if (errors.length) {
      issues.push({ id, name: label, errors, warnings });
      return;
    }
    if (warnings.length) {
      // warnings never block the record, but the user must still see them
      issues.push({ id, name: label, errors: [], warnings });
    }

    tasks.push({
      id,
      name: raw.name.trim(),
      date: shiftDays ? addDaysISO(raw.date, shiftDays) : raw.date,
      endDate:
        raw.endDate != null && shiftDays ? addDaysISO(raw.endDate as string, shiftDays) : (raw.endDate ?? null),
      start: timeShift ? shiftTime(raw.start, timeShift) : raw.start,
      end: timeShift ? shiftTime(raw.end, timeShift) : raw.end,
      repeat: {
        type: raw.repeat?.type ?? 'none',
        days: raw.repeat?.days?.length ? raw.repeat?.days : undefined,
        every: raw.repeat?.every,
      },
      category: raw.category ?? defaults.category,
      icon: raw.icon && KNOWN_ICONS.has(raw.icon) ? raw.icon : defaults.icon,
      color: (VALID_COLORS.has(raw.color ?? '') ? raw.color : defaults.color) as Task['color'],
      priority: (VALID_PRIORITIES.has(raw.priority ?? '') ? raw.priority : defaults.priority) as Task['priority'],
      reminder: {
        enabled: raw.reminder?.enabled ?? false,
        minutesBefore: raw.reminder?.minutesBefore ?? defaults.minutesBefore,
        atEnd: raw.reminder?.atEnd ?? false,
        sound: raw.reminder?.sound ?? true,
        vibrate: raw.reminder?.vibrate ?? true,
      },
      notes: raw.notes ?? '',
      occurrenceLimit: raw.occurrenceLimit ?? null,
      fixedTime: raw.fixedTime ?? false,
      meta: raw.meta,
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  return { tasks, issues, duplicateIds: Array.from(new Set(duplicateIds)) };
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function shiftTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function slug(input: string): string {
  return (
    input
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}-]/gu, '')
      .slice(0, 24) || 'task'
  );
}

/** JSON texts are treated as data only: strip control characters for display. */
export function sanitizeDisplayText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 4000);
}
