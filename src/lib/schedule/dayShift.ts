/**
 * Dynamic daily schedule shift ("late wake-up / flexible day") — pure logic,
 * no React and no database access, so it stays deterministic and testable.
 *
 * Core rules:
 *  - fixed-time tasks never move
 *  - the recurring task template is NEVER modified, only a DayOverride for one date
 *  - normal mode adds the exact offset to every eligible task (durations + gaps kept)
 *  - smart mode reflows movable tasks around fixed anchors
 */

import { minutesToTime, timeToMinutes } from '@/lib/date/iso';
import { buildDayOccurrences, type OccurrenceContext } from './occurrence';
import type { DayOverride, ShiftScope, Task, TaskOccurrence } from '@/types';

export interface ShiftOptions {
  mode: 'normal' | 'smart';
  scope: ShiftScope;
  selectedIds?: string[];
  nowMinutes: number;
  /** preview-only hint so the `upcoming` scope can keep a barely-past task */
  nowOffsetHint?: number;
}

export type SkipReason = 'fixed' | 'completed' | 'skipped-status' | 'past' | 'not-selected';

export interface ShiftPreviewRow {
  taskId: string;
  name: string;
  color: Task['color'];
  icon: string;
  fixedTime: boolean;
  originalStart: number;
  originalEnd: number;
  newStart: number;
  newEnd: number;
  /** minutes actually added by this preview (0 for untouched rows) */
  appliedMinutes: number;
  moved: boolean;
  eligible: boolean;
  skipReason?: SkipReason;
  conflicts: string[];
  severity: 'ok' | 'warning' | 'conflict';
}

export interface ShiftPreview {
  date: string;
  offsetMinutes: number;
  /** cumulative offset after this preview is applied */
  effectiveOffset: number;
  rows: ShiftPreviewRow[];
  counts: {
    total: number;
    moved: number;
    unchanged: number;
    fixed: number;
    skipped: number;
    conflicts: number;
    warnings: number;
  };
  messages: string[];
}

export const MAX_ABS_SHIFT_MINUTES = 720;
export const WARN_ABS_SHIFT_MINUTES = 240;

/** Effective per-task shift for a date, honouring fixed-time tasks. */
export function effectiveTaskShift(override: DayOverride | undefined, task: Task): number {
  if (!override || task.fixedTime) return 0;
  return (override.globalShiftMinutes ?? 0) + (override.taskShifts?.[task.id] ?? 0);
}

export function totalOverrideOffset(override: DayOverride | undefined): number {
  return override?.globalShiftMinutes ?? 0;
}

export function minutesLabel(minutes: number): string {
  return `${minutes > 0 ? '+' : minutes < 0 ? '−' : ''}${Math.abs(minutes)} دقیقه`;
}

/* ------------------------------- wake-up logic ----------------------------- */

export function calculateWakeUpDelay(plannedMinutes: number, actualMinutes: number): number {
  return actualMinutes - plannedMinutes;
}

/**
 * Planned wake-up detection: prefers a task that is explicitly about waking up,
 * then the earliest block of the day. Never mutates anything.
 */
export function findPlannedWakeUp(occurrences: TaskOccurrence[]): number | null {
  if (!occurrences.length) return null;
  const explicit = occurrences.find((occurrence) =>
    /بیدار|wake|صبح‌بیداری|wake\s?up/i.test(occurrence.task.name),
  );
  if (explicit) return explicit.startMinutes;
  const sunIcon = occurrences.find((occurrence) => occurrence.task.icon === 'sun');
  if (sunIcon) return sunIcon.startMinutes;
  return Math.min(...occurrences.map((occurrence) => occurrence.startMinutes));
}

/* -------------------------------- eligibility ------------------------------ */

