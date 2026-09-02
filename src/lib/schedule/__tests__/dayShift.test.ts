import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTask } from '@/lib/schedule/__tests__/helpers';
import {
  applyScheduleShift,
  calculateWakeUpDelay,
  detectScheduleConflicts,
  effectiveTaskShift,
  findPlannedWakeUp,
  previewScheduleShift,
  resetDailySchedule,
  undoScheduleShift,
} from '@/lib/schedule/dayShift';
import { buildDayOccurrences, type OccurrenceContext } from '@/lib/schedule/occurrence';
import { dayOverrideRepository, taskRepository } from '@/services/repositories';
import {
  migratePayload,
  normalizePayloadFields,
  normalizeTasks,
  sanitizeDisplayText,
  validateScheduleText,
} from '@/services/importExport/schema';
import { importExportService } from '@/services/importExport/service';
import type { DayOverride } from '@/types';

const DATE = '2026-09-05'; // Saturday

function ctx(nowMinutes = 7 * 60): OccurrenceContext {
  return { nowDate: DATE, nowMinutes, completions: new Map() };
}

function override(partial: Partial<DayOverride> = {}): DayOverride {
  return {
    date: DATE,
    globalShiftMinutes: 0,
    taskShifts: {},
    actualWakeUpMinutes: null,
    plannedWakeUpMinutes: null,
    log: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const math = makeTask({ id: 'math', name: 'ریاضی', start: '08:30', end: '09:30', date: DATE, repeat: { type: 'daily' } });
const physics = makeTask({ id: 'physics', name: 'فیزیک', start: '09:45', end: '10:45', date: DATE, repeat: { type: 'daily' } });
const chemistry = makeTask({ id: 'chem', name: 'شیمی', start: '11:15', end: '12:15', date: DATE, repeat: { type: 'daily' } });
const photoshop = makeTask({
  id: 'ps',
  name: 'کلاس فتوشاپ',
  start: '16:00',
  end: '17:30',
  date: DATE,
  repeat: { type: 'daily' },
  fixedTime: true,
});

const baseOptions = { mode: 'normal' as const, scope: 'all' as const, nowMinutes: 6 * 60 };

describe('normal shift mode', () => {
  it('shifts start and end together and keeps duration', () => {
    const preview = previewScheduleShift([math], DATE, 60, baseOptions, ctx(), undefined);
    const row = preview.rows[0];
    expect(row.newStart).toBe(9 * 60 + 30);
    expect(row.newEnd).toBe(10 * 60 + 30);
    expect(row.newEnd - row.newStart).toBe(60);
    expect(row.moved).toBe(true);
  });

  it('preserves relative gaps', () => {
    const preview = previewScheduleShift([math, physics], DATE, 37, baseOptions, ctx(), undefined);
    const [a, b] = preview.rows;
    expect(a.newStart).toBe(8 * 60 + 30 + 37);
    expect(b.newStart).toBe(9 * 60 + 45 + 37);
    expect(b.newStart - a.newEnd).toBe(15);
  });

  it('supports negative shifts and arbitrary values', () => {
    expect(previewScheduleShift([math], DATE, -20, baseOptions, ctx(), undefined).rows[0].newStart).toBe(8 * 60 + 10);
    expect(previewScheduleShift([math], DATE, 125, baseOptions, ctx(), undefined).rows[0].newStart).toBe(10 * 60 + 35);
    expect(previewScheduleShift([math], DATE, 67, baseOptions, ctx(), undefined).rows[0].newStart).toBe(9 * 60 + 37);
  });

  it('never moves fixed-time tasks', () => {
    const preview = previewScheduleShift([math, photoshop], DATE, 60, baseOptions, ctx(), undefined);
    const fixedRow = preview.rows.find((row) => row.taskId === 'ps');
    const movableRow = preview.rows.find((row) => row.taskId === 'math');
    expect(fixedRow?.newStart).toBe(16 * 60);
    expect(fixedRow?.moved).toBe(false);
    expect(fixedRow?.fixedTime).toBe(true);
    expect(movableRow?.newStart).toBe(9 * 60 + 30);
  });

  it('flags a collision with a fixed task and reports it in Persian', () => {
    // physics + 6h collides with the 16:00 photoshop class
    const preview = previewScheduleShift([physics, photoshop], DATE, 360, baseOptions, ctx(), undefined);
    expect(preview.counts.conflicts).toBeGreaterThan(0);
    expect(preview.messages.join(' ')).toContain('فتوشاپ');
    expect(preview.messages.join(' ')).toContain('16:00');
  });

  it('detects tasks crossing midnight', () => {
    const late = makeTask({ id: 'late', start: '23:00', end: '23:30', date: DATE, repeat: { type: 'daily' } });
    const preview = previewScheduleShift([late], DATE, 120, baseOptions, ctx(), undefined);
    expect(preview.rows[0].newEnd).toBeGreaterThan(1440);
    expect(preview.messages.join(' ')).toContain('نیمه‌شب');
  });
});

describe('smart (reflow) mode', () => {
  it('packs movable tasks around the fixed anchor without overlap', () => {
    const preview = previewScheduleShift([math, physics, chemistry, photoshop], DATE, 240, { ...baseOptions, mode: 'smart' }, ctx(), undefined);
    const rows = preview.rows;
    const intervals = rows.map((row) => ({ start: row.newStart, end: row.newEnd, id: row.taskId }));
    for (let i = 0; i < intervals.length; i += 1) {
      for (let j = i + 1; j < intervals.length; j += 1) {
        expect(intervals[i].start < intervals[j].end && intervals[j].start < intervals[i].end).toBe(false);
      }
    }
    const fixedRow = rows.find((row) => row.taskId === 'ps');
    expect(fixedRow?.newStart).toBe(16 * 60);
    // durations are preserved for every block (photoshop is 90 minutes)
    for (const row of rows) expect(row.newEnd - row.newStart).toBe(row.originalEnd - row.originalStart);
    expect(preview.counts.conflicts).toBe(0);
  });

  it('keeps the original order of movable tasks', () => {
    const preview = previewScheduleShift([math, physics], DATE, 300, { ...baseOptions, mode: 'smart' }, ctx(), undefined);
    const mathRow = preview.rows.find((row) => row.taskId === 'math');
    const physicsRow = preview.rows.find((row) => row.taskId === 'physics');
    expect((mathRow?.newStart ?? 0) < (physicsRow?.newStart ?? 0)).toBe(true);
  });
});

describe('scopes', () => {
  it('skips completed tasks in incomplete-only mode', () => {
    const completed = new Map([
      ['math:2026-09-05', { id: 'math:2026-09-05', taskId: 'math', date: DATE, status: 'completed' as const, completedAt: '' }],
    ]);
    const preview = previewScheduleShift([math, physics], DATE, 30, { ...baseOptions, scope: 'incomplete' }, { ...ctx(), completions: completed }, undefined);
    const mathRow = preview.rows.find((row) => row.taskId === 'math');
    const physicsRow = preview.rows.find((row) => row.taskId === 'physics');
    expect(mathRow?.moved).toBe(false);
    expect(mathRow?.skipReason).toBe('completed');
    expect(physicsRow?.moved).toBe(true);
  });

  it('skips tasks that already finished when using the upcoming scope', () => {
    const preview = previewScheduleShift([math], DATE, 15, { ...baseOptions, scope: 'upcoming', nowMinutes: 11 * 60 }, ctx(11 * 60), undefined);
    expect(preview.rows[0].moved).toBe(false);
    expect(preview.rows[0].skipReason).toBe('past');
  });

  it('only shifts manually selected tasks', () => {
    const preview = previewScheduleShift([math, physics], DATE, 30, { ...baseOptions, scope: 'selected', selectedIds: ['physics'] }, ctx(), undefined);
    expect(preview.rows.find((row) => row.taskId === 'math')?.moved).toBe(false);
    expect(preview.rows.find((row) => row.taskId === 'physics')?.moved).toBe(true);
  });
});

describe('multiple shifts, undo and reset', () => {
  it('accumulates shifts mathematically', () => {
    let state = override();
    for (const minutes of [60, 20, -15]) {
      const preview = previewScheduleShift([math], DATE, minutes, baseOptions, ctx(), state);
      state = applyScheduleShift(state, preview, baseOptions);
    }
    expect(state.globalShiftMinutes).toBe(65);
  });

  it('undo restores the previous state', () => {
    let state = override();
    state = applyScheduleShift(state, previewScheduleShift([math], DATE, 60, baseOptions, ctx(), state), baseOptions);
    state = applyScheduleShift(state, previewScheduleShift([math], DATE, 20, baseOptions, ctx(), state), baseOptions);
    expect(state.globalShiftMinutes).toBe(80);
    const { next } = undoScheduleShift(state);
    expect(next?.globalShiftMinutes).toBe(60);
    const undone = undoScheduleShift(next!);
    expect(undone.next?.globalShiftMinutes).toBe(0);
  });

  it('reset clears the day without touching templates', () => {
    let state = override();
    state = applyScheduleShift(state, previewScheduleShift([math], DATE, 90, baseOptions, ctx(), state), baseOptions);
    const reset = resetDailySchedule(state);
    expect(reset.globalShiftMinutes).toBe(0);
    expect(reset.taskShifts).toEqual({});
    // the recurring template is untouched
    expect(math.start).toBe('08:30');
    expect(math.repeat.type).toBe('daily');
  });

  it('effectiveTaskShift ignores fixed tasks', () => {
    const state = override({ globalShiftMinutes: 60 });
    expect(effectiveTaskShift(state, math)).toBe(60);
    expect(effectiveTaskShift(state, photoshop)).toBe(0);
  });
});

describe('occurrences, overrides and notifications', () => {
  it('shifted occurrences flow through the shared occurrence builder', () => {
    const map = new Map([[DATE, override({ globalShiftMinutes: 60 })]]);
    const occurrences = buildDayOccurrences([math, photoshop], DATE, { ...ctx(), dayOverrides: map });
    expect(occurrences.find((o) => o.taskId === 'math')?.startMinutes).toBe(9 * 60 + 30);
    expect(occurrences.find((o) => o.taskId === 'ps')?.startMinutes).toBe(16 * 60);
    expect(occurrences.find((o) => o.taskId === 'math')?.shiftMinutes).toBe(60);
  });

  it('tomorrow stays on the original time (only today is overridden)', () => {
    const map = new Map([[DATE, override({ globalShiftMinutes: 60 })]]);
    const tomorrow = '2026-09-06';
    const occurrences = buildDayOccurrences([math], tomorrow, { ...ctx(), dayOverrides: map });
    expect(occurrences[0].startMinutes).toBe(8 * 60 + 30);
    expect(occurrences[0].shiftMinutes).toBe(0);
  });

  it('removing the override restores the original time', () => {
    const withOverride = buildDayOccurrences([math], DATE, { ...ctx(), dayOverrides: new Map([[DATE, override({ globalShiftMinutes: 60 })]]) });
    expect(withOverride[0].startMinutes).toBe(9 * 60 + 30);
    const withoutOverride = buildDayOccurrences([math], DATE, ctx());
    expect(withoutOverride[0].startMinutes).toBe(8 * 60 + 30);
  });

  it('cross-midnight blocks keep their duration after a shift', () => {
    const night = makeTask({ id: 'night', start: '23:30', end: '01:00', date: DATE, repeat: { type: 'daily' } });
    const map = new Map([[DATE, override({ globalShiftMinutes: 30 })]]);
    const occurrences = buildDayOccurrences([night], DATE, { ...ctx(), dayOverrides: map });
    expect(occurrences[0].durationMinutes).toBe(90);
    expect(occurrences[0].startMinutes).toBe(24 * 60);
  });
});

describe('wake-up', () => {
  it('computes the delay between planned and actual wake-up', () => {
    expect(calculateWakeUpDelay(8 * 60, 9 * 60 + 7)).toBe(67);
    expect(calculateWakeUpDelay(8 * 60, 7 * 60 + 30)).toBe(-30);
  });

  it('finds the planned wake-up from the day (explicit task first)', () => {
    const wake = makeTask({ id: 'wake', name: 'بیدار شدن', start: '08:00', end: '08:30', date: DATE, icon: 'sun' });
    const occurrences = buildDayOccurrences([math, wake], DATE, ctx());
    expect(findPlannedWakeUp(occurrences)).toBe(8 * 60);
  });

  it('falls back to the earliest block of the day', () => {
    const occurrences = buildDayOccurrences([physics, math], DATE, ctx());
    expect(findPlannedWakeUp(occurrences)).toBe(8 * 60 + 30);
  });
});

describe('conflicts', () => {
  it('detects overlapping blocks', () => {
    const a = { ...buildDayOccurrences([makeTask({ id: 'a', start: '09:00', end: '10:00', date: DATE })], DATE, ctx())[0] };
    const b = { ...buildDayOccurrences([makeTask({ id: 'b', start: '09:30', end: '10:30', date: DATE })], DATE, ctx())[0] };
    const conflicts = detectScheduleConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
  });
});

/* ------------------------------- JSON v2 ---------------------------------- */

describe('JSON v2 compatibility', () => {
  it('still imports version 1 files', () => {
    const result = validateScheduleText(JSON.stringify({
      version: 1,
      timezone: 'Asia/Tehran',
      tasks: [{ id: 'math-001', name: 'ریاضی', date: '2026-09-03', start: '08:30', end: '09:30', repeat: { type: 'daily' } }],
    }));
    expect(result.ok).toBe(true);
    const migrated = migratePayload(result.payload!);
    expect(migrated.payload.version).toBe(2);
    expect(migrated.tooNew).toBe(false);
    expect(migrated.notes.join(' ')).toContain('نسخه ۱');
  });

  it('warns instead of importing blindly for newer versions', () => {
    const result = validateScheduleText(JSON.stringify({ version: 9, tasks: [] }));
    const migrated = migratePayload(result.payload!);
    expect(migrated.tooNew).toBe(true);
    expect(migrated.notes[0]).toContain('ناسازگار');
  });

  it('accepts fixedTime and dailyOverrides in v2', () => {
    const result = validateScheduleText(JSON.stringify({
      version: 2,
      timezone: 'Asia/Tehran',
      tasks: [{ id: 'a', name: 'کلاس', date: '2026-09-03', start: '16:00', end: '17:30', fixedTime: true }],
      dailyOverrides: [{ taskId: 'a', date: '2026-09-03', timeShiftMinutes: 60 }],
      dayOverrides: [{ date: '2026-09-03', offsetMinutes: 67, actualWakeUpMinutes: 547 }],
    }));
    expect(result.ok).toBe(true);
    const normalized = normalizeTasks(result.payload!, {
      color: 'blue', category: 'study', icon: 'book', priority: 'normal', minutesBefore: 5, categories: ['study'],
    }, '2026-09-01');
    expect(normalized.tasks[0].fixedTime).toBe(true);
  });

  it('maps non-standard field names before validating', () => {
    const normalized = normalizePayloadFields({
      tasks: [{ title: 'ریاضی', from: '08:30', to: '09:30', fixed: true, day: '2026-09-03' }],
    });
    const task = (normalized.payload as { tasks: Record<string, unknown>[] }).tasks[0];
    expect(task.name).toBe('ریاضی');
    expect(task.start).toBe('08:30');
    expect(task.end).toBe('09:30');
    expect(task.fixedTime).toBe(true);
    expect(task.date).toBe('2026-09-03');
    expect(normalized.mappings.length).toBeGreaterThan(3);
  });

  it('still rejects unknown keys after alias mapping', () => {
    const result = validateScheduleText(JSON.stringify({ version: 2, tasks: [{ name: 'x', date: '2026-09-01', start: '08:00', end: '09:00', nonsense: 1 }] }));
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toContain('کلید ناشناخته');
  });

  it('applies import-time date and time transforms', () => {
    const result = validateScheduleText(JSON.stringify({
      version: 2,
      tasks: [{ id: 'a', name: 'ریاضی', date: '2026-09-01', start: '08:30', end: '09:30' }],
    }));
    const normalized = normalizeTasks(
      result.payload!,
      { color: 'blue', category: 'study', icon: 'book', priority: 'normal', minutesBefore: 0, categories: ['study'] },
      '2026-09-05',
      { dateShiftDays: 2, timeShiftMinutes: 60 },
    );
    expect(normalized.tasks[0].date).toBe('2026-09-03');
    expect(normalized.tasks[0].start).toBe('09:30');
    expect(normalized.tasks[0].end).toBe('10:30');
  });

  it('sanitises display text and never executes anything', () => {
    expect(sanitizeDisplayText('ok\u0000')).toBe('ok');
  });
});

/* --------------------------- persistence + backup -------------------------- */

describe('offline persistence', () => {
  beforeAll(async () => {
    const { getDb } = await import('@/services/db');
    await getDb().open();
  });

  beforeEach(async () => {
    const { getDb } = await import('@/services/db');
    await taskRepository.clearAll();
    await getDb().dayOverrides.clear();
    await getDb().meta.clear();
  });

  it('persists a daily override offline and reloads it', async () => {
    await taskRepository.put(math);
    await dayOverrideRepository.put(override({ globalShiftMinutes: 60 }));
    const stored = await dayOverrideRepository.get(DATE);
    expect(stored?.globalShiftMinutes).toBe(60);
    const occurrences = buildDayOccurrences([math], DATE, {
      ...ctx(),
      dayOverrides: new Map([[DATE, stored!]]),
    });
    expect(occurrences[0].startMinutes).toBe(9 * 60 + 30);
  });

  it('removing the override restores the template time', async () => {
    await dayOverrideRepository.put(override({ globalShiftMinutes: 60 }));
    await dayOverrideRepository.remove(DATE);
    expect(await dayOverrideRepository.get(DATE)).toBeUndefined();
  });

  it('creates and restores a local backup atomically', async () => {
    await taskRepository.put(math);
    const backup = await importExportService.createBackup('test');
    await taskRepository.replaceDefinitions([physics], false);
    expect((await taskRepository.list()).map((t) => t.id)).toEqual(['physics']);
    const restored = await importExportService.restoreBackup(backup.id);
    expect(restored.tasks).toBe(1);
    expect((await taskRepository.list()).map((t) => t.id)).toEqual(['math']);
  });

  it('exports fixedTime and overrides, and the result re-imports', async () => {
    await taskRepository.put(math);
    await taskRepository.put(photoshop);
    await dayOverrideRepository.put(override({ globalShiftMinutes: 60 }));
    const json = await importExportService.export({ includeDayOverrides: true });
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.tasks.find((t: { id: string }) => t.id === 'ps').fixedTime).toBe(true);
    expect(parsed.dayOverrides[0].offsetMinutes).toBe(60);
    const outcome = await importExportService.parse(json, '2026-09-05');
    expect(outcome.preview).not.toBeNull();
    expect(outcome.structuralIssues).toHaveLength(0);
  });

  it('detects duplicates by name + date + start', async () => {
    await taskRepository.put(makeTask({ id: 'existing', name: 'ریاضی', date: '2026-09-05', start: '08:30', end: '09:30' }));
    const outcome = await importExportService.parse(
      JSON.stringify({
        version: 2,
        tasks: [{ id: 'other-id', name: 'ریاضی', date: '2026-09-05', start: '08:30', end: '09:30' }],
      }),
      '2026-09-05',
    );
    expect(outcome.preview?.duplicates).toHaveLength(1);
    expect(outcome.preview?.duplicates[0].signal).toBe('name+date+start');
  });

  it('reports a timezone mismatch without altering times', () => {
    expect(importExportService.describeTimezone('Asia/Dubai', 'Asia/Tehran')).toContain('Asia/Dubai');
    expect(importExportService.describeTimezone('Asia/Tehran', 'Asia/Tehran')).toBeNull();
  });

  it('records import history locally', async () => {
    await importExportService.parse(JSON.stringify({ version: 2, tasks: [] }), '2026-09-05');
    const before = await importExportService.getImportHistory();
    await importExportService.apply(
      {
        valid: true, tooNew: false, version: 2, migrationNotes: [], added: [], changed: [], unchanged: [],
        conflicts: [], duplicates: [], invalid: [], duplicateIds: [], completions: [], habits: [],
        categories: [], dayOverrides: [], totalIncoming: 0, fixedCount: 0, recurringCount: 0,
        dateRange: { from: null, to: null }, fileTimezone: null, error: null,
      },
      'merge',
      new Set(),
      {
        importCompletions: false, importHabits: false, importCategories: false, importDayOverrides: false,
        keepHistory: true, idResolution: 'use-imported', categoryMapping: {}, backupBefore: false,
      },
      'test.json',
    );
    const after = await importExportService.getImportHistory();
    expect(after.length).toBe(before.length + 1);
    expect(after[0].source).toBe('test.json');
  });
});
