import { describe, expect, it } from 'vitest';
import { occursOnDate, expandTask, nextOccurrenceDate, describeRecurrence } from '../recurrence';
import { makeTask } from './helpers';

describe('recurrence engine', () => {
  it('one-time task occurs only on its date', () => {
    const task = makeTask({ date: '2026-09-03', repeat: { type: 'none' } });
    expect(occursOnDate(task, '2026-09-03').occurs).toBe(true);
    expect(occursOnDate(task, '2026-09-04').occurs).toBe(false);
    expect(occursOnDate(task, '2026-09-02').occurs).toBe(false);
  });

  it('daily recurrence matches consecutive days', () => {
    const task = makeTask({ date: '2026-09-03', repeat: { type: 'daily' } });
    expect(occursOnDate(task, '2026-09-04').occurs).toBe(true);
    expect(occursOnDate(task, '2026-10-04').occurs).toBe(true);
  });

  it('every N days honours the interval', () => {
    const task = makeTask({ date: '2026-09-01', repeat: { type: 'interval', every: 3 } });
    expect(occursOnDate(task, '2026-09-01').occurs).toBe(true);
    expect(occursOnDate(task, '2026-09-02').occurs).toBe(false);
    expect(occursOnDate(task, '2026-09-04').occurs).toBe(true);
    expect(occursOnDate(task, '2026-09-07').occurs).toBe(true);
  });

  it('weekly recurrence respects selected weekdays', () => {
    // 2026-09-05 is a Saturday
    const task = makeTask({
      date: '2026-09-05',
      repeat: { type: 'weekly', days: ['sat', 'mon', 'wed'] },
    });
    expect(occursOnDate(task, '2026-09-05').occurs).toBe(true); // sat
    expect(occursOnDate(task, '2026-09-07').occurs).toBe(true); // mon
    expect(occursOnDate(task, '2026-09-09').occurs).toBe(true); // wed
    expect(occursOnDate(task, '2026-09-06').occurs).toBe(false); // sun
    expect(occursOnDate(task, '2026-09-08').occurs).toBe(false); // tue
  });

  it('weekdays = Saturday..Thursday (Persian work week), weekends = Friday', () => {
    const workdays = makeTask({ date: '2026-09-05', repeat: { type: 'weekdays' } });
    expect(occursOnDate(workdays, '2026-09-11').occurs).toBe(false); // friday is weekend
    expect(occursOnDate(workdays, '2026-09-10').occurs).toBe(true); // thu
    expect(occursOnDate(workdays, '2026-09-04').occurs).toBe(false); // friday
    const weekend = makeTask({ date: '2026-09-05', repeat: { type: 'weekends' } });
    expect(occursOnDate(weekend, '2026-09-11').occurs).toBe(true); // fri
    expect(occursOnDate(weekend, '2026-09-12').occurs).toBe(false); // sat
  });

  it('even and odd days follow day-of-month parity', () => {
    const even = makeTask({ date: '2026-09-02', repeat: { type: 'even' } });
    expect(occursOnDate(even, '2026-09-02').occurs).toBe(true);
    expect(occursOnDate(even, '2026-09-03').occurs).toBe(false);
    expect(occursOnDate(even, '2026-09-30').occurs).toBe(true);
    const odd = makeTask({ date: '2026-09-01', repeat: { type: 'odd' } });
    expect(occursOnDate(odd, '2026-10-31').occurs).toBe(true);
    expect(occursOnDate(odd, '2026-09-30').occurs).toBe(false);
    expect(occursOnDate(odd, '2026-10-01').occurs).toBe(true);
  });

  it('monthly recurrence matches the same day each month', () => {
    const task = makeTask({ date: '2026-09-28', repeat: { type: 'monthly' } });
    expect(occursOnDate(task, '2026-09-28').occurs).toBe(true);
    expect(occursOnDate(task, '2026-10-28').occurs).toBe(true);
    expect(occursOnDate(task, '2026-10-27').occurs).toBe(false);
    expect(occursOnDate(task, '2026-12-28').occurs).toBe(true);
  });

  it('date range limits recurrence', () => {
    const task = makeTask({
      date: '2026-09-01',
      endDate: '2026-09-10',
      repeat: { type: 'daily' },
    });
    expect(occursOnDate(task, '2026-09-10').occurs).toBe(true);
    expect(occursOnDate(task, '2026-09-11').occurs).toBe(false);
    const dates = expandTask(task, '2026-08-01', '2026-12-31');
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe('2026-09-01');
    expect(dates[dates.length - 1]).toBe('2026-09-10');
  });

  it('occurrence limit caps the number of sessions', () => {
    const task = makeTask({
      date: '2026-09-01',
      repeat: { type: 'daily' },
      occurrenceLimit: 5,
    });
    expect(expandTask(task, '2026-09-01', '2026-12-31')).toHaveLength(5);
    expect(occursOnDate(task, '2026-09-06').occurs).toBe(false);
  });

  it('every N weeks keeps the week anchor', () => {
    const task = makeTask({
      date: '2026-09-05', // saturday
      repeat: { type: 'weekly', days: ['sat'], every: 2 },
    });
    expect(occursOnDate(task, '2026-09-05').occurs).toBe(true);
    expect(occursOnDate(task, '2026-09-12').occurs).toBe(false);
    expect(occursOnDate(task, '2026-09-19').occurs).toBe(true);
  });

  it('nextOccurrenceDate finds the first upcoming date', () => {
    const task = makeTask({
      date: '2026-09-05',
      repeat: { type: 'weekly', days: ['sat', 'wed'] },
    });
    expect(nextOccurrenceDate(task, '2026-09-07')).toBe('2026-09-09');
    expect(nextOccurrenceDate(task, '2026-09-06')).toBe('2026-09-09');
  });

  it('expands a range with the correct count and order', () => {
    const task = makeTask({ date: '2026-09-01', repeat: { type: 'weekdays' } });
    const dates = expandTask(task, '2026-09-01', '2026-09-13');
    // 2026-09-11 is Friday -> excluded
    // 2026-09-04 and 2026-09-11 are Fridays and are skipped
    expect(dates).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('describeRecurrence produces Persian labels', () => {
    expect(describeRecurrence({ type: 'daily' }, () => '')).toBe('هر روز');
    expect(describeRecurrence({ type: 'odd' }, () => '')).toBe('روزهای فرد ماه');
    expect(describeRecurrence({ type: 'daily', every: 3 }, () => '')).toBe('هر 3 روز');
  });
});
