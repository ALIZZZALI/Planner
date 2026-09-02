import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  migratePayload,
  normalizeTasks,
  validateScheduleText,
} from '@/services/importExport/schema';
import { importExportService } from '@/services/importExport/service';

const defaults = {
  color: 'blue' as const,
  category: 'study',
  icon: 'book',
  priority: 'normal' as const,
  minutesBefore: 5,
  categories: ['study', 'homework', 'class'],
};

describe('JSON validation', () => {
  it('rejects invalid JSON with a readable message', () => {
    const result = validateScheduleText('{ "tasks": [ }');
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toContain('ساختار JSON نامعتبر');
  });

  it('rejects a missing tasks array', () => {
    const result = validateScheduleText('{"version": 1}');
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path.includes('tasks'))).toBe(true);
  });

  it('rejects unknown keys so typos surface early', () => {
    const result = validateScheduleText('{"version":2,"tasks":[{"name":"x","date":"2026-09-01","start":"08:00","end":"09:00","nonsense":1}]}');
    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toContain('کلید ناشناخته');
  });

  it('maps known aliases (colour -> color) instead of rejecting them', () => {
    const result = validateScheduleText('{"version":2,"tasks":[{"name":"x","date":"2026-09-01","start":"08:00","end":"09:00","colour":"blue"}]}');
    expect(result.ok).toBe(true);
  });

  it('rejects invalid recurrence types', () => {
    const result = validateScheduleText(
      '{"version":1,"tasks":[{"name":"x","date":"2026-09-01","start":"08:00","end":"09:00","repeat":{"type":"hourly"}}]}',
    );
    expect(result.ok).toBe(false);
  });

  it('accepts the documented example payload', () => {
    const result = validateScheduleText(JSON.stringify({
      version: 1,
      timezone: 'Asia/Tehran',
      tasks: [
        {
          id: 'math-001',
          name: 'ریاضی',
          date: '2026-09-03',
          start: '08:30',
          end: '09:30',
          repeat: { type: 'daily' },
          category: 'study',
          icon: 'calculator',
          color: 'blue',
          priority: 'high',
          reminder: { enabled: true, minutesBefore: 0 },
          notes: '',
        },
      ],
    }));
    expect(result.ok).toBe(true);
    expect(result.payload?.tasks[0].id).toBe('math-001');
  });
});

describe('normalization', () => {
  it('reports semantic errors (invalid date/time) per record', () => {
    const parsed = validateScheduleText(
      '{"version":1,"tasks":[{"id":"a","name":"بد","date":"2026-02-30","start":"08:00","end":"09:00"}]}',
    );
    expect(parsed.ok).toBe(true);
    const result = normalizeTasks(parsed.payload!, defaults, '2026-09-01');
    expect(result.tasks).toHaveLength(0);
    expect(result.issues[0].errors[0]).toContain('تاریخ شروع');
  });

  it('flags end date before start date', () => {
    const parsed = validateScheduleText(
      '{"version":1,"tasks":[{"id":"a","name":"x","date":"2026-09-10","endDate":"2026-09-01","start":"08:00","end":"09:00"}]}',
    );
    const result = normalizeTasks(parsed.payload!, defaults, '2026-09-01');
    expect(result.issues[0].errors.join(' ')).toContain('قبل از تاریخ شروع');
  });

  it('detects duplicate ids inside one file', () => {
    const parsed = validateScheduleText(
      '{"version":1,"tasks":[{"id":"dup","name":"a","date":"2026-09-01","start":"08:00","end":"09:00"},{"id":"dup","name":"b","date":"2026-09-01","start":"10:00","end":"11:00"}]}',
    );
    const result = normalizeTasks(parsed.payload!, defaults, '2026-09-01');
    expect(result.duplicateIds).toContain('dup');
  });

  it('downgrades unknown colors with a warning but keeps the task', () => {
    const parsed = validateScheduleText(
      '{"version":1,"tasks":[{"id":"a","name":"x","date":"2026-09-01","start":"08:00","end":"09:00","color":"neon"}]}',
    );
    const result = normalizeTasks(parsed.payload!, defaults, '2026-09-01');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].color).toBe('blue');
    expect(result.issues[0].warnings.join(' ')).toContain('رنگ');
  });

  it('generates ids when they are missing', () => {
    const parsed = validateScheduleText(
      '{"version":1,"tasks":[{"name":"بدون شناسه","date":"2026-09-01","start":"08:00","end":"09:00"}]}',
    );
    const result = normalizeTasks(parsed.payload!, defaults, '2026-09-01');
    expect(result.tasks[0].id).toContain('import-');
  });
});

describe('migration registry', () => {
  it('keeps version 1 payloads and stamps the current version', () => {
    const parsed = validateScheduleText('{"version":1,"tasks":[]}');
    const migrated = migratePayload(parsed.payload!);
    expect(migrated.payload.version).toBe(CURRENT_SCHEMA_VERSION);
    // v1 -> v2 reports the single normalisation note it performed
    expect(migrated.notes).toHaveLength(1);
  });

  it('warns when the file version is newer than the app', () => {
    const parsed = validateScheduleText('{"version":99,"tasks":[]}');
    const migrated = migratePayload(parsed.payload!);
    expect(migrated.tooNew).toBe(true);
    expect(migrated.notes[0]).toContain('ناسازگار');
  });
});

describe('import/export service', () => {
  beforeAll(async () => {
    // repositories are lazily created against the (fake) IndexedDB above
    const { getDb } = await import('@/services/db');
    await getDb().open();
  });

  it('builds a preview separating added items from invalid ones', async () => {
    const outcome = await importExportService.parse(
      JSON.stringify({
        version: 1,
        tasks: [
          { id: 'new-1', name: 'تسک جدید', date: '2026-09-01', start: '08:00', end: '09:00' },
          { id: 'bad-1', name: 'نامعتبر', date: 'oops', start: '08:00', end: '09:00' },
        ],
      }),
      '2026-09-01',
    );
    expect(outcome.preview).not.toBeNull();
    expect(outcome.preview?.added.map((t) => t.id)).toEqual(['new-1']);
    expect(outcome.preview?.invalid).toHaveLength(1);
    expect(outcome.preview?.totalIncoming).toBe(2);
  });

  it('reports structural issues without a preview', async () => {
    const outcome = await importExportService.parse('not json at all', '2026-09-01');
    expect(outcome.preview).toBeNull();
    expect(outcome.structuralIssues.length).toBeGreaterThan(0);
  });

  it('maps completion records and habits', async () => {
    const outcome = await importExportService.parse(
      JSON.stringify({
        version: 1,
        tasks: [{ id: 't1', name: 'a', date: '2026-09-01', start: '08:00', end: '09:00' }],
        completions: [{ taskId: 't1', date: '2026-09-01', status: 'completed' }],
        habits: [{ name: 'خواندن' }],
      }),
      '2026-09-01',
    );
    expect(outcome.preview?.completions[0].id).toBe('t1:2026-09-01');
    expect(outcome.preview?.habits[0].name).toBe('خواندن');
  });
});
