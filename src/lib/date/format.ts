/** Formatting helpers shared by UI + engine (Persian numerals, labels). */

import {
  WEEKDAY_LABELS,
  formatTime,
  isoToGregorian,
  isoToJalali,
  timeToMinutes,
} from './iso';
import { JALALI_MONTHS } from './jalali';
import type { Settings } from '@/types';

export const PERSIAN_DIGIT_TABLE = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGIT_TABLE[Number(d)]);
}

export function num(value: number, persian: boolean): string {
  return persian ? toPersianDigits(value) : String(value);
}

export function formatClock(time: string, settings: Pick<Settings, 'hour12' | 'persianDigits'>) {
  const text = formatTime(timeToMinutes(time), settings.hour12);
  return settings.persianDigits ? toPersianDigits(text) : text;
}

export function formatJalaliDate(
  iso: string,
  opts: { persianDigits?: boolean; withWeekday?: boolean; style?: 'long' | 'medium' | 'short' } = {},
): string {
  const { jy, jm, jd } = isoToJalali(iso);
  const style = opts.style ?? 'long';
  const persian = opts.persianDigits ?? true;
  let text: string;
  if (style === 'short') text = `${jd}/${jm}`;
  else if (style === 'medium') text = `${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`;
  else text = `${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`;
  if (opts.withWeekday) text = `${relativeWeekdayLabel(iso)}، ${text}`;
  return persian ? toPersianDigits(text) : text;
}

export function formatGregorianDate(iso: string, persianDigits = false): string {
  const { y, m, d } = isoToGregorian(iso);
  const text = `${y}/${m}/${d}`;
  return persianDigits ? toPersianDigits(text) : text;
}

export function formatDate(iso: string, settings: Pick<Settings, 'calendar' | 'persianDigits'>) {
  return settings.calendar === 'persian'
    ? formatJalaliDate(iso, { persianDigits: settings.persianDigits, style: 'medium' })
    : formatGregorianDate(iso, settings.persianDigits);
}

export function relativeWeekdayLabel(iso: string): string {
  const weekday = weekdayLabel(iso);
  return weekday;
}

export function weekdayLabel(iso: string): string {
  // avoid circular import: derive weekday from Date directly
  const { y, m, d } = isoToGregorian(iso);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const map: Record<number, string> = {
    6: 'شنبه',
    0: 'یکشنبه',
    1: 'دوشنبه',
    2: 'سه‌شنبه',
    3: 'چهارشنبه',
    4: 'پنجشنبه',
    5: 'جمعه',
  };
  return map[js] ?? WEEKDAY_LABELS.sat;
}

export function relativeDayLabel(iso: string, todayISO: string): string {
  const diff = daysDiff(iso, todayISO);
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'فردا';
  if (diff === -1) return 'دیروز';
  if (diff === 2) return 'پس‌فردا';
  return '';
}

function daysDiff(a: string, b: string): number {
  const pa = isoToGregorian(a);
  const pb = isoToGregorian(b);
  return Math.round(
    (Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000,
  );
}

export function formatDuration(minutes: number, persian = true): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ساعت`);
  if (m) parts.push(`${m} دقیقه`);
  const text = parts.join(' و ') || '۰ دقیقه';
  return persian ? toPersianDigits(text) : text;
}

export function formatMinutesOfDay(minutes: number, settings: Pick<Settings, 'hour12' | 'persianDigits'>) {
  const text = formatTime(minutes, settings.hour12);
  return settings.persianDigits ? toPersianDigits(text) : text;
}
