/**
 * Timezone helpers. The planner is timezone-aware: all "today / now / time"
 * decisions are made inside the user's configured timezone (default Asia/Tehran)
 * regardless of the device's OS timezone.
 * Uses Intl only — no data files, works offline.
 */

import { gregorianToISO, isoToGregorian, weekdayOfISO } from './iso';

export interface ZoneNow {
  /** `YYYY-MM-DD` inside the target timezone */
  date: string;
  /** minutes since midnight */
  minutes: number;
  hh: number;
  mm: number;
  ss: number;
  weekday: ReturnType<typeof weekdayOfISO>;
  offsetMinutes: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function nowInZone(timeZone: string, at: Date = new Date()): ZoneNow {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'Asia/Tehran';
  const parts = formatter(tz).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  const weekdayShort = get('weekday').toLowerCase().slice(0, 3);

  const date = gregorianToISO(year, month, day);
  const weekdayMap: Record<string, ZoneNow['weekday']> = {
    sat: 'sat',
    sun: 'sun',
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
  };

  // Offset of the target zone at `at` (minutes east of UTC).
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((asUTC - at.getTime()) / 60000);

  return {
    date,
    minutes: hour * 60 + minute,
    hh: hour,
    mm: minute,
    ss: second,
    weekday: weekdayMap[weekdayShort] ?? weekdayOfISO(date),
    offsetMinutes,
  };
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC timestamp.
 * Needed so reminder scheduling stays correct for the configured zone.
 */
export function zonedTimeToUtc(dateISO: string, minutes: number, timeZone: string): number {
  const { y, m, d } = isoToGregorian(dateISO);
  const naive = Date.UTC(y, m - 1, d, 0, minutes, 0, 0);
  let offset = 0;
  for (let i = 0; i < 3; i += 1) {
    const probe = new Date(naive - offset * 60000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(probe);
    const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value);
    let hour = get('hour');
    if (hour === 24) hour = 0;
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), 0, 0);
    const next = Math.round((asUTC - probe.getTime()) / 60000);
    if (next === offset) break;
    offset = next;
  }
  return naive - offset * 60000;
}
