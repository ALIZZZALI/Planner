/**
 * Recurrence engine — pure functions, zero React/DB dependencies.
 *
 * A `Task` owns a `RecurrenceRule` plus a start date (and optional end date /
 * occurrence limit). This module answers:
 *   - does the task occur on a given date?
 *   - which dates does it occupy inside a range?
 */

import {
  addDays,
  addMonths,
  compareISO,
  daysBetween,
  isoToGregorian,
  startOfWeek,
  weekdayOfISO,
  daysInGregorianMonth,
} from '@/lib/date/iso';
import { WORKDAYS, type RecurrenceRule, type Task, type Weekday } from '@/types';

export const MAX_OCCURRENCES = 3000;

export interface OccurrenceCheck {
  occurs: boolean;
  /** zero-based occurrence index counted from the task start date */
  index: number;
  /** human readable reason (used by tests + debugging) */
  reason?: string;
}

/** Internal helper: number of whole weeks between two Saturday-based week starts. */
function weeksBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (weekStartMs(toISO) - weekStartMs(fromISO)) / (7 * 86400000),
  );
}

function weekStartMs(iso: string): number {
  const start = startOfWeek(iso, 'sat');
  const { y, m, d } = isoToGregorian(start);
  return Date.UTC(y, m - 1, d);
}