export function isEligible(
  occurrence: TaskOccurrence,
  options: ShiftOptions,
  override: DayOverride | undefined,
): { eligible: boolean; reason?: SkipReason } {
  if (occurrence.task.fixedTime) return { eligible: false, reason: 'fixed' };
  if (occurrence.status === 'completed') return { eligible: false, reason: 'completed' };
  if (occurrence.status === 'skipped') return { eligible: false, reason: 'skipped-status' };
  if (options.scope === 'all') return { eligible: true };
  if (options.scope === 'incomplete') return { eligible: true };
  if (options.scope === 'upcoming') {
    // still eligible once the shift moves it into the future
    const shiftedEnd = occurrence.endMinutes + (options.nowOffsetHint ?? 0);
    if (occurrence.endMinutes <= options.nowMinutes && shiftedEnd <= options.nowMinutes) {
      return { eligible: false, reason: 'past' };
    }
    return { eligible: true };
  }
  if (options.scope === 'selected') {
    const selected = options.selectedIds ?? [];
    return selected.includes(occurrence.taskId)
      ? { eligible: true }
      : { eligible: false, reason: 'not-selected' };
  }
  void override;
  return { eligible: true };
}

/* ----------------------------- conflict detection -------------------------- */

export interface ScheduleConflict {
  taskId: string;
  otherTaskId: string;
  message: string;
}

export function detectScheduleConflicts(occurrences: TaskOccurrence[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const sorted = [...occurrences].sort((a, b) => a.startMinutes - b.startMinutes);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      if (b.startMinutes >= a.endMinutes) break;
      conflicts.push({
        taskId: a.taskId,
        otherTaskId: b.taskId,
        message: `«${a.task.name}» با «${b.task.name}» هم‌پوشانی دارد.`,
      });
    }
  }
  return conflicts;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/* --------------------------------- preview -------------------------------- */

/**
 * Computes what a shift *would* do. Pure: returns rows + messages, writes nothing.
 */
