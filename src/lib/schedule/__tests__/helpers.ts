import type { Task } from '@/types';

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task',
    name: 'تسک آزمایشی',
    date: '2026-09-01',
    endDate: null,
    start: '08:30',
    end: '09:30',
    repeat: { type: 'daily' },
    category: 'study',
    icon: 'book',
    color: 'blue',
    priority: 'normal',
    reminder: { enabled: false, minutesBefore: 0, atEnd: false, sound: true, vibrate: true },
    notes: '',
    occurrenceLimit: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
