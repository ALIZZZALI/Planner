/**
 * Counselor report — a natural, factual summary written from real records.
 *
 * Rules:
 *  - no scores, no grades, no judgement words, no motivation
 *  - personal categories never appear
 *  - if data is insufficient it says so plainly
 */

import { addDays, compareISO } from '@/lib/date/iso';
import { formatJalaliDate } from '@/lib/date/format';
import { isReportableCategory, resolveCategoryKind } from '@/lib/constants';
import type {
  Category,
  CompletionRecord,
  DayOverride,
  FocusSession,
  Settings,
  Task,
  TaskOccurrence,
} from '@/types';

export interface ReportRange {
  from: string;
  to: string;
  label: string;
}

export const REPORT_PRESETS: { days: number; label: string }[] = [
  { days: 180, label: '۶ ماه' },
  { days: 90, label: '۳ ماه' },
  { days: 60, label: '۲ ماه' },
  { days: 30, label: '۱ ماه' },
  { days: 28, label: '۴ هفته' },
  { days: 21, label: '۳ هفته' },
  { days: 14, label: '۲ هفته' },
  { days: 7, label: '۱ هفته' },
  { days: 6, label: '۶ روز' },
  { days: 5, label: '۵ روز' },
  { days: 4, label: '۴ روز' },
  { days: 3, label: '۳ روز' },
  { days: 2, label: '۲ روز' },
  { days: 1, label: '۱ روز' },
];

export function rangeFromPreset(days: number, today: string): ReportRange {
  return {
    from: addDays(today, -(days - 1)),
    to: today,
    label: REPORT_PRESETS.find((preset) => preset.days === days)?.label ?? `${days} روز`,
  };
}

export interface ReportInput {
  range: ReportRange;
  tasks: Task[];
  categories: Category[];
  excludedCategories: string[];
  completions: CompletionRecord[];
  focusSessions: FocusSession[];
  dayOverrides: DayOverride[];
  /** occurrences per date inside the range */
  occurrencesByDate: Map<string, TaskOccurrence[]>;
}

export interface ReportSection {
  title: string;
  lines: string[];
}

export interface CounselorReport {
  range: ReportRange;
  sections: ReportSection[];
  text: string;
  hasEnoughData: boolean;
}