export function previewScheduleShift(
  tasks: Task[],
  dateISO: string,
  offsetMinutes: number,
  options: ShiftOptions,
  ctx: OccurrenceContext,
  override: DayOverride | undefined,
): ShiftPreview {
  const occurrences = buildDayOccurrences(tasks, dateISO, { ...ctx, dayOverrides: new Map() });
  const rows: ShiftPreviewRow[] = [];
  const messages: string[] = [];
  const absolute = Math.abs(offsetMinutes);

  if (!Number.isFinite(offsetMinutes) || !Number.isInteger(offsetMinutes)) {
    messages.push('مقدار جابه‌جایی باید یک عدد صحیح دقیقه باشد.');
  }
  if (absolute > MAX_ABS_SHIFT_MINUTES) {
    messages.push(
      `جابه‌جایی ${minutesLabel(offsetMinutes)} بسیار زیاد است (حداکثر ±${MAX_ABS_SHIFT_MINUTES} دقیقه).`,
    );
  } else if (absolute > WARN_ABS_SHIFT_MINUTES) {
    messages.push(
      `جابه‌جایی ${minutesLabel(offsetMinutes)} بزرگ است؛ ممکن است بخشی از برنامه به بعد از نیمه‌شب منتقل شود.`,
    );
  }

  // ---- decide eligibility
  const decisions = occurrences.map((occurrence) => ({
    occurrence,
    ...(isEligible(occurrence, options, override) as { eligible: boolean; reason?: SkipReason }),
  }));

  // ---- compute target times
  interface Planned extends ShiftPreviewRow {
    anchorsOnly: boolean;
  }
  const planned: Planned[] = [];
  const anchors: { start: number; end: number; name: string; fixed: boolean }[] = [];

  // Fixed-time blocks are immovable anchors and must be known BEFORE any
  // movable block is placed, otherwise reflow could land on top of them.
  for (const decision of decisions) {
    const { occurrence } = decision;
    if (occurrence.task.fixedTime !== true) continue;
    anchors.push({
      start: occurrence.startMinutes,
      end: occurrence.endMinutes,
      name: occurrence.task.name,
      fixed: true,
    });
  }

  for (const decision of decisions) {
    const { occurrence, eligible, reason } = decision;
    const baseStart = occurrence.startMinutes;
    const baseEnd = occurrence.endMinutes;
    const duration = occurrence.durationMinutes;
    const fixed = occurrence.task.fixedTime === true;

    if (!eligible || fixed) {
      const row: ShiftPreviewRow = {
        taskId: occurrence.taskId,
        name: occurrence.task.name,
        color: occurrence.task.color,
        icon: occurrence.task.icon,
        fixedTime: fixed,
        originalStart: baseStart,
        originalEnd: baseEnd,
        newStart: baseStart,
        newEnd: baseEnd,
        appliedMinutes: 0,
        moved: false,
        eligible: false,
        skipReason: fixed ? 'fixed' : reason,
        conflicts: [],
        severity: 'ok',
      };
      planned.push({ ...row, anchorsOnly: true });
      continue;
    }

    const desired = baseStart + offsetMinutes;
    let target = desired;
    if (options.mode === 'smart') {
      // greedily place after any interval it collides with (fixed anchors first)
      let guard = 0;
      let moved = true;
      while (moved && guard < 500) {
        moved = false;
        for (const anchor of [...anchors].sort((a, b) => a.start - b.start)) {
          if (overlaps({ start: target, end: target + duration }, anchor)) {
            target = anchor.end;
            moved = true;
          }
        }
        guard += 1;
      }
    }
    const row: ShiftPreviewRow = {
      taskId: occurrence.taskId,
      name: occurrence.task.name,
      color: occurrence.task.color,
      icon: occurrence.task.icon,
      fixedTime: false,
      originalStart: baseStart,
      originalEnd: baseEnd,
      newStart: target,
      newEnd: target + duration,
      appliedMinutes: target - baseStart,
      moved: target !== baseStart,
      eligible: true,
      conflicts: [],
      severity: 'ok',
    };
    if (options.mode === 'smart') anchors.push({ start: target, end: target + duration, name: occurrence.task.name, fixed: false });
    planned.push({ ...row, anchorsOnly: false });
  }

  // ---- conflict detection on the resulting timeline (normal mode keeps anchors)
  const placed = planned.map((row) => ({
    row,
    start: row.newStart,
    end: row.newEnd,
  }));
  const conflicts = detectScheduleConflicts(
    placed.map((item) => ({
      ...item.row,
      startMinutes: item.start,
      endMinutes: item.end,
      task: { ...item.row } as unknown as Task,
      id: item.row.taskId,
      date: dateISO,
      start: minutesToTime(item.start),
      end: minutesToTime(item.end),
      crossesMidnight: false,
      durationMinutes: item.end - item.start,
      status: 'scheduled' as const,
    })),
  );

  for (const conflict of conflicts) {
    const first = planned.find((row) => row.taskId === conflict.taskId);
    const second = planned.find((row) => row.taskId === conflict.otherTaskId);
    const fixedParty = first?.fixedTime ? first : second?.fixedTime ? second : null;
    const message = fixedParty
      ? `این جابه‌جایی باعث تداخل با «${fixedParty.name}» در ساعت ${minutesToTime(fixedParty.newStart)} می‌شود.`
      : conflict.message;
    if (first) {
      first.conflicts.push(message);
      first.severity = 'conflict';
    }
    if (second && second !== first) {
      second.conflicts.push(message);
      second.severity = 'conflict';
    }
    if (!messages.includes(message)) messages.push(message);
  }

  for (const row of planned) {
    if (row.newEnd > 1440) {
      const message = `«${row.name}» تا پس از نیمه‌شب (${minutesToTime(row.newEnd % 1440)}) ادامه می‌یابد.`;
      row.conflicts.push(message);
      row.severity = row.severity === 'conflict' ? 'conflict' : 'warning';
      if (!messages.includes(message)) messages.push(message);
    } else if (row.newStart < 0) {
      const message = `«${row.name}» به قبل از نیمه‌شب می‌رود.`;
      row.conflicts.push(message);
      row.severity = 'warning';
      if (!messages.includes(message)) messages.push(message);
    }
  }

  const counts = {
    total: planned.length,
    moved: planned.filter((row) => row.moved).length,
    unchanged: planned.filter((row) => !row.moved).length,
    fixed: planned.filter((row) => row.fixedTime).length,
    skipped: planned.filter((row) => !row.eligible && !row.fixedTime).length,
    conflicts: planned.filter((row) => row.severity === 'conflict').length,
    warnings: planned.filter((row) => row.severity === 'warning').length,
  };

  return {
    date: dateISO,
    offsetMinutes,
    effectiveOffset: totalOverrideOffset(override) + offsetMinutes,
    rows: planned.map(({ anchorsOnly: _anchorsOnly, ...row }) => row),
    counts,
    messages,
  };
}

