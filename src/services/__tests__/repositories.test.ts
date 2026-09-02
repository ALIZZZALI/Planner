import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  completionRepository,
  taskRepository,
  habitRepository,
  settingsRepository,
} from '@/services/repositories';
import { buildDayOccurrences } from '@/lib/schedule/occurrence';
import { makeTask } from '@/lib/schedule/__tests__/helpers';

describe('repository layer (IndexedDB)', () => {
  beforeAll(async () => {
    const { getDb } = await import('@/services/db');
    await getDb().open();
  });

  beforeEach(async () => {
    const db = await getDbRaw();
    await taskRepository.clearAll();
    await db.habits.clear();
    await db.habitLogs.clear();
    await db.settings.clear();
  });

  it('stores and lists tasks', async () => {
    await taskRepository.put(makeTask({ id: 't1', name: 'ریاضی' }));
    await taskRepository.put(makeTask({ id: 't2', name: 'فیزیک', date: '2026-09-02' }));
    const all = await taskRepository.list();
    expect(all.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    expect(await taskRepository.exists('t1')).toBe(true);
  });

  it('archives a task without deleting it', async () => {
    await taskRepository.put(makeTask({ id: 't1' }));
    await taskRepository.archive('t1', true);
    expect((await taskRepository.get('t1'))?.archived).toBe(true);
    expect((await taskRepository.listActive())).toHaveLength(0);
  });

  it('keeps completion history separate from recurrence definitions', async () => {
    const task = makeTask({ id: 't1', date: '2026-09-01', repeat: { type: 'daily' } });
    await taskRepository.put(task);

    await completionRepository.set('t1', '2026-09-01', 'completed');
    await completionRepository.set('t1', '2026-09-02', 'skipped');

    const history = await completionRepository.forTask('t1');
    expect(history).toHaveLength(2);
    expect((await completionRepository.get('t1', '2026-09-01'))?.status).toBe('completed');

    // the definition is untouched
    const stored = await taskRepository.get('t1');
    expect(stored?.repeat.type).toBe('daily');
    expect(stored?.date).toBe('2026-09-01');

    // removing a completion restores the scheduled state
    await completionRepository.set('t1', '2026-09-01', null);
    expect(await completionRepository.get('t1', '2026-09-01')).toBeUndefined();
  });

  it('deleting a task also removes its history', async () => {
    await taskRepository.put(makeTask({ id: 't1' }));
    await completionRepository.set('t1', '2026-09-01', 'completed');
    await taskRepository.remove('t1');
    expect(await completionRepository.forTask('t1')).toHaveLength(0);
  });

  it('replaces definitions while keeping history', async () => {
    await taskRepository.put(makeTask({ id: 'old' }));
    await completionRepository.set('old', '2026-09-01', 'completed');
    await taskRepository.replaceDefinitions([makeTask({ id: 'new' })], true);
    expect(await taskRepository.list()).toHaveLength(1);
    expect(await completionRepository.forTask('old')).toHaveLength(1);

    await taskRepository.replaceDefinitions([makeTask({ id: 'new' })], false);
    expect(await completionRepository.all()).toHaveLength(0);
  });

  it('derives occurrence status from the stored history', async () => {
    const task = makeTask({ id: 't1', date: '2026-09-05', repeat: { type: 'daily' } });
    await taskRepository.put(task);
    await completionRepository.set('t1', '2026-09-05', 'completed');

    const records = await completionRepository.forDate('2026-09-05');
    const ctx = {
      nowDate: '2026-09-05',
      nowMinutes: 9 * 60,
      completions: new Map(records.map((record) => [record.id, record])),
    };
    const occurrences = buildDayOccurrences([task], '2026-09-05', ctx);
    expect(occurrences[0].status).toBe('completed');
  });

  it('persists habits and toggles their logs', async () => {
    const { getDb } = await import('@/services/db');
    const db = getDb();
    await habitRepository.put({
      id: 'h1',
      name: 'ساعت ۸ بیدار شوم',
      icon: 'sun',
      color: 'amber',
      cadence: 'daily',
      days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'],
      reminderTime: null,
      createdAt: new Date().toISOString(),
    });
    expect(await habitRepository.toggle('h1', '2026-09-05')).toBe(true);
    expect(await habitRepository.toggle('h1', '2026-09-05')).toBe(false);
    expect(await db.habitLogs.count()).toBe(1);
    await habitRepository.remove('h1');
    expect(await db.habitLogs.count()).toBe(0);
    void db;
  });

  it('merges settings with defaults so new keys never break stored data', async () => {
    const stored = await settingsRepository.load();
    expect(stored.timezone).toBe('Asia/Tehran');
    expect(stored.showSections.timeline).toBe(true);

    await settingsRepository.save({ theme: 'dark', showSections: { ...stored.showSections, habits: false } });
    const next = await settingsRepository.load();
    expect(next.theme).toBe('dark');
    expect(next.showSections.habits).toBe(false);
    expect(next.showSections.focus).toBe(true);
    expect(next.version).toBe(1);

    await settingsRepository.reset();
    expect((await settingsRepository.load()).theme).toBe('system');
  });
});

async function getDbRaw() {
  const { getDb } = await import('@/services/db');
  return getDb();
}
