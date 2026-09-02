/**
 * Lightweight natural-language quick-add parser (Persian).
 * It fills a structured draft; the user can always correct it in the editor.
 */

import { addDays, isISODate, normalizeTime, timeToMinutes } from '@/lib/date/iso';
import { PERSIAN_DIGIT_TABLE } from '@/lib/date/format';
import { buildBlankTask } from '@/lib/sampleData';
import type { Task, Weekday } from '@/types';

const WEEKDAY_PATTERNS: { pattern: RegExp; day: Weekday }[] = [
  { pattern: /شنبه(?!\s*ه)/, day: 'sat' },
  { pattern: /یک\s?شنبه/, day: 'sun' },
  { pattern: /دو\s?شنبه/, day: 'mon' },
  { pattern: /سه\s?شنبه/, day: 'tue' },
  { pattern: /چهار\s?شنبه/, day: 'wed' },
  { pattern: /پنج\s?شنبه|پنجشنبه/, day: 'thu' },
  { pattern: /جمعه/, day: 'fri' },
];

const CATEGORY_HINTS: { pattern: RegExp; category: string; icon: string; color: Task['color'] }[] = [
  { pattern: /ریاضی/, category: 'study', icon: 'calculator', color: 'blue' },
  { pattern: /فیزیک/, category: 'study', icon: 'atom', color: 'violet' },
  { pattern: /شیمی/, category: 'study', icon: 'flask', color: 'teal' },
  { pattern: /زیست/, category: 'study', icon: 'dna', color: 'emerald' },
  { pattern: /فتوشاپ|photoshop/i, category: 'media', icon: 'image', color: 'rose' },
  { pattern: /کد|برنامه|پروژه|اسکریپت|جاوا|پایتون/i, category: 'coding', icon: 'code', color: 'indigo' },
  { pattern: /esp32|آردوینو|مدار|برد/i, category: 'electronics', icon: 'cpu', color: 'cyan' },
  { pattern: /یوتیوب|youtube/i, category: 'media', icon: 'youtube', color: 'red' },
  { pattern: /تلگرام|اینستا|پیام/i, category: 'social', icon: 'message', color: 'amber' },
  { pattern: /بازی|گیم/i, category: 'fun', icon: 'gamepad', color: 'orange' },
  { pattern: /ورزش|دویدن|بدنسازی/i, category: 'health', icon: 'dumbbell', color: 'lime' },
  { pattern: /خواب|بخوابم/i, category: 'rest', icon: 'moon', color: 'slate' },
  { pattern: /استراحت|نفس/i, category: 'rest', icon: 'coffee', color: 'slate' },
  { pattern: /درس|مطالعه|خواندن/i, category: 'study', icon: 'book', color: 'blue' },
  { pattern: /تکلیف|تمرین|خانه/i, category: 'homework', icon: 'pencil', color: 'pink' },
  { pattern: /کلاس|آموزش/i, category: 'class', icon: 'presentation', color: 'cyan' },
];

export interface QuickParseResult {
  task: Task;
  interpretation: string[];
}

export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (char) => {
    const persian = PERSIAN_DIGIT_TABLE.indexOf(char);
    if (persian >= 0) return String(persian);
    const arabic = '٠١٢٣٤٥٦٧٨٩'.indexOf(char);
    return String(arabic);
  });
}

