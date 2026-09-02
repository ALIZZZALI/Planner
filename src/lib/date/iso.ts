/** Minimal, dependency-free ISO date helpers (`YYYY-MM-DD`, Gregorian). */

import { toGregorian, toJalali, jalaliMonthLength } from './jalali';

export { jalaliMonthLength, JALALI_MONTHS } from './jalali';
import type { Weekday } from '@/types';

export const WEEKDAY_ORDER: Weekday[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sat: 'شنبه',
  sun: 'یکشنبه',
  mon: 'دوشنبه',
  tue: 'سه‌شنبه',
  wed: 'چهارشنبه',
  thu: 'پنجشنبه',
  fri: 'جمعه',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  sat: 'ش',
  sun: 'ی',
  mon: 'د',
  tue: 'س',
  wed: 'چ',
  thu: 'پ',
  fri: 'ج',
};

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

export interface IsoParts {
  y: number;
  m: number;
  d: number;
}

export function gregorianToISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function isoToGregorian(iso: string): IsoParts {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  return { y, m, d };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const { y, m, d } = isoToGregorian(value);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > 2200) return false;
  return d <= daysInGregorianMonth(y, m);
}

export function isLeapGregorian(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInGregorianMonth(y: number, m: number): number {
  const lengths = [31, isLeapGregorian(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[m - 1];
}

/** Day-of-week for an ISO date. Saturday is the first day of the Persian week. */
export function weekdayOfISO(iso: string): Weekday {
  const { y, m, d } = isoToGregorian(iso);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const map: Record<number, Weekday> = {
    0: 'sun',
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat',
  };
  return map[js];
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = isoToGregorian(fromISO);
  const b = isoToGregorian(toISO);
  const ua = Date.UTC(a.y, a.m - 1, a.d);
  const ub = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((ub - ua) / 86400000);
}

export function addDays(iso: string, amount: number): string {
  const { y, m, d } = isoToGregorian(iso);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + amount);
  return gregorianToISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addMonths(iso: string, amount: number): string {
  const { y, m, d } = isoToGregorian(iso);
  const target = new Date(Date.UTC(y, m - 1 + amount, 1));
  const maxDay = daysInGregorianMonth(target.getUTCFullYear(), target.getUTCMonth() + 1);
  return gregorianToISO(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    Math.min(d, maxDay),
  );
}

/** Saturday-based week start. */
export function startOfWeek(iso: string, firstDay: Weekday = 'sat'): string {
  const offset = WEEKDAY_ORDER.indexOf(weekdayOfISO(iso)) - WEEKDAY_ORDER.indexOf(firstDay);
  const back = offset > 0 ? offset : offset + 7;
  return addDays(iso, -back);
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function dateRange(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  if (compareISO(toISO, fromISO) < 0) return out;
  let cursor = fromISO;
  let guard = 0;
  while (compareISO(cursor, toISO) <= 0 && guard < 800) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

/* ------------------------------ Jalali helpers ----------------------------- */

export interface JalaliParts {
  jy: number;
  jm: number;
  jd: number;
}

export function isoToJalali(iso: string): JalaliParts {
  const { y, m, d } = isoToGregorian(iso);
  const j = toJalali(y, m, d);
  return { jy: j.y, jm: j.m, jd: j.d };
}

export function jalaliToISO(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd);
  return gregorianToISO(g.y, g.m, g.d);
}

export function jalaliMonthStartISO(jy: number, jm: number): string {
  return jalaliToISO(jy, jm, 1);
}

export function jalaliMonthEndISO(jy: number, jm: number): string {
  return jalaliToISO(jy, jm, jalaliMonthLength(jy, jm));
}

export function jalaliMonthOfISO(iso: string): { jy: number; jm: number } {
  const { jy, jm } = isoToJalali(iso);
  return { jy, jm };
}

export function addJalaliMonths(iso: string, amount: number): string {
  const { jy, jm, jd } = isoToJalali(iso);
  const total = (jy * 12 + (jm - 1)) + amount;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const maxDay = jalaliMonthLength(ny, nm);
  return jalaliToISO(ny, nm, Math.min(jd, maxDay));
}

/* --------------------------------- time ----------------------------------- */

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value.trim());
}

export function normalizeTime(value: string): string {
  const [h, m] = value.split(':').map((n) => Number(n));
  return `${pad(h)}:${pad(m)}`;
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map((n) => Number(n));
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

export function formatTime(minutes: number, hour12 = false): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  let h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  if (!hour12) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'ق.ظ' : 'ب.ظ';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(m)} ${suffix}`;
}