export function buildCounselorReport(input: ReportInput): CounselorReport {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));

  const reportableTask = (task: Task) => {
    const category = categoryById.get(task.category);
    if (!category) return false;
    return isReportableCategory(category, input.excludedCategories);
  };

  // ---- per-task completion statistics
  interface Stat {
    name: string;
    kind: string;
    planned: number;
    completed: number;
    missed: number;
    minutes: number;
  }
  const stats = new Map<string, Stat>();

  for (const [date, occurrences] of input.occurrencesByDate) {
    if (compareISO(date, input.range.from) < 0 || compareISO(date, input.range.to) > 0) continue;
    for (const occurrence of occurrences) {
      if (!reportableTask(occurrence.task)) continue;
      const entry =
        stats.get(occurrence.taskId) ??
        ({
          name: occurrence.task.name,
          kind: resolveCategoryKind(categoryById.get(occurrence.task.category) ?? ({ id: 'x' } as Category)),
          planned: 0,
          completed: 0,
          missed: 0,
          minutes: 0,
        } as Stat);
      entry.planned += 1;
      if (occurrence.status === 'completed') {
        entry.completed += 1;
        entry.minutes += occurrence.durationMinutes;
      } else if (occurrence.status === 'missed') {
        entry.missed += 1;
      }
      stats.set(occurrence.taskId, entry);
    }
  }

  // ---- schedule disruptions (shifts)
  const shifts = input.dayOverrides.filter(
    (override) =>
      compareISO(override.date, input.range.from) >= 0 &&
      compareISO(override.date, input.range.to) <= 0 &&
      override.globalShiftMinutes !== 0,
  );

  // ---- focus sessions
  const focus = input.focusSessions.filter(
    (session) =>
      compareISO(session.date, input.range.from) >= 0 &&
      compareISO(session.date, input.range.to) <= 0 &&
      (session.actualMinutes ?? 0) > 0,
  );
  const focusMinutes = focus.reduce((total, session) => total + (session.actualMinutes ?? 0), 0);

  const sections: ReportSection[] = [];

  if (!stats.size && !shifts.length && !focus.length) {
    sections.push({
      title: 'خلاصه',
      lines: ['برای این بازه اطلاعات کافی برای گزارش وجود ندارد.'],
    });
    return {
      range: input.range,
      sections,
      text: sections[0].lines.join('\n'),
      hasEnoughData: false,
    };
  }

  // ---- per-subject narrative
  const academic = Array.from(stats.values()).filter((stat) => stat.kind === 'academic');
  const general = Array.from(stats.values()).filter((stat) => stat.kind === 'general');
  const rest = Array.from(stats.values()).filter((stat) => stat.kind === 'rest');

  const subjectLines: string[] = [];
  for (const stat of [...academic, ...general].sort((a, b) => b.planned - a.planned)) {
    if (stat.planned === 0) continue;
    const total = toPersian(stat.planned);
    const done = toPersian(stat.completed);
    if (stat.completed === stat.planned) {
      subjectLines.push(`${stat.name} طبق برنامه پیش رفت و هر ${total} جلسه انجام شد.`);
    } else if (stat.completed === 0) {
      subjectLines.push(`${stat.name} در این بازه انجام نشد و ${total} جلسه باقی مانده است.`);
    } else {
      const remaining = toPersian(stat.planned - stat.completed);
      subjectLines.push(`${stat.name} ${done} جلسه از ${total} جلسه انجام شد و ${remaining} جلسه باقی مانده.`);
    }
  }
  if (subjectLines.length) sections.push({ title: 'موضوع‌ها', lines: subjectLines });

  // ---- video/lesson style wording for tasks that look like media
  const mediaTasks = Array.from(stats.values()).filter((stat) => stat.kind === 'academic' && /ویدیو|درس|فصل/.test(stat.name));
  if (mediaTasks.length) {
    sections.push({
      title: 'محتوای آموزشی',
      lines: mediaTasks.map((stat) =>
        stat.completed === stat.planned
          ? `ویدیوهای ${stat.name} طبق برنامه کامل دیده شد.`
          : `از ویدیوهای ${stat.name} ${toPersian(stat.completed)} مورد از ${toPersian(stat.planned)} مورد دیده شد.`,
      ),
    });
  }

  // ---- shifts / start times
  if (shifts.length) {
    const lateDays = shifts.filter((shift) => shift.globalShiftMinutes > 0).length;
    sections.push({
      title: 'شروع روز و جابه‌جایی برنامه',
      lines: [
        `در ${toPersian(lateDays)} روز شروع مطالعه دیرتر از برنامه بود و برنامه همان روز جابه‌جا شد.`,
        'باقی برنامه در همان روزها با همان جابه‌جایی اجرا شد.',
      ],
    });
  } else {
    sections.push({
      title: 'شروع روز',
      lines: ['در این بازه جابه‌جایی برنامه‌ی روزانه ثبت نشد و برنامه طبق زمان‌بندی اجرا شد.'],
    });
  }

  // ---- focus
  if (focus.length) {
    sections.push({
      title: 'جلسات تمرکز',
      lines: [
        `${toPersian(focus.length)} جلسه تمرکز ثبت شد و مجموع آن ${toPersian(Math.round(focusMinutes / 6) / 10)} ساعت بود.`,
      ],
    });
  }

  // ---- rest context (only as context, never as judgement)
  if (rest.length) {
    const restMinutes = rest.reduce((total, stat) => total + stat.minutes, 0);
    if (restMinutes > 0) {
      sections.push({
        title: 'استراحت',
        lines: [
          `زمان استراحت و سرگرمی ثبت‌شده حدود ${toPersian(Math.round(restMinutes / 6) / 10)} ساعت بود و بخشی از برنامه‌ی روزانه محسوب می‌شود.`,
        ],
      });
    }
  }

  // ---- remaining backlog
  const backlog = Array.from(stats.values())
    .filter((stat) => stat.missed > 0)
    .sort((a, b) => b.missed - a.missed);
  if (backlog.length) {
    sections.push({
      title: 'موارد عقب‌افتاده',
      lines: [
        `موارد عقب‌افتاده فعلی بیشتر مربوط به ${backlog.slice(0, 3).map((stat) => stat.name).join(' و ')} است.`,
      ],
    });
  }

  const text = sections
    .map((section) => section.lines.join(' '))
    .join('\n\n');

  return { range: input.range, sections, text, hasEnoughData: true };
}

export function reportRangeLabel(range: ReportRange, persianDigits = true): string {
  const from = formatJalaliDate(range.from, { persianDigits, style: 'medium' });
  const to = formatJalaliDate(range.to, { persianDigits, style: 'medium' });
  return `${from} تا ${to} (${range.label})`;
}

function toPersian(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

/** Guard: never let imported/provided text leak HTML into the report. */
export function sanitizeReportLine(line: string): string {
  return line.replace(/[<>]/g, '').slice(0, 600);
}

export function reportSettingsOf(settings: Settings): string[] {
  return settings.report.excludedCategories;
}