/* ---------------------------------- apply ---------------------------------- */

/**
 * Produces the next override state for a date. Pure — persistence happens in the
 * repository inside a transaction.
 */
export function applyScheduleShift(
  override: DayOverride,
  preview: ShiftPreview,
  options: ShiftOptions,
  note?: string,
): DayOverride {
  const taskShifts: Record<string, number> = { ...override.taskShifts };
  let globalShiftMinutes = override.globalShiftMinutes;

  const uniform =
    preview.rows.filter((row) => row.eligible).length > 0 &&
    preview.rows
      .filter((row) => row.eligible)
      .every((row) => row.appliedMinutes === preview.rows.find((r) => r.eligible)?.appliedMinutes);

  if (uniform && options.mode === 'normal') {
    // every eligible task moved by the same amount -> keep it as one global offset
    const amount = preview.rows.find((row) => row.eligible)?.appliedMinutes ?? 0;
    globalShiftMinutes += amount;
    for (const key of Object.keys(taskShifts)) delete taskShifts[key];
  } else {
    for (const row of preview.rows) {
      if (!row.eligible) continue;
      const previous = effectiveTaskShift(override, { id: row.taskId } as Task);
      const next = previous + row.appliedMinutes;
      const globalPart = override.globalShiftMinutes;
      const delta = next - globalPart;
      if (delta === 0) delete taskShifts[row.taskId];
      else taskShifts[row.taskId] = delta;
    }
  }

  return {
    ...override,
    globalShiftMinutes,
    taskShifts,
    log: [
      ...override.log,
      {
        at: new Date().toISOString(),
        appliedMinutes: preview.offsetMinutes,
        totalAfter: globalShiftMinutes,
        mode: options.mode,
        scope: options.scope,
        note,
        snapshot: { globalShiftMinutes: override.globalShiftMinutes, taskShifts: { ...override.taskShifts } },
      },
    ],
  };
}

/**
 * Restores the state recorded before the most recent shift.
 * Snapshots make undo exact, even after several stacked operations.
 */
export function undoScheduleShift(override: DayOverride): {
  next: DayOverride | null;
  undone: ShiftLogEntryLike | null;
} {
  const log = [...override.log];
  const last = log[log.length - 1];
  if (!last) return { next: null, undone: null };
  log.pop();
  const snapshot = last.snapshot ?? { globalShiftMinutes: 0, taskShifts: {} };
  const next: DayOverride = {
    ...override,
    globalShiftMinutes: snapshot.globalShiftMinutes,
    taskShifts: { ...snapshot.taskShifts },
    log,
  };
  return { next, undone: last };
}

export type ShiftLogEntryLike = {
  at: string;
  appliedMinutes: number;
  totalAfter: number;
  mode: 'normal' | 'smart' | 'wakeup' | 'reset' | 'undo';
  scope: ShiftScope;
  note?: string;
  snapshot?: { globalShiftMinutes: number; taskShifts: Record<string, number> };
};

/** Removes every override for the day (completion history is untouched). */
export function resetDailySchedule(override: DayOverride): DayOverride {
  return {
    ...override,
    globalShiftMinutes: 0,
    taskShifts: {},
    log: [
      ...override.log,
      {
        at: new Date().toISOString(),
        appliedMinutes: 0,
        totalAfter: 0,
        mode: 'reset',
        scope: 'all',
        note: 'بازگردانی برنامه امروز',
      },
    ],
  };
}

export function minutesToTimeSafe(minutes: number): string {
  return minutesToTime(minutes);
}

export function timeToMinutesSafe(value: string): number {
  return timeToMinutes(value);
}
