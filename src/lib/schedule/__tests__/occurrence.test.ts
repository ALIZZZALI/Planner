import { describe, expect, it } from 'vitest';
import { buildOccurrence, buildDayOccurrences, buildRangeOccurrences, computeLanes, computeDayStats, findCurrentAndNext } from '../occurrence';
import { makeTask } from './helpers';
import type { CompletionRecord } from '@/types';

function ctx(overrides: Partial<Parameters<typeof buildOccurrence>[2]> = {}) {
  return { nowDate: '2026-09-05', nowMinutes: 9 * 60, completions: new Map<string, CompletionRecord>(), ...overrides };
}

describe('occurrence building', () => {
  it('computes duration and midnight crossing', () => {
    const night = makeTask({ start: '23:00', end: '06:00', date: '2026-09-05' });
    const occurrence = buildOccurrence(night, '2026-09-05', ctx());
    expect(occurrence.crossesMidnight).toBe(true);
    expect(occurrence.durationMinutes).toBe(7 * 60);
    expect(occurrence.endMinutes).toBe(6 * 60 + 1440);
  });

  it('derives active status while inside the block', () => {
    const task = makeTask({ start: '08:30', end: '09:30', date: '2026-09-05', repeat: { type: 'daily' } });
    const active = buildOccurrence(task, '2026-09-05', ctx({ nowMinutes: 9 * 60 }));
    expect(active.status).toBe('active');
    const before = buildOccurrence(task, '2026-09-05', ctx({ nowMinutes: 7 * 60 }));
    expect(before.status).toBe('scheduled');
    const after = buildOccurrence(task, '2026-09-05', ctx({ nowMinutes: 10 * 60 }));
    expect(after.status).toBe('missed');
  });

  it('separates completion history from the recurrence definition', () => {
    const task = makeTask({ date: '2026-09-05', repeat: { type: 'daily' } });
    const completions = new Map<string, CompletionRecord>([
      ['test-task:2026-09-05', { id: 'test-task:2026-09-05', taskId: 'test-task', date: '2026-09-05', status: 'completed', completedAt: '2026-09-05T09:00:00.000Z' }],
    ]);
    const done = buildOccurrence(task, '2026-09-05', ctx({ completions }));
    expect(done.status).toBe('completed');
    const nextDay = buildOccurrence(task, '2026-09-06', ctx({ completions }));
    expect(nextDay.status).toBe('scheduled');
  });

  it('skipped occurrences keep their record', () => {
    const task = makeTask({ date: '2026-09-05', repeat: { type: 'daily' } });
    const completions = new Map<string, CompletionRecord>([
      ['test-task:2026-09-05', { id: 'test-task:2026-09-05', taskId: 'test-task', date: '2026-09-05', status: 'skipped', completedAt: '2026-09-05T09:00:00.000Z' }],
    ]);
    expect(buildOccurrence(task, '2026-09-05', ctx({ completions })).status).toBe('skipped');
  });

  it('includes midnight-crossing tasks from the previous day', () => {
    const night = makeTask({ start: '23:30', end: '01:00', date: '2026-09-04', repeat: { type: 'daily' } });
    const occurrences = buildDayOccurrences([night], '2026-09-05', ctx());
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences[0].startMinutes).toBe(23 * 60 + 30);
  });

  it('builds a range map for every date', () => {
    const task = makeTask({ date: '2026-09-01', repeat: { type: 'daily' } });
    const map = buildRangeOccurrences([task], '2026-09-01', '2026-09-03', ctx());
    expect(map.size).toBe(3);
    expect(map.get('2026-09-02')?.[0].task.id).toBe('test-task');
  });
});

describe('overlap lanes', () => {
  it('assigns separate lanes to overlapping blocks', () => {
    const a = buildOccurrence(makeTask({ id: 'a', start: '09:00', end: '10:00', date: '2026-09-05' }), '2026-09-05', ctx());
    const b = buildOccurrence(makeTask({ id: 'b', start: '09:30', end: '10:30', date: '2026-09-05' }), '2026-09-05', ctx());
    const c = buildOccurrence(makeTask({ id: 'c', start: '11:00', end: '12:00', date: '2026-09-05' }), '2026-09-05', ctx());
    const lanes = computeLanes([a, b, c]);
    expect(lanes.get('a:2026-09-05')?.lanes).toBe(2);
    expect(lanes.get('b:2026-09-05')?.lanes).toBe(2);
    expect(lanes.get('a:2026-09-05')?.lane).not.toBe(lanes.get('b:2026-09-05')?.lane);
    expect(lanes.get('c:2026-09-05')?.lanes).toBe(1);
  });

  it('handles three simultaneous blocks', () => {
    const occurrences = [
      buildOccurrence(makeTask({ id: 'a', start: '09:00', end: '10:00', date: '2026-09-05' }), '2026-09-05', ctx()),
      buildOccurrence(makeTask({ id: 'b', start: '09:00', end: '10:00', date: '2026-09-05' }), '2026-09-05', ctx()),
      buildOccurrence(makeTask({ id: 'c', start: '09:15', end: '09:45', date: '2026-09-05' }), '2026-09-05', ctx()),
    ];
    const lanes = computeLanes(occurrences);
    expect(new Set(occurrences.map((o) => lanes.get(o.id)?.lane)).size).toBe(3);
  });
});

describe('day stats', () => {
  it('computes progress excluding skipped tasks', () => {
    const occurrences = [
      buildOccurrence(makeTask({ id: 'a', date: '2026-09-05' }), '2026-09-05', ctx()),
      buildOccurrence(makeTask({ id: 'b', date: '2026-09-05' }), '2026-09-05', ctx()),
      buildOccurrence(makeTask({ id: 'c', date: '2026-09-05' }), '2026-09-05', ctx()),
    ];
    const completions = new Map<string, CompletionRecord>([
      ['a:2026-09-05', { id: 'a:2026-09-05', taskId: 'a', date: '2026-09-05', status: 'completed', completedAt: '' }],
      ['b:2026-09-05', { id: 'b:2026-09-05', taskId: 'b', date: '2026-09-05', status: 'skipped', completedAt: '' }],
    ]);
    const withStatus = [
      buildOccurrence(makeTask({ id: 'a', date: '2026-09-05' }), '2026-09-05', ctx({ completions })),
      buildOccurrence(makeTask({ id: 'b', date: '2026-09-05' }), '2026-09-05', ctx({ completions })),
      buildOccurrence(makeTask({ id: 'c', date: '2026-09-05' }), '2026-09-05', ctx({ completions })),
    ];
    void occurrences;
    const stats = computeDayStats(withStatus);
    expect(stats.total).toBe(3);
    expect(stats.completed).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.progress).toBe(50);
  });
});

describe('current and next', () => {
  it('finds the running block and the next one', () => {
    const occurrences = [
      buildOccurrence(makeTask({ id: 'a', start: '08:00', end: '09:00', date: '2026-09-05' }), '2026-09-05', ctx()),
      buildOccurrence(makeTask({ id: 'b', start: '09:30', end: '10:30', date: '2026-09-05' }), '2026-09-05', ctx()),
    ];
    const { current, next } = findCurrentAndNext(occurrences, 8 * 60 + 30);
    expect(current?.taskId).toBe('a');
    expect(next?.taskId).toBe('b');
  });
});
