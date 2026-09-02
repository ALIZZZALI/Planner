import { describe, expect, it } from 'vitest';
import {
  addDays,
  addJalaliMonths,
  formatTime,
  isISODate,
  isTimeString,
  isoToJalali,
  jalaliToISO,
  startOfWeek,
  timeToMinutes,
  weekdayOfISO,
} from '@/lib/date/iso';
import { toJalali, toGregorian, jalaliMonthLength, isLeapJalaliYear } from '@/lib/date/jalali';
import { nowInZone, zonedTimeToUtc } from '@/lib/date/timezone';

describe('jalali conversion', () => {
  it('converts known dates correctly', () => {
    // 2026-09-01 == 1405-06-10
    expect(isoToJalali('2026-09-01')).toEqual({ jy: 1405, jm: 6, jd: 10 });
    // 2026-03-21 == 1405-01-01 (Nowruz)
    expect(isoToJalali('2026-03-21')).toEqual({ jy: 1405, jm: 1, jd: 1 });
    // 2026-02-19 == 1404-11-30
    expect(isoToJalali('2026-02-19')).toEqual({ jy: 1404, jm: 11, jd: 30 });
  });

  it('round-trips gregorian <-> jalali', () => {
    for (const iso of ['2026-01-01', '2026-03-20', '2026-06-15', '2026-09-08', '2026-12-31']) {
      const { jy, jm, jd } = isoToJalali(iso);
      expect(jalaliToISO(jy, jm, jd)).toBe(iso);
    }
    expect(toJalali(2026, 9, 8)).toEqual({ y: 1405, m: 6, d: 17 });
    expect(toGregorian(1405, 6, 17)).toEqual({ y: 2026, m: 9, d: 8 });
  });

  it('knows jalali month lengths and leap years', () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1405, 12)).toBe(29);
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(isLeapJalaliYear(1405)).toBe(false);
  });

  it('adds jalali months', () => {
    // 1405-06-10 + 1 month = 1405-07-10 == 2026-10-02
    expect(addJalaliMonths('2026-09-01', 1)).toBe('2026-10-02');
    expect(addJalaliMonths('2026-09-01', -6)).toBe('2026-03-01');
  });
});

describe('iso helpers', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('26-09-01')).toBe(false);
    expect(isISODate('2026-09-31')).toBe(false);
  });

  it('validates times', () => {
    expect(isTimeString('08:30')).toBe(true);
    expect(isTimeString('23:59')).toBe(true);
    expect(isTimeString('24:00')).toBe(false);
    expect(isTimeString('8:30')).toBe(true);
    expect(isTimeString('08:5')).toBe(false);
  });

  it('computes weekday with Saturday first', () => {
    expect(weekdayOfISO('2026-09-05')).toBe('sat');
    expect(weekdayOfISO('2026-09-11')).toBe('fri');
    expect(startOfWeek('2026-09-11')).toBe('2026-09-05');
  });

  it('adds days across months', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('converts time <-> minutes and formats', () => {
    expect(timeToMinutes('08:30')).toBe(510);
    expect(formatTime(510)).toBe('08:30');
    expect(formatTime(750, true)).toBe('12:30 ب.ظ');
    expect(formatTime(0, true)).toBe('12:00 ق.ظ');
  });
});

describe('timezone handling', () => {
  it('returns a fixed reference time in the given zone', () => {
    const instant = new Date('2026-09-05T05:00:00Z'); // 08:30 Tehran (UTC+3:30)
    const result = nowInZone('Asia/Tehran', instant);
    expect(result.date).toBe('2026-09-05');
    expect(result.minutes).toBe(8 * 60 + 30);
    expect(result.weekday).toBe('sat');
  });

  it('falls back to Tehran for invalid zones', () => {
    const instant = new Date('2026-09-05T05:00:00Z');
    expect(nowInZone('Not/AZone', instant).minutes).toBe(510);
  });

  it('shifts by the correct offset in other zones', () => {
    const instant = new Date('2026-09-05T12:00:00Z');
    expect(nowInZone('UTC', instant).minutes).toBe(12 * 60);
    expect(nowInZone('Europe/London', instant).minutes).toBe(13 * 60); // BST
  });

  it('converts a zoned wall clock back to UTC', () => {
    const timestamp = zonedTimeToUtc('2026-09-05', 8 * 60 + 30, 'Asia/Tehran');
    expect(new Date(timestamp).toISOString()).toBe('2026-09-05T05:00:00.000Z');
  });
});
