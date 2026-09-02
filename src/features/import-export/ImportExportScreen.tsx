'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clipboard,
  Copy,
  Database,
  Download,
  FileJson,
  History,
  Info,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { Badge, Button, Card, Chip, EmptyState, Field, Input, Segmented, Switch, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import {
  importExportService,
  type BackupRecord,
  type IdResolution,
  type ImportHistoryEntry,
  type ImportMode,
  type ImportPreview,
} from '@/services/importExport/service';
import type { ValidationIssue } from '@/services/importExport/schema';
import { downloadFile, safeJsonParse } from '@/lib/utils';
import { formatJalaliDate, toPersianDigits } from '@/lib/date/format';
import { describeRecurrence } from '@/lib/schedule/recurrence';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';

type Step = 'source' | 'validate' | 'preview' | 'conflicts' | 'mode' | 'confirm' | 'done';

const TEMPLATES: { id: string; name: string; description: string; json: unknown }[] = [
  {
    id: 'simple',
    name: 'برنامه روزانه ساده',
    description: 'چند بلوک زمانی بدون تکرار',
    json: {
      version: 2,
      timezone: 'Asia/Tehran',
      tasks: [
        { id: 'wake', name: 'بیدار شدن', date: '2026-09-03', start: '08:00', end: '08:30', repeat: { type: 'daily' }, category: 'rest', icon: 'sun', color: 'amber', fixedTime: false },
        { id: 'math', name: 'ریاضی', date: '2026-09-03', start: '08:30', end: '09:30', repeat: { type: 'daily' }, category: 'study', icon: 'calculator', color: 'blue' },
        { id: 'free', name: 'وقت آزاد', date: '2026-09-03', start: '21:30', end: '23:00', repeat: { type: 'daily' }, category: 'fun', icon: 'gamepad', color: 'orange' },
      ],
    },
  },
  {
    id: 'student',
    name: 'برنامه دانش‌آموز',
    description: 'درس‌ها + کلاس ثابت + خواب',
    json: {
      version: 2,
      timezone: 'Asia/Tehran',
      tasks: [
        { id: 'wake-2', name: 'بیدار شدن', date: '2026-09-03', start: '08:00', end: '08:30', repeat: { type: 'daily' }, category: 'rest', icon: 'sun', color: 'amber', reminder: { enabled: true, minutesBefore: 0 } },
        { id: 'math-2', name: 'ریاضی', date: '2026-09-03', start: '08:30', end: '09:30', repeat: { type: 'daily' }, category: 'study', icon: 'calculator', color: 'blue', priority: 'high' },
        { id: 'physics-2', name: 'فیزیک', date: '2026-09-03', start: '09:45', end: '10:45', repeat: { type: 'daily' }, category: 'study', icon: 'atom', color: 'violet' },
        { id: 'chem-2', name: 'شیمی', date: '2026-09-03', start: '11:15', end: '12:15', repeat: { type: 'weekdays' }, category: 'study', icon: 'flask', color: 'teal' },
        { id: 'ps-class', name: 'کلاس فتوشاپ', date: '2026-09-05', start: '16:00', end: '17:30', repeat: { type: 'weekly', days: ['sat', 'mon', 'wed'] }, category: 'class', icon: 'image', color: 'rose', priority: 'high', fixedTime: true, reminder: { enabled: true, minutesBefore: 15 } },
        { id: 'sleep-2', name: 'خواب', date: '2026-09-03', start: '00:00', end: '07:00', repeat: { type: 'daily' }, category: 'rest', icon: 'moon', color: 'slate' },
      ],
    },
  },
  {
    id: 'evenodd',
    name: 'تکرارهای زوج/فرد',
    description: 'even / odd / هر ۳ روز',
    json: {
      version: 2,
      timezone: 'Asia/Tehran',
      tasks: [
        { id: 'bio-odd', name: 'زیست', date: '2026-09-01', start: '14:00', end: '15:00', repeat: { type: 'odd' }, category: 'study', icon: 'dna', color: 'emerald' },
        { id: 'game-even', name: 'بازی', date: '2026-09-02', start: '22:30', end: '23:30', repeat: { type: 'even' }, category: 'fun', icon: 'gamepad', color: 'orange' },
        { id: 'sport-3d', name: 'ورزش', date: '2026-09-01', start: '07:15', end: '08:00', repeat: { type: 'interval', every: 3 }, category: 'health', icon: 'dumbbell', color: 'lime' },
      ],
    },
  },
  {
    id: 'advanced',
    name: 'نمونه پیشرفته',
    description: 'تکرار، بازه تاریخ، زمان ثابت، override',
    json: {
      version: 2,
      timezone: 'Asia/Tehran',
      categories: [{ id: 'study', name: 'درس', icon: 'book', color: 'blue' }],
      tasks: [
        { id: 'adv-1', name: 'مرور ماهانه', date: '2026-09-28', endDate: '2026-12-28', start: '10:00', end: '12:00', repeat: { type: 'monthly' }, category: 'personal', icon: 'target', color: 'amber', priority: 'high', occurrenceLimit: 4, fixedTime: false, reminder: { enabled: true, minutesBefore: 30, atEnd: true }, notes: 'جمع‌بندی ماه', meta: { source: 'template' } },
      ],
      dailyOverrides: [{ taskId: 'adv-1', date: '2026-09-28', timeShiftMinutes: 60 }],
    },
  },
];

export function ImportExportScreen() {
  const { settings } = useSettings();
  const { now, refresh, tasks } = usePlanner();
  const { push } = useToast();

  const [step, setStep] = useState<Step>('source');
  const [text, setText] = useState('');
  const [sourceLabel, setSourceLabel] = useState('—');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fieldMappings, setFieldMappings] = useState<{ from: string; to: string; count: number }[]>([]);
  const [timezoneNote, setTimezoneNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ImportMode>('merge');
  const [idResolution, setIdResolution] = useState<IdResolution>('use-imported');
  const [importCompletions, setImportCompletions] = useState(true);
  const [importHabits, setImportHabits] = useState(true);
  const [importCategories, setImportCategories] = useState(true);
  const [importDayOverrides, setImportDayOverrides] = useState(true);
  const [keepHistory, setKeepHistory] = useState(true);
  const [dateShift, setDateShift] = useState('0');
  const [timeShift, setTimeShift] = useState('0');
  const [newStartDate, setNewStartDate] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [tab, setTab] = useState<'import' | 'export' | 'docs' | 'backup'>('import');
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStorageInfo = useCallback(async () => {
    try {
      setBackups(await importExportService.listBackups());
      setHistory(await importExportService.getImportHistory());
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (tab === 'backup') void loadStorageInfo();
  }, [tab, loadStorageInfo]);

  const transformOptions = useMemo(
    () => ({
      dateShiftDays: Number(dateShift) || 0,
      timeShiftMinutes: Number(timeShift) || 0,
      newStartDate: newStartDate || undefined,
      rangeFrom: rangeFrom || undefined,
      rangeTo: rangeTo || undefined,
    }),
    [dateShift, timeShift, newStartDate, rangeFrom, rangeTo],
  );

  const runParse = useCallback(
    async (value: string, label: string) => {
      setBusy(true);
      setIssues([]);
      setPreview(null);
      setStep('validate');
      try {
        const outcome = await importExportService.parse(value, now.date, transformOptions);
        if (outcome.structuralIssues.length) {
          setIssues(outcome.structuralIssues);
          push('اعتبارسنجی JSON ناموفق بود.', 'error', outcome.structuralIssues[0]?.message);
          return;
        }
        if (!outcome.preview) {
          push('پیش‌نمایش ساخته نشد.', 'error');
          return;
        }
        if (outcome.preview.tooNew) {
          push('این فایل با نسخه جدیدتری ساخته شده و ممکن است ناسازگار باشد.', 'error');
        }
        setPreview(outcome.preview);
        setFieldMappings(outcome.fieldMappings);
        setTimezoneNote(importExportService.describeTimezone(outcome.preview.fileTimezone, settings.timezone));
        setSelected(
          new Set([
            ...outcome.preview.added.map((task) => task.id),
            ...outcome.preview.changed.map((entry) => entry.incoming.id),
          ]),
        );
        setSourceLabel(label);
        setStep(outcome.preview.conflicts.length || outcome.fieldMappings.length ? 'conflicts' : 'preview');
        push('اعتبارسنجی انجام شد.', outcome.preview.valid ? 'success' : 'error');
      } catch (error) {
        push('خطای غیرمنتظره در پردازش فایل.', 'error', error instanceof Error ? error.message : undefined);
      } finally {
        setBusy(false);
      }
    },
    [now.date, transformOptions, push, settings.timezone],
  );

  const readFile = async (file: File) => {
    const content = await file.text();
    setText(content);
    await runParse(content, file.name);
  };

  const toggleSelect = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const outcome = await importExportService.apply(
        preview,
        mode,
        selected,
        {
          importCompletions,
          importHabits,
          importCategories,
          importDayOverrides,
          keepHistory,
          idResolution,
          categoryMapping,
          backupBefore: mode === 'replace' || preview.added.length + preview.changed.length > 20,
        },
        sourceLabel,
      );
      refresh();
      setResult(
        [
          `${toPersianDigits(outcome.added)} تسک جدید`,
          `${toPersianDigits(outcome.updated)} تسک به‌روزرسانی شد`,
          `${toPersianDigits(outcome.duplicatesIgnored)} مورد تکراری نادیده گرفته شد`,
          outcome.removed ? `${toPersianDigits(outcome.removed)} تسک حذف شد` : '',
        ]
          .filter(Boolean)
          .join(' • '),
      );
      setStep('done');
      push('واردسازی با موفقیت انجام شد.', 'success');
      void loadStorageInfo();
    } catch (error) {
      push('اعمال تغییرات ناموفق بود.', 'error', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const doExport = async (kind: 'schedule' | 'backup' | 'effective') => {
    try {
      const json = await importExportService.export({
        kind: kind === 'backup' ? 'backup' : 'schedule',
        includeCompletions: importCompletions,
        includeHabits: importHabits,
        includeSettings: kind === 'backup',
        includeCategories: true,
        includeDayOverrides: true,
        includeShiftHistory: kind === 'backup',
        effectiveForDate: kind === 'effective' ? now.date : null,
        rangeFrom: rangeFrom || null,
        rangeTo: rangeTo || null,
      });
      setExportText(json);
      downloadFile(`planner-${kind}-${now.date}.json`, json);
      push('فایل JSON ساخته و دانلود شد.', 'success');
      if (kind === 'backup') void loadStorageInfo();
    } catch (error) {
      push('خروجی گرفتن ناموفق بود.', 'error', error instanceof Error ? error.message : undefined);
    }
  };

  const jsonStats = useMemo(() => {
    const parsed = safeJsonParse<{ tasks?: unknown[]; completions?: unknown[]; dailyOverrides?: unknown[] }>(text);
    if (!parsed.ok) return null;
    return {
      tasks: parsed.data.tasks?.length ?? 0,
      completions: parsed.data.completions?.length ?? 0,
      overrides: parsed.data.dailyOverrides?.length ?? 0,
      bytes: new Blob([text]).size,
    };
  }, [text]);

  const editorLines = useMemo(() => text.split('\n').length, [text]);

  const prettyPrint = () => {
    const parsed = safeJsonParse<unknown>(text);
    if (!parsed.ok) {
      push('فرمت‌کردن ممکن نیست؛ JSON معتبر نیست.', 'error');
      return;
    }
    setText(JSON.stringify(parsed.data, null, 2));
    push('JSON مرتب شد.', 'success');
  };

  const minify = () => {
    const parsed = safeJsonParse<unknown>(text);
    if (!parsed.ok) {
      push('کوچک‌سازی ممکن نیست؛ JSON معتبر نیست.', 'error');
      return;
    }
    setText(JSON.stringify(parsed.data));
    push('JSON فشرده شد.', 'success');
  };

  const missingCategories = useMemo(() => {
    if (!preview) return [];
    const known = new Set(settings.categories.map((category) => category.id));
    const incoming = new Set<string>();
    for (const task of [...preview.added, ...preview.changed.map((entry) => entry.incoming)]) {
      if (!known.has(task.category)) incoming.add(task.category);
    }
    return Array.from(incoming);
  }, [preview, settings.categories]);

  const STEP_LABELS: { id: Step; label: string }[] = [
    { id: 'source', label: '۱. انتخاب منبع' },
    { id: 'validate', label: '۲. اعتبارسنجی' },
    { id: 'preview', label: '۳. پیش‌نمایش' },
    { id: 'conflicts', label: '۴. تعارض‌ها' },
    { id: 'mode', label: '۵. روش واردسازی' },
    { id: 'confirm', label: '۶. تأیید' },
    { id: 'done', label: '۷. نتیجه' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div>
            <h1 className="text-base font-semibold">ورود و خروج داده</h1>
            <p className="mt-0.5 text-xs text-muted">
              ابزار انتقال برنامه: فایل، کلیپ‌بورد، ویرایشگر، قالب آماده، پشتیبان‌گیری — همه آفلاین.
            </p>
          </div>
          <Segmented
            ariaLabel="بخش"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'import', label: 'ورود' },
              { value: 'export', label: 'خروج' },
              { value: 'backup', label: 'پشتیبان' },
              { value: 'docs', label: 'راهنمای JSON' },
            ]}
          />
        </div>
      </Card>

      {tab === 'import' ? (
        <>
          {/* stepper */}
          <Card>
            <div className="flex flex-wrap items-center gap-1.5 p-3 text-[0.7rem]">
              {STEP_LABELS.map((entry, index) => (
                <span
                  key={entry.id}
                  className={cn(
                    'rounded-full border px-2.5 py-1',
                    step === entry.id
                      ? 'border-transparent bg-accent text-accent-fg'
                      : STEP_LABELS.findIndex((s) => s.id === step) > index
                        ? 'border-transparent bg-accent-soft text-accent'
                        : 'border-line text-subtle',
                  )}
                >
                  {entry.label}
                </span>
              ))}
            </div>
          </Card>

          {/* STEP 1 — source */}
          <Card>
            <div className="space-y-3 p-4">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void readFile(file);
                }}
                className={cn(
                  'rounded-card border-2 border-dashed p-5 text-center transition-colors',
                  dragging ? 'border-accent bg-accent-soft/40' : 'border-line',
                )}
              >
                <FileJson className="mx-auto h-6 w-6 text-muted" />
                <p className="mt-2 text-sm font-medium">فایل JSON را اینجا رها کنید</p>
                <p className="mt-1 text-[0.7rem] text-subtle">یا از دکمه‌های زیر استفاده کنید — منبع فعلی: {sourceLabel}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void readFile(file);
                  }}
                />
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  انتخاب فایل
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const clip = await navigator.clipboard.readText();
                      if (!clip) throw new Error('کلیپ‌بورد خالی است');
                      setText(clip);
                      await runParse(clip, 'کلیپ‌بورد');
                    } catch (error) {
                      push('خواندن کلیپ‌بورد ممکن نشد.', 'error', error instanceof Error ? error.message : undefined);
                    }
                  }}
                >
                  <Clipboard className="h-4 w-4" />
                  از کلیپ‌بورد
                </Button>
                <Button variant="secondary" onClick={() => { setText(JSON.stringify(TEMPLATES[0].json, null, 2)); setSourceLabel('قالب آماده'); push('قالب در ویرایشگر قرار گرفت.', 'info'); }}>
                  <Wand2 className="h-4 w-4" />
                  قالب ساده
                </Button>
                <a href="/example-schedule.json" download className="text-xs text-accent hover:underline">
                  دانلود فایل نمونه
                </a>
              </div>

              {/* editor */}
              <div className="rounded-card border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                  <span className="text-[0.7rem] font-medium text-muted">ویرایشگر JSON</span>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={prettyPrint}>مرتب</Button>
                    <Button size="sm" variant="ghost" onClick={minify}>فشرده</Button>
                    <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(text).then(() => push('کپی شد.', 'success')).catch(() => push('کپی ناموفق بود.', 'error')); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setText(''); setPreview(null); setIssues([]); }}>پاک</Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadFile('schedule.json', text)}>دانلود</Button>
                  </div>
                </div>
                <div className="relative">
                  <div dir="ltr" className="pointer-events-none absolute inset-y-0 start-0 w-10 select-none overflow-hidden border-e border-line bg-surface2/50 py-2 text-end font-mono text-[0.65rem] leading-5 text-subtle">
                    {Array.from({ length: Math.min(editorLines, 400) }, (_, index) => (
                      <div key={index} className="pe-1.5">{index + 1}</div>
                    ))}
                  </div>
                  <Textarea
                    dir="ltr"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder='{"version": 2, "timezone": "Asia/Tehran", "tasks": [ ... ]}'
                    className="min-h-[200px] rounded-none border-0 ps-12 font-mono text-[0.7rem] leading-5 focus:border-0"
                    aria-label="ویرایشگر JSON"
                    style={{ minHeight: 200 }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[0.65rem] text-subtle">
                  <span className="numeral">
                    {toPersianDigits(editorLines)} خط • {jsonStats ? `${toPersianDigits(jsonStats.bytes)} بایت` : '—'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Search className="h-3.5 w-3.5" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="جست‌وجو در متن"
                      className="w-40 rounded-control border border-line bg-surface px-2 py-1 text-[0.65rem]"
                      aria-label="جست‌وجو در JSON"
                    />
                  </div>
                </div>
              </div>

              {/* transforms */}
              <div className="grid gap-3 sm:grid-cols-5">
                <Field label="جابه‌جایی تاریخ (روز)" hint="پیش از اعمال">
                  <Input dir="ltr" value={dateShift} onChange={(event) => setDateShift(event.target.value)} inputMode="numeric" />
                </Field>
                <Field label="جابه‌جایی ساعت (دقیقه)" hint="فقط روی داده‌ی واردشده">
                  <Input dir="ltr" value={timeShift} onChange={(event) => setTimeShift(event.target.value)} inputMode="numeric" />
                </Field>
                <Field label="شروع جدید فایل" hint="تاریخ اول فایل به این روز می‌رود">
                  <Input type="date" value={newStartDate} onChange={(event) => setNewStartDate(event.target.value)} />
                </Field>
                <Field label="از تاریخ">
                  <Input type="date" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} />
                </Field>
                <Field label="تا تاریخ">
                  <Input type="date" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} />
                </Field>
              </div>

              <Button disabled={busy || !text.trim()} onClick={() => void runParse(text, sourceLabel === '—' ? 'ویرایشگر' : sourceLabel)}>
                {busy ? 'در حال بررسی…' : 'اعتبارسنجی و پیش‌نمایش'}
              </Button>
            </div>
          </Card>

          {/* STEP 2 — validation */}
          {issues.length ? (
            <Card className="border-[color-mix(in_oklab,var(--danger)_40%,transparent)]">
              <div className="border-b border-line px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
                  <AlertTriangle className="h-4 w-4" />
                  خطاهای اعتبارسنجی
                </h2>
              </div>
              <ul className="max-h-64 divide-y divide-line overflow-y-auto">
                {issues.slice(0, 40).map((issue, index) => (
                  <li key={`${issue.path}-${index}`} className="flex items-start justify-between gap-3 px-4 py-2 text-xs">
                    <span className="text-muted">{issue.message}</span>
                    <code dir="ltr" className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 font-mono text-[0.65rem] text-subtle">{issue.path}</code>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/* STEP 3/4 — preview + conflicts */}
          {preview ? (
            <>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                    خلاصه‌ی فایل
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="muted">نسخه {toPersianDigits(preview.version)}</Badge>
                    <Badge tone="neutral">{toPersianDigits(preview.totalIncoming)} رکورد</Badge>
                    <Badge tone="accent">{toPersianDigits(preview.recurringCount)} قاعده تکرار</Badge>
                    <Badge tone="warning">{toPersianDigits(preview.fixedCount)} زمان ثابت</Badge>
                  </div>
                </div>
                <div className="grid gap-3 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryRow label="تسک جدید" value={toPersianDigits(preview.added.length)} tone="success" />
                  <SummaryRow label="قابل تغییر" value={toPersianDigits(preview.changed.length)} tone="warning" />
                  <SummaryRow label="بدون تغییر" value={toPersianDigits(preview.unchanged.length)} tone="neutral" />
                  <SummaryRow label="تکراری" value={toPersianDigits(preview.duplicates.length)} tone="warning" />
                  <SummaryRow label="خطا" value={toPersianDigits(preview.invalid.filter((i) => i.errors.length).length)} tone="danger" />
                  <SummaryRow label="هشدار" value={toPersianDigits(preview.invalid.filter((i) => !i.errors.length && i.warnings.length).length)} tone="warning" />
                  <SummaryRow label="تداخل زمانی" value={toPersianDigits(preview.conflicts.length)} tone="danger" />
                  <SummaryRow label="تاریخچه" value={toPersianDigits(preview.completions.length)} tone="neutral" />
                  <div className="sm:col-span-2">
                    <p className="text-subtle">بازه</p>
                    <p className="numeral mt-1">
                      {preview.dateRange.from
                        ? `${formatJalaliDate(preview.dateRange.from, { persianDigits: true, style: 'medium' })} تا ${formatJalaliDate(preview.dateRange.to ?? preview.dateRange.from, { persianDigits: true, style: 'medium' })}`
                        : '—'}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-subtle">منطقه زمانی فایل</p>
                    <p dir="ltr" className="mt-1 text-start">{preview.fileTimezone ?? settings.timezone}</p>
                  </div>
                </div>
                {timezoneNote ? (
                  <div className="mx-4 mb-4 rounded-card border border-[color-mix(in_oklab,var(--warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] p-3 text-[0.7rem] leading-6 text-[var(--warning)]">
                    {timezoneNote} — زمان‌ها تغییر داده نمی‌شوند؛ اگر لازم است ابتدا منطقه‌ی زمانی برنامه را در تنظیمات عوض کنید.
                  </div>
                ) : null}
                {preview.migrationNotes.length ? (
                  <ul className="mx-4 mb-4 space-y-1 text-[0.7rem] text-muted">
                    {preview.migrationNotes.map((note) => <li key={note}>• {note}</li>)}
                  </ul>
                ) : null}
              </Card>

              {fieldMappings.length ? (
                <Card>
                  <div className="border-b border-line px-4 py-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <ArrowRightLeft className="h-4 w-4 text-accent" />
                      نگاشت فیلدهای شناسایی‌شده
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">نام‌های غیراستاندارد به فیلدهای برنامه تبدیل شدند.</p>
                  </div>
                  <ul className="divide-y divide-line text-xs">
                    {fieldMappings.map((mapping) => (
                      <li key={`${mapping.from}-${mapping.to}`} className="flex items-center justify-between px-4 py-2">
                        <code dir="ltr" className="font-mono text-[0.68rem] text-accent">{mapping.from}</code>
                        <span className="text-subtle">→</span>
                        <code dir="ltr" className="font-mono text-[0.68rem]">{mapping.to}</code>
                        <Badge tone="muted">{toPersianDigits(mapping.count)} مورد</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              {missingCategories.length ? (
                <Card>
                  <div className="border-b border-line px-4 py-3">
                    <h2 className="text-sm font-semibold">نگاشت دسته‌بندی‌ها</h2>
                    <p className="mt-0.5 text-xs text-muted">دسته‌بندی‌های فایل که در برنامه وجود ندارند.</p>
                  </div>
                  <div className="space-y-2 p-4">
                    {missingCategories.map((categoryId) => (
                      <div key={categoryId} className="flex flex-wrap items-center gap-2">
                        <code dir="ltr" className="w-28 font-mono text-[0.7rem] text-accent">{categoryId}</code>
                        <span className="text-subtle">→</span>
                        <select
                          value={categoryMapping[categoryId] ?? ''}
                          onChange={(event) => setCategoryMapping((current) => ({ ...current, [categoryId]: event.target.value }))}
                          className="h-9 rounded-control border border-line bg-surface px-2 text-xs"
                          aria-label={`نگاشت دسته ${categoryId}`}
                        >
                          <option value="">ساخت دسته‌بندی جدید</option>
                          {settings.categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              <PreviewList preview={preview} selected={selected} onToggle={toggleSelect} />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep('mode')}>ادامه به انتخاب روش</Button>
                <Button variant="ghost" onClick={() => { setPreview(null); setIssues([]); setStep('source'); }}>
                  <X className="h-4 w-4" />
                  شروع مجدد
                </Button>
              </div>
            </>
          ) : null}

          {/* STEP 5 — mode */}
          {preview && (step === 'mode' || step === 'confirm' || step === 'done') ? (
            <Card>
              <div className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">روش واردسازی</h2>
                <Segmented
                  ariaLabel="روش واردسازی"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'merge', label: 'ادغام' },
                    { value: 'addNew', label: 'فقط جدیدها' },
                    { value: 'updateExisting', label: 'فقط به‌روزرسانی' },
                    { value: 'replace', label: 'جایگزینی کامل' },
                  ]}
                />
                <p className="text-[0.7rem] leading-6 text-muted">
                  {mode === 'merge' && 'ادغام: تسک‌های جدید اضافه و تسک‌های هم‌شناسه به‌روزرسانی می‌شوند؛ بقیه‌ی برنامه دست‌نخورده می‌ماند. (پیش‌فرض امن)'}
                  {mode === 'addNew' && 'فقط جدیدها: هیچ تسک موجودی تغییر نمی‌کند و موارد تکراری نادیده گرفته می‌شوند.'}
                  {mode === 'updateExisting' && 'فقط به‌روزرسانی: تنها تسک‌هایی که شناسه‌ی یکسان دارند تغییر می‌کنند و هیچ تسک جدیدی اضافه نمی‌شود.'}
                  {mode === 'replace' && 'جایگزینی کامل: تعریف تسک‌های فعلی با فایل جایگزین می‌شود. پیش از اجرا یک پشتیبان محلی ساخته می‌شود.'}
                </p>

                {mode === 'replace' ? (
                  <p className="rounded-card border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-3 text-[0.7rem] leading-6 text-[var(--danger)]">
                    این عملیات برنامه فعلی شما را جایگزین می‌کند. تسک‌های فعلی: {toPersianDigits(tasks.length)} — تسک‌های فایل: {toPersianDigits(preview.totalIncoming)}
                  </p>
                ) : null}

                <Field label="تعارض شناسه‌ها">
                  <Segmented
                    ariaLabel="تعارض شناسه"
                    size="sm"
                    value={idResolution}
                    onChange={setIdResolution}
                    options={[
                      { value: 'use-imported', label: 'استفاده از فایل' },
                      { value: 'keep-existing', label: 'نگه‌داشتن فعلی' },
                      { value: 'new-id', label: 'شناسه‌ی جدید' },
                    ]}
                  />
                </Field>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-card border border-line px-3"><Switch checked={importCompletions} onChange={setImportCompletions} label="تاریخچه" /></div>
                  <div className="rounded-card border border-line px-3"><Switch checked={importHabits} onChange={setImportHabits} label="عادت‌ها" /></div>
                  <div className="rounded-card border border-line px-3"><Switch checked={importCategories} onChange={setImportCategories} label="دسته‌بندی‌ها" /></div>
                  <div className="rounded-card border border-line px-3"><Switch checked={importDayOverrides} onChange={setImportDayOverrides} label="جابه‌جایی روزها" /></div>
                  <div className="rounded-card border border-line px-3"><Switch checked={keepHistory} onChange={setKeepHistory} label="حفظ تاریخچه" /></div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => setStep('confirm')}>ادامه</Button>
                  <Button variant="ghost" onClick={() => setSelected(new Set([...preview.added, ...preview.changed.map((entry) => entry.incoming)].map((task) => task.id)))}>انتخاب همه</Button>
                  <Button variant="ghost" onClick={() => setSelected(new Set())}>هیچ‌کدام</Button>
                  <Badge tone="muted">{toPersianDigits(selected.size)} تسک انتخاب‌شده</Badge>
                </div>
              </div>
            </Card>
          ) : null}

          {/* STEP 6 — confirm */}
          {preview && step === 'confirm' ? (
            <Card>
              <div className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">آیا این تغییرات اعمال شوند؟</h2>
                <p className="text-xs text-muted">منبع: {sourceLabel} • روش: {mode === 'merge' ? 'ادغام' : mode === 'addNew' ? 'فقط جدیدها' : mode === 'updateExisting' ? 'فقط به‌روزرسانی' : 'جایگزینی کامل'}</p>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy || !selected.size} onClick={() => void apply()}>اعمال</Button>
                  <Button variant="ghost" onClick={() => setStep('mode')}>بازگشت</Button>
                </div>
              </div>
            </Card>
          ) : null}

          {/* STEP 7 — result */}
          {step === 'done' && result ? (
            <Card>
              <div className="space-y-2 p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--success)]">
                  <CheckCircle2 className="h-4 w-4" />
                  واردسازی با موفقیت انجام شد.
                </h2>
                <p className="text-xs text-muted">{result}</p>
                <Button variant="secondary" onClick={() => { setPreview(null); setText(''); setStep('source'); setResult(null); }}>واردسازی جدید</Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'export' ? (
        <Card>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void doExport('schedule')}><Download className="h-4 w-4" />خروجی برنامه</Button>
              <Button variant="secondary" onClick={() => void doExport('effective')}><Download className="h-4 w-4" />برنامه مؤثر امروز</Button>
              <Button variant="secondary" onClick={() => void doExport('backup')}><Database className="h-4 w-4" />بسته‌ی پشتیبان کامل</Button>
              {exportText ? (
                <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(exportText).then(() => push('کپی شد.', 'success')).catch(() => push('کپی ناموفق بود.', 'error'))}>
                  <Copy className="h-4 w-4" />کپی
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-card border border-line px-3"><Switch checked={importCompletions} onChange={setImportCompletions} label="شامل تاریخچه" /></div>
              <div className="rounded-card border border-line px-3"><Switch checked={importHabits} onChange={setImportHabits} label="شامل عادت‌ها" /></div>
            </div>
            <p className="text-[0.7rem] leading-6 text-muted">
              «برنامه مؤثر امروز» زمان‌های جابه‌جاشده‌ی امروز را می‌نویسد؛ سایر خروجی‌ها قالب تکرار اصلی را حفظ می‌کنند. بسته‌ی پشتیبان شامل تنظیمات، جابه‌جایی‌ها و تاریخچه است.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="از تاریخ (فیلتر خروجی)"><Input type="date" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} /></Field>
              <Field label="تا تاریخ (فیلتر خروجی)"><Input type="date" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} /></Field>
            </div>
            {exportText ? <Textarea dir="ltr" readOnly value={exportText} className="min-h-[240px] font-mono text-[0.7rem]" aria-label="خروجی JSON" /> : null}
          </div>
        </Card>
      ) : null}

      {tab === 'backup' ? (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <h2 className="text-sm font-semibold">پشتیبان‌های محلی</h2>
                <p className="mt-0.5 text-xs text-muted">روی همین دستگاه در IndexedDB؛ هیچ چیزی به بیرون ارسال نمی‌شود.</p>
              </div>
              <Button onClick={() => void importExportService.createBackup('پشتیبان دستی').then(() => { void loadStorageInfo(); push('پشتیبان ساخته شد.', 'success'); })}>
                <Database className="h-4 w-4" />
                ساخت پشتیبان
              </Button>
            </div>
            {backups.length ? (
              <ul className="divide-y divide-line">
                {backups.map((backup) => (
                  <li key={backup.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                    <div>
                      <p className="font-medium">{backup.label}</p>
                      <p className="numeral mt-0.5 text-[0.68rem] text-subtle">
                        {toPersianDigits(new Date(backup.createdAt).toLocaleString('fa-IR'))} • {toPersianDigits(backup.taskCount)} تسک • {backup.kind === 'auto' ? 'خودکار' : 'دستی'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => void importExportService.restoreBackup(backup.id).then((r) => { refresh(); push(`${toPersianDigits(r.tasks)} تسک بازگردانی شد.`, 'success'); }).catch((error: unknown) => push('بازگردانی ناموفق بود.', 'error', error instanceof Error ? error.message : undefined))}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        بازگردانی
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => downloadFile(`${backup.label}.json`, backup.payload)}><Download className="h-3.5 w-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Database className="h-6 w-6" />} title="پشتیبانی ثبت نشده" description="پیش از عملیات‌های بزرگ یا مخرب، به‌صورت خودکار پشتیبان گرفته می‌شود." />
            )}
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-accent" />تاریخچه‌ی واردسازی</h2>
            </div>
            {history.length ? (
              <ul className="divide-y divide-line">
                {history.map((entry, index) => (
                  <li key={index} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                    <div>
                      <p className="font-medium">{entry.source}</p>
                      <p className="numeral mt-0.5 text-[0.68rem] text-subtle">
                        {toPersianDigits(new Date(entry.at).toLocaleString('fa-IR'))} • {entry.mode}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={entry.success ? 'success' : 'danger'}>{entry.success ? 'موفق' : 'ناموفق'}</Badge>
                      <Badge tone="neutral">+{toPersianDigits(entry.added)}</Badge>
                      <Badge tone="muted">~{toPersianDigits(entry.updated)}</Badge>
                      {entry.warnings ? <Badge tone="warning">{toPersianDigits(entry.warnings)} هشدار</Badge> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="تاریخچه‌ای نیست" description="بعد از اولین واردسازی، اینجا دیده می‌شود." />
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'docs' ? <FormatDocs /> : null}
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }) {
  return (
    <div className="rounded-card border border-line p-3">
      <p className="text-[0.68rem] text-subtle">{label}</p>
      <p className="numeral mt-1 text-sm font-semibold">{value}</p>
      <span className={cn('mt-1 block h-1 w-8 rounded-full', tone === 'success' && 'bg-[var(--success)]', tone === 'warning' && 'bg-[var(--warning)]', tone === 'danger' && 'bg-[var(--danger)]', tone === 'neutral' && 'bg-surface3')} />
    </div>
  );
}

function PreviewList({
  preview,
  selected,
  onToggle,
}: {
  preview: ImportPreview;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { settings } = useSettings();
  const [filter, setFilter] = useState<'all' | 'new' | 'changed' | 'unchanged' | 'duplicates' | 'invalid'>('all');

  const rows: { key: string; task: Task; tone: 'success' | 'warning' | 'neutral' | 'danger'; label: string; disabled?: boolean; note?: string }[] = [
    ...preview.added.map((task) => ({ key: task.id, task, tone: 'success' as const, label: 'جدید' })),
    ...preview.changed.map(({ incoming, existing }) => ({ key: incoming.id, task: incoming, tone: 'warning' as const, label: `به‌روزرسانی (قبلاً: ${existing.name})` })),
    ...preview.unchanged.map((task) => ({ key: task.id, task, tone: 'neutral' as const, label: 'بدون تغییر', disabled: true })),
    ...preview.duplicates.map((entry) => ({ key: entry.incoming.id, task: entry.incoming, tone: 'warning' as const, label: 'تکراری احتمالی', note: 'این تسک احتمالاً قبلاً وارد شده است.' })),
  ];

  const invalidRows = preview.invalid.map((issue) => ({
    key: issue.id,
    task: null,
    issue,
  }));

  const filtered = filter === 'all' ? rows : rows.filter((row) => (filter === 'new' ? row.label === 'جدید' : filter === 'changed' ? row.label.startsWith('به‌روزرسانی') : filter === 'unchanged' ? row.label === 'بدون تغییر' : row.label === 'تکراری احتمالی'));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">پیش‌نمایش رکوردها</h2>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'new', 'changed', 'unchanged', 'duplicates'] as const).map((value) => (
            <Chip key={value} active={filter === value} onClick={() => setFilter(value)}>
              {value === 'all' ? 'همه' : value === 'new' ? 'جدید' : value === 'changed' ? 'تغییر' : value === 'unchanged' ? 'بدون تغییر' : 'تکراری'}
            </Chip>
          ))}
        </div>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {filtered.slice(0, 300).map((row) => (
          <div key={`${row.key}-${row.label}`} className={cn('flex items-start gap-3 border-b border-line px-4 py-3', `task-color-${row.task.color}`)}>
            <input
              type="checkbox"
              checked={selected.has(row.key)}
              onChange={() => onToggle(row.key)}
              disabled={row.disabled}
              aria-label={`انتخاب ${row.task.name}`}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: 'var(--task)' }} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{row.task.name}</p>
                <Badge tone={row.tone}>{row.label}</Badge>
                {row.task.fixedTime ? <Badge tone="muted">زمان ثابت</Badge> : null}
                {row.task.repeat.type !== 'none' ? <Badge tone="accent">{describeRecurrence(row.task.repeat, () => '')}</Badge> : null}
              </div>
              <p className="numeral mt-0.5 text-[0.7rem] text-muted">
                {row.task.start} تا {row.task.end} • شروع {formatJalaliDate(row.task.date, { persianDigits: settings.persianDigits, style: 'medium' })}
                {row.task.endDate ? ` • تا ${formatJalaliDate(row.task.endDate, { persianDigits: settings.persianDigits, style: 'medium' })}` : ''}
              </p>
              {row.note ? <p className="mt-0.5 text-[0.68rem] text-[var(--warning)]">{row.note}</p> : null}
            </div>
            <code dir="ltr" className="mt-1 shrink-0 rounded bg-surface2 px-1.5 py-0.5 font-mono text-[0.6rem] text-subtle">{row.task.id}</code>
          </div>
        ))}

        {invalidRows.length ? (
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--danger)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              رکوردهای نامعتبر ({toPersianDigits(invalidRows.length)}) — وارد نمی‌شوند
            </p>
            <ul className="space-y-2 text-[0.7rem]">
              {invalidRows.slice(0, 20).map((row) => (
                <li key={row.key} className="rounded-card border border-line p-2">
                  <p className="font-medium">{row.issue.name || row.issue.id}</p>
                  {row.issue.errors.map((error) => <p key={error} className="text-[var(--danger)]">• {error}</p>)}
                  {row.issue.warnings.map((warning) => <p key={warning} className="text-[var(--warning)]">• {warning}</p>)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview.conflicts.length ? (
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-[var(--danger)]">تداخل‌های زمانی با برنامه‌ی فعلی</p>
            <ul className="space-y-1 text-[0.7rem] text-muted">
              {preview.conflicts.slice(0, 12).map((conflict) => (
                <li key={`${conflict.incoming.id}-${conflict.date}`}>
                  {formatJalaliDate(conflict.date, { persianDigits: true, style: 'medium' })}: «{conflict.incoming.name}» با «{conflict.existing.name}» هم‌پوشانی دارد.
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function FormatDocs() {
  const example = `{
  "version": 2,
  "kind": "schedule",
  "timezone": "Asia/Tehran",
  "categories": [{ "id": "study", "name": "درس", "icon": "book", "color": "blue" }],
  "tasks": [
    {
      "id": "math-001",
      "name": "ریاضی - ویدیوی عقب‌افتاده",
      "date": "2026-09-03",
      "endDate": "2026-12-30",
      "start": "08:30",
      "end": "09:30",
      "repeat": { "type": "daily" },
      "category": "study",
      "icon": "calculator",
      "color": "blue",
      "priority": "high",
      "fixedTime": false,
      "reminder": { "enabled": true, "minutesBefore": 0, "atEnd": false },
      "notes": "فصل ۳",
      "occurrenceLimit": 40
    },
    {
      "id": "photoshop-class",
      "name": "کلاس فتوشاپ",
      "date": "2026-09-05",
      "start": "16:00",
      "end": "17:30",
      "repeat": { "type": "weekly", "days": ["sat", "mon", "wed"] },
      "fixedTime": true
    }
  ],
  "dailyOverrides": [
    { "taskId": "math-001", "date": "2026-09-03", "timeShiftMinutes": 60 }
  ],
  "dayOverrides": [
    { "date": "2026-09-03", "offsetMinutes": 67, "actualWakeUpMinutes": 547 }
  ],
  "completions": [
    { "taskId": "math-001", "date": "2026-09-03", "status": "completed" }
  ]
}`;

  const fields: { name: string; type: string; desc: string }[] = [
    { name: 'version', type: 'number', desc: 'نسخه‌ی قالب؛ فعلاً ۲ (فایل‌های ۱ هم خوانده می‌شوند).' },
    { name: 'kind', type: 'enum', desc: 'schedule یا backup' },
    { name: 'timezone', type: 'string', desc: 'منطقه‌ی زمانی IANA مثل Asia/Tehran' },
    { name: 'tasks[]', type: 'array', desc: 'تعریف تسک‌ها (قالب تکرار حفظ می‌شود)' },
    { name: 'fixedTime', type: 'boolean', desc: 'true = زمان ثابت؛ در جابه‌جایی روزانه حرکت نمی‌کند' },
    { name: 'repeat.type', type: 'enum', desc: 'none | daily | weekly | weekdays | weekends | even | odd | interval | monthly' },
    { name: 'repeat.days', type: 'array', desc: 'sat, sun, mon, tue, wed, thu, fri' },
    { name: 'repeat.until', type: 'date', desc: 'معادل endDate (پذیرفته می‌شود)' },
    { name: 'reminder', type: 'object', desc: 'enabled, minutesBefore, atEnd, sound, vibrate' },
    { name: 'dailyOverrides[]', type: 'array', desc: 'جابه‌جایی یک تسک در یک تاریخ مشخص' },
    { name: 'dayOverrides[]', type: 'array', desc: 'جابه‌جایی کل روز + زمان بیداری واقعی' },
    { name: 'completions[]', type: 'array', desc: 'تاریخچه‌ی انجام‌شده/ردشده' },
    { name: 'categories[]', type: 'array', desc: 'id, name, icon, color' },
    { name: 'settings', type: 'object', desc: 'فقط در بسته‌ی پشتیبان' },
  ];

  const aliases = [
    ['title / task / taskName', 'name'],
    ['from / startTime', 'start'],
    ['to / endTime', 'end'],
    ['fixed / isFixed / pinned', 'fixedTime'],
    ['description / note', 'notes'],
    ['startDate / day', 'date'],
    ['until / repeatUntil', 'endDate'],
    ['colour', 'color'],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Info className="h-4 w-4 text-accent" />قالب JSON نسخه ۲</h2>
          <p className="mt-0.5 text-xs text-muted">تاریخ‌ها میلادی YYYY-MM-DD و ساعت‌ها ۲۴ ساعتی HH:MM. هفته از شنبه شروع می‌شود. فایل‌های نسخه ۱ همچنان کار می‌کنند.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface2/60 text-muted"><tr><th className="p-2 text-start font-medium">فیلد</th><th className="p-2 text-start font-medium">نوع</th><th className="p-2 text-start font-medium">توضیح</th></tr></thead>
            <tbody className="divide-y divide-line">
              {fields.map((field) => (
                <tr key={field.name}>
                  <td dir="ltr" className="p-2 font-mono text-[0.68rem] text-accent">{field.name}</td>
                  <td dir="ltr" className="p-2 font-mono text-[0.65rem] text-subtle">{field.type}</td>
                  <td className="p-2 leading-6 text-muted">{field.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">نام‌های پذیرفته‌شده (alias)</h2></div>
        <ul className="divide-y divide-line text-xs">
          {aliases.map(([alias, canonical]) => (
            <li key={alias} className="flex items-center justify-between gap-3 px-4 py-2">
              <code dir="ltr" className="font-mono text-[0.68rem] text-accent">{alias}</code>
              <span className="text-subtle">→</span>
              <code dir="ltr" className="font-mono text-[0.68rem]">{canonical}</code>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">نمونه‌ی کامل</h2></div>
        <div className="space-y-3 p-4">
          <pre dir="ltr" className="max-h-[420px] overflow-auto rounded-card bg-surface2 p-3 font-mono text-[0.68rem] leading-6">{example}</pre>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(example).then(() => window.dispatchEvent(new CustomEvent('planner:copy-example'))); }}>
              <Copy className="h-4 w-4" />کپی نمونه
            </Button>
            <a href="/example-schedule.json" download className="text-xs text-accent hover:underline">دانلود فایل نمونه</a>
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">امنیت</h2></div>
        <ul className="space-y-1.5 p-4 text-[0.7rem] leading-6 text-muted">
          <li>• JSON فقط به‌عنوان داده خوانده می‌شود؛ هیچ کدی اجرا نمی‌شود و از eval استفاده نمی‌شود.</li>
          <li>• مقادیر متنی پیش از نمایش پاک‌سازی می‌شوند و طول آن‌ها محدود است.</li>
          <li>• فایل‌های نسخه‌ی جدیدتر با هشدار وارد می‌شوند و نه به‌صورت کورکورانه.</li>
          <li>• پیش از عملیات‌های بزرگ یا مخرب، یک پشتیبان محلی ساخته می‌شود و در صورت خطا بازگردانی می‌شود.</li>
        </ul>
      </Card>
    </div>
  );
}
