/**
 * Optional demo data — never applied automatically or permanently.
 * The user explicitly loads it from the Today screen empty state / import screen.
 */

import { addDays } from '@/lib/date/iso';
import { uid } from '@/lib/utils';
import type { Habit, Task } from '@/types';

interface SampleTaskInput {
  name: string;
  start: string;
  end: string;
  repeat: Task['repeat'];
  category: string;
  icon: string;
  color: Task['color'];
  priority: Task['priority'];
  reminder: Task['reminder'];
  notes?: string;
}

const SAMPLE_TASKS: SampleTaskInput[] = [
  {
    name: 'ریاضی — ویدیو و تمرین',
    start: '08:30',
    end: '09:30',
    repeat: { type: 'daily' },
    category: 'study',
    icon: 'calculator',
    color: 'blue',
    priority: 'high',
    reminder: { enabled: true, minutesBefore: 5, atEnd: false, sound: true, vibrate: true },
    notes: 'فصل ۳ + ۱۰ تمرین',
  },
  {
    name: 'فیزیک — مرور جزوه',
    start: '09:45',
    end: '10:45',
    repeat: { type: 'daily' },
    category: 'study',
    icon: 'atom',
    color: 'violet',
    priority: 'normal',
    reminder: { enabled: true, minutesBefore: 5, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'شیمی — حل مسئله',
    start: '11:15',
    end: '12:15',
    repeat: { type: 'weekdays' },
    category: 'study',
    icon: 'flask',
    color: 'teal',
    priority: 'normal',
    reminder: { enabled: true, minutesBefore: 0, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'زیست‌شناسی — خواندن کتاب',
    start: '14:00',
    end: '15:00',
    repeat: { type: 'odd' },
    category: 'study',
    icon: 'dna',
    color: 'emerald',
    priority: 'normal',
    reminder: { enabled: false, minutesBefore: 5, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'کلاس فتوشاپ',
    start: '16:00',
    end: '17:30',
    repeat: { type: 'weekly', days: ['sat', 'mon', 'wed'] },
    category: 'class',
    icon: 'image',
    color: 'rose',
    priority: 'high',
    reminder: { enabled: true, minutesBefore: 15, atEnd: false, sound: true, vibrate: true },
    notes: 'پروژه‌ی رتوش پرتره',
  },
  {
    name: 'تکلیف فتوشاپ',
    start: '19:30',
    end: '20:30',
    repeat: { type: 'weekly', days: ['sat', 'sun', 'tue', 'thu'] },
    category: 'homework',
    icon: 'pencil',
    color: 'pink',
    priority: 'high',
    reminder: { enabled: true, minutesBefore: 0, atEnd: true, sound: true, vibrate: true },
  },
  {
    name: 'کدنویسی — پروژه‌ی شخصی',
    start: '20:30',
    end: '21:30',
    repeat: { type: 'daily' },
    category: 'coding',
    icon: 'code',
    color: 'indigo',
    priority: 'normal',
    reminder: { enabled: true, minutesBefore: 5, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'ESP32 — ساخت مدار',
    start: '20:30',
    end: '21:30',
    repeat: { type: 'weekly', days: ['tue', 'thu'] },
    category: 'electronics',
    icon: 'cpu',
    color: 'cyan',
    priority: 'normal',
    reminder: { enabled: false, minutesBefore: 0, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'یوتیوب — دیدن ویدیوی آموزشی',
    start: '21:30',
    end: '22:15',
    repeat: { type: 'daily' },
    category: 'media',
    icon: 'youtube',
    color: 'red',
    priority: 'low',
    reminder: { enabled: false, minutesBefore: 0, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'تلگرام — بررسی پیام‌ها',
    start: '22:15',
    end: '22:30',
    repeat: { type: 'daily' },
    category: 'social',
    icon: 'message',
    color: 'amber',
    priority: 'low',
    reminder: { enabled: false, minutesBefore: 0, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'وقت آزاد / بازی',
    start: '22:30',
    end: '23:30',
    repeat: { type: 'even' },
    category: 'fun',
    icon: 'gamepad',
    color: 'orange',
    priority: 'low',
    reminder: { enabled: false, minutesBefore: 0, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'ورزش و حرکت کششی',
    start: '07:15',
    end: '08:00',
    repeat: { type: 'weekly', days: ['sat', 'mon', 'wed'] },
    category: 'health',
    icon: 'dumbbell',
    color: 'lime',
    priority: 'normal',
    reminder: { enabled: true, minutesBefore: 10, atEnd: false, sound: true, vibrate: true },
  },
  {
    name: 'خواب',
    start: '00:00',
    end: '07:00',
    repeat: { type: 'daily' },
    category: 'rest',
    icon: 'moon',
    color: 'slate',
    priority: 'normal',
    reminder: { enabled: true, minutesBefore: 30, atEnd: false, sound: true, vibrate: true },
    notes: '۸ ساعت خواب شبانه',
  },
  {
    name: 'مرور هفتگی و برنامه‌ریزی',
    start: '10:00',
    end: '11:00',
    repeat: { type: 'weekends' },
    category: 'personal',
    icon: 'target',
    color: 'amber',
    priority: 'high',
    reminder: { enabled: true, minutesBefore: 10, atEnd: false, sound: true, vibrate: true },
  },
];

export const SAMPLE_HABITS: Omit<Habit, 'id' | 'createdAt'>[] = [
  { name: 'ساعت ۸ بیدار شوم', icon: 'sun', color: 'amber', cadence: 'daily', days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'], reminderTime: '08:00' },
  { name: 'ساعت ۱۲ بخوابم', icon: 'moon', color: 'indigo', cadence: 'daily', days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'], reminderTime: '23:30' },
  { name: '۲ ساعت درس بخوانم', icon: 'study', color: 'blue', cadence: 'weekdays', days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'], reminderTime: null },
  { name: 'تمرین کدنویسی', icon: 'code', color: 'emerald', cadence: 'daily', days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'], reminderTime: null },
  { name: 'تمرین فتوشاپ', icon: 'image', color: 'rose', cadence: 'custom', days: ['sat', 'tue', 'thu'], reminderTime: null },
];

export function buildSampleTasks(todayISO: string): Task[] {
  const timestamp = new Date().toISOString();
  return SAMPLE_TASKS.map((input, index) => ({
    id: `sample-${String(index + 1).padStart(2, '0')}`,
    name: input.name,
    date: addDays(todayISO, -7),
    endDate: addDays(todayISO, 90),
    start: input.start,
    end: input.end,
    repeat: input.repeat,
    category: input.category,
    icon: input.icon,
    color: input.color,
    priority: input.priority,
    reminder: input.reminder,
    notes: input.notes ?? '',
    occurrenceLimit: null,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function buildSampleHabits(): Habit[] {
  const timestamp = new Date().toISOString();
  return SAMPLE_HABITS.map((habit, index) => ({
    ...habit,
    id: `habit-${String(index + 1).padStart(2, '0')}`,
    createdAt: timestamp,
  }));
}

export function buildBlankTask(todayISO: string, partial: Partial<Task> = {}): Task {
  const timestamp = new Date().toISOString();
  return {
    id: uid('task'),
    name: '',
    date: todayISO,
    endDate: null,
    start: '08:00',
    end: '09:00',
    repeat: { type: 'none' },
    category: 'study',
    icon: 'book',
    color: 'blue',
    priority: 'normal',
    reminder: { enabled: true, minutesBefore: 5, atEnd: false, sound: true, vibrate: true },
    notes: '',
    occurrenceLimit: null,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...partial,
  };
}