export function parseQuickAdd(input: string, todayISO: string, defaults: Partial<Task> = {}): QuickParseResult {
  let text = toLatinDigits(input).trim();
  const interpretation: string[] = [];

  // ---- times: "8:30 تا 9:30" / "16-17:30" / "8:30" / "ساعت 8"
  const timePattern = /(\d{1,2})\s*[:.]\s*(\d{2})|(\d{1,2})\s*(?:ساعت|بعدازظهر|بعد از ظهر|عصر|صبح)?/g;
  const matches: { minutes: number; raw: string; index: number }[] = [];
  for (const match of text.matchAll(timePattern)) {
    const raw = match[0];
    const h = match[1] ? Number(match[1]) : Number(match[3]);
    const m = match[1] ? Number(match[2]) : 0;
    if (h > 23) continue;
    const lower = raw.toLowerCase();
    let hour = h;
    if (/(بعدازظهر|بعد از ظهر|عصر)/.test(lower) && hour < 12) hour += 12;
    matches.push({ minutes: hour * 60 + m, raw, index: match.index ?? 0 });
  }

  let start = '08:00';
  let end = '09:00';
  if (matches.length >= 2) {
    start = normalizeTime(`${Math.floor(matches[0].minutes / 60)}:${matches[0].minutes % 60}`);
    end = normalizeTime(`${Math.floor(matches[1].minutes / 60)}:${matches[1].minutes % 60}`);
    interpretation.push(`زمان: ${start} تا ${end}`);
    for (const match of matches) text = text.replace(match.raw, ' ');
  } else if (matches.length === 1) {
    const base = matches[0].minutes;
    start = normalizeTime(`${Math.floor(base / 60)}:${base % 60}`);
    end = normalizeTime(`${Math.floor(((base + 60) % 1440) / 60)}:${(base + 60) % 60}`);
    interpretation.push(`زمان: ${start} تا ${end} (مدت پیش‌فرض ۱ ساعت)`);
    text = text.replace(matches[0].raw, ' ');
  }

  // ---- date
  let date = todayISO;
  if (/فردا/.test(text)) {
    date = addDays(todayISO, 1);
    interpretation.push('تاریخ: فردا');
    text = text.replace(/فردا/g, ' ');
  } else if (/پس\s?فردا/.test(text)) {
    date = addDays(todayISO, 2);
    interpretation.push('تاریخ: پس‌فردا');
    text = text.replace(/پس\s?فردا/g, ' ');
  } else {
    const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch && isISODate(isoMatch[0])) {
      date = isoMatch[0];
      interpretation.push(`تاریخ: ${date}`);
      text = text.replace(isoMatch[0], ' ');
    }
  }

  // ---- recurrence
  let repeat: Task['repeat'] = { type: 'none' };
  const days: Weekday[] = [];
  for (const { pattern, day } of WEEKDAY_PATTERNS) {
    if (pattern.test(text)) days.push(day);
  }

  if (/هر\s?روز|روزماره|هرروز/.test(text)) {
    repeat = { type: 'daily' };
    interpretation.push('تکرار: هر روز');
    text = text.replace(/هر\s?روز|روزماره|هرروز/g, ' ');
  } else if (/روزهای?\s?کاری|شنبه تا پنجشنبه/.test(text)) {
    repeat = { type: 'weekdays' };
    interpretation.push('تکرار: شنبه تا پنجشنبه');
    text = text.replace(/روزهای?\s?کاری|شنبه تا پنجشنبه/g, ' ');
  } else if (/هر\s?هفته/.test(text)) {
    repeat = { type: 'weekly', days: days.length ? days : ['sat'] };
    interpretation.push('تکرار: هر هفته');
    text = text.replace(/هر\s?هفته/g, ' ');
  } else if (days.length) {
    repeat = { type: 'weekly', days };
    interpretation.push('تکرار: روزهای انتخابی هفته');
  } else if (/زوج/.test(text)) {
    repeat = { type: 'even' };
    interpretation.push('تکرار: روزهای زوج ماه');
    text = text.replace(/زوج/g, ' ');
  } else if (/فرد(?!\s?شد)/.test(text)) {
    repeat = { type: 'odd' };
    interpretation.push('تکرار: روزهای فرد ماه');
    text = text.replace(/فرد(?!\s?شد)/g, ' ');
  } else if (/هر\s?ماه|ماهانه/.test(text)) {
    repeat = { type: 'monthly' };
    interpretation.push('تکرار: هر ماه');
    text = text.replace(/هر\s?ماه|ماهانه/g, ' ');
  } else {
    const everyMatch = text.match(/هر\s*(\d{1,2})\s*روز/);
    if (everyMatch) {
      repeat = { type: 'interval', every: Number(everyMatch[1]) };
      interpretation.push(`تکرار: هر ${everyMatch[1]} روز`);
      text = text.replace(everyMatch[0], ' ');
    }
  }

  for (const { pattern } of WEEKDAY_PATTERNS) text = text.replace(pattern, ' ');

  // ---- name
  const name = text
    .replace(/(\bتا\b|-|–|،|,)+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // ---- category hint
  let category = defaults.category ?? 'study';
  let icon = defaults.icon ?? 'book';
  let color: Task['color'] = defaults.color ?? 'blue';
  for (const hint of CATEGORY_HINTS) {
    if (hint.pattern.test(name)) {
      category = hint.category;
      icon = hint.icon;
      color = hint.color;
      break;
    }
  }

  const task = buildBlankTask(todayISO, {
    ...defaults,
    name: name || 'تسک بدون نام',
    date,
    start,
    end: timeToMinutes(end) <= timeToMinutes(start) ? end : end,
    repeat,
    category,
    icon,
    color,
  });

  if (!interpretation.length) interpretation.push('فقط نام تشخیص داده شد؛ بقیه را در ویرایشگر کامل کنید.');
  return { task, interpretation };
}