function everyNDays(rule: RecurrenceRule): number {
  const value = rule.every ?? 1;
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

/**
 * Core predicate: does `task` occur on `dateISO`?
 * `__anchor` is not part of the public rule; weekly `every` uses the task start
 * date implicitly, so the task itself is passed in `occursOnDate`.
 */
export function occursOnDate(task: Task, dateISO: string): OccurrenceCheck {
  const rule = task.repeat ?? { type: 'none' as const };
  const start = task.date;

  if (compareISO(dateISO, start) < 0) {
    return { occurs: false, index: -1, reason: 'before-start' };
  }
  if (task.endDate && compareISO(dateISO, task.endDate) > 0) {
    return { occurs: false, index: -1, reason: 'after-end' };
  }

  const diff = daysBetween(start, dateISO);
  const weekday = weekdayOfISO(dateISO);

  let occurs = false;

  switch (rule.type) {
    case 'none':
      occurs = diff === 0;
      break;
    case 'daily':
      occurs = diff % everyNDays(rule) === 0;
      break;
    case 'interval':
      occurs = diff % everyNDays(rule) === 0;
      break;
    case 'weekdays':
      occurs = WORKDAYS.includes(weekday);
      break;
    case 'weekends':
      occurs = weekday === 'fri';
      break;
    case 'even':
      occurs = isoToGregorian(dateISO).d % 2 === 0;
      break;
    case 'odd':
      occurs = isoToGregorian(dateISO).d % 2 === 1;
      break;
    case 'weekly': {
      const days = rule.days?.length ? rule.days : WORKDAYS;
      if (!days.includes(weekday)) {
        return { occurs: false, index: -1, reason: 'weekday-mismatch' };
      }
      const every = everyNDays(rule);
      if (every > 1) {
        const weeks = weeksBetween(start, dateISO);
        if (weeks % every !== 0) {
          return { occurs: false, index: -1, reason: 'week-interval' };
        }
      }
      occurs = true;
      break;
    }
    case 'dates': {
      const list = rule.dates ?? [];
      if (!list.includes(dateISO)) {
        return { occurs: false, index: -1, reason: 'date-not-selected' };
      }
      occurs = true;
      break;
    }
    case 'monthly': {
      const day = isoToGregorian(dateISO).d;
      const anchorDay = isoToGregorian(start).d;
      if (day !== anchorDay) {
        // allow the last day of short months to carry the schedule forward
        const isLastDay =
          day === daysInGregorianMonth(isoToGregorian(dateISO).y, isoToGregorian(dateISO).m);
        const anchorFits =
          anchorDay <= daysInGregorianMonth(isoToGregorian(dateISO).y, isoToGregorian(dateISO).m);
        if (!(isLastDay && !anchorFits)) {
          return { occurs: false, index: -1, reason: 'day-of-month-mismatch' };
        }
      }
      const months = monthDiff(start, dateISO);
      occurs = months % everyNDays(rule) === 0;
      break;
    }
    default:
      occurs = false;
  }

  if (!occurs) return { occurs: false, index: -1, reason: 'rule-mismatch' };

  const index = countOccurrencesUpTo(task, dateISO);
  const limit = task.occurrenceLimit ?? null;
  if (limit != null && index >= limit) {
    return { occurs: false, index, reason: 'occurrence-limit' };
  }
  return { occurs: true, index };
}

function monthDiff(fromISO: string, toISO: string): number {
  const a = isoToGregorian(fromISO);
  const b = isoToGregorian(toISO);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/**
 * Count occurrences from the start date up to (and including) `dateISO`.
 * Only used when a limit matters, or for stats; iterates forward with a hard cap.
 */
export function countOccurrencesUpTo(task: Task, dateISO: string): number {
  const start = task.date;
  if (compareISO(dateISO, start) < 0) return -1;
  const hardEnd = task.endDate && compareISO(task.endDate, dateISO) < 0 ? task.endDate : dateISO;
  const limit = task.occurrenceLimit ?? MAX_OCCURRENCES;
  let cursor = start;
  let count = 0;
  let guard = 0;
  while (compareISO(cursor, hardEnd) <= 0 && count < limit && guard < 40000) {
    if (rawMatches(task, cursor)) count += 1;
    if (compareISO(cursor, dateISO) === 0) return count - 1;
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return count;
}

/** Raw rule matching (no range/limit checks). */
function rawMatches(task: Task, iso: string): boolean {
  const rule = task.repeat ?? { type: 'none' as const };
  const diff = daysBetween(task.date, iso);
  const weekday = weekdayOfISO(iso);
  switch (rule.type) {
    case 'none':
      return diff === 0;
    case 'daily':
    case 'interval':
      return diff % everyNDays(rule) === 0;
    case 'weekdays':
      return WORKDAYS.includes(weekday);
    case 'weekends':
      return weekday === 'fri';
    case 'even':
      return isoToGregorian(iso).d % 2 === 0;
    case 'odd':
      return isoToGregorian(iso).d % 2 === 1;
    case 'weekly': {
      const days = rule.days?.length ? rule.days : WORKDAYS;
      if (!days.includes(weekday)) return false;
      const every = everyNDays(rule);
      if (every > 1 && weeksBetween(task.date, iso) % every !== 0) return false;
      return true;
    }
    case 'dates': {
      return (rule.dates ?? []).includes(iso);
    }
    case 'monthly': {
      const months = monthDiff(task.date, iso);
      if (months % everyNDays(rule) !== 0) return false;
      const day = isoToGregorian(iso).d;
      const anchorDay = isoToGregorian(task.date).d;
      if (day === anchorDay) return true;
      const isLastDay =
        day === daysInGregorianMonth(isoToGregorian(iso).y, isoToGregorian(iso).m);
      return isLastDay && anchorDay > day;
    }
    default:
      return false;
  }
}

/** All dates (ascending) inside `[fromISO, toISO]` where the task occurs. */
export function expandTask(task: Task, fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  if (compareISO(toISO, fromISO) < 0) return out;
  const effectiveStart = compareISO(task.date, fromISO) < 0 ? fromISO : task.date;
  const effectiveEnd =
    task.endDate && compareISO(task.endDate, toISO) < 0 ? task.endDate : toISO;
  if (compareISO(effectiveEnd, effectiveStart) < 0) return out;

  let cursor = effectiveStart;
  let guard = 0;
  const remaining = task.occurrenceLimit ?? null;
  let seen = 0;
  while (compareISO(cursor, effectiveEnd) <= 0 && out.length < MAX_OCCURRENCES && guard < 40000) {
    if (rawMatches(task, cursor)) {
      if (remaining == null || seen < remaining) {
        out.push(cursor);
      }
      seen += 1;
    }
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

/** First occurrence on or after `fromISO` (for "next occurrence" queries). */
export function nextOccurrenceDate(task: Task, fromISO: string, horizonDays = 120): string | null {
  const limit = task.endDate ?? addDays(fromISO, horizonDays);
  const end = compareISO(limit, addDays(fromISO, horizonDays)) < 0 ? limit : addDays(fromISO, horizonDays);
  const dates = expandTask(task, fromISO, end);
  return dates[0] ?? null;
}

/** Human readable description of a rule (Persian). */
export function describeRecurrence(rule: RecurrenceRule, weekdayLabel: (w: Weekday) => string): string {
  const every = rule.every && rule.every > 1 ? rule.every : 1;
  switch (rule.type) {
    case 'none':
      return 'یک‌بار';
    case 'daily':
      return every === 1 ? 'هر روز' : `هر ${every} روز`;
    case 'interval':
      return `هر ${every} روز`;
    case 'weekdays':
      return 'شنبه تا پنجشنبه';
    case 'weekends':
      return 'فقط جمعه‌ها';
    case 'weekly': {
      const days = rule.days ?? [];
      if (every > 1) return `هر ${every} هفته`;
      if (!days.length) return 'هر هفته';
      return days.map(weekdayLabel).join('، ');
    }
    case 'even':
      return 'روزهای زوج ماه';
    case 'odd':
      return 'روزهای فرد ماه';
    case 'monthly':
      return every === 1 ? 'هر ماه' : `هر ${every} ماه`;
    case 'dates':
      return (rule.dates?.length ?? 0) === 1
        ? 'یک تاریخ مشخص'
        : `${rule.dates?.length ?? 0} تاریخ مشخص`;
    default:
      return '—';
  }
}

export function addMonthsToRuleAnchor(task: Task, months: number): string {
  return addMonths(task.date, months);
}
