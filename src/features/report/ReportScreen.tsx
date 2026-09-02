'use client';

import { useMemo, useState } from 'react';
import { Clipboard, FileText, Info } from 'lucide-react';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { useLiveData } from '@/services/useLiveData';
import { completionRepository, dayOverrideRepository, focusRepository } from '@/services/repositories';
import { buildDayOccurrences } from '@/lib/schedule/occurrence';
import { addDays, compareISO } from '@/lib/date/iso';
import { formatJalaliDate } from '@/lib/date/format';
import { buildCounselorReport, rangeFromPreset, REPORT_PRESETS, reportRangeLabel, sanitizeReportLine } from '@/lib/report/counselor';
import { isReportableCategory, resolveCategoryKind, CATEGORY_KIND_LABELS } from '@/lib/constants';
import { Badge, Button, Card, Chip, EmptyState, Field, Input, Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { toPersianDigits } from '@/lib/date/format';
import { cn } from '@/lib/utils';

export function ReportScreen() {
  const { settings, update } = useSettings();
  const { tasks, now } = usePlanner();
  const { push } = useToast();
  const [presetDays, setPresetDays] = useState(7);
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const completionsQuery = useLiveData(() => completionRepository.all(), []);
  const focusQuery = useLiveData(() => focusRepository.list(500), []);
  const overridesQuery = useLiveData(() => dayOverrideRepository.list(), []);

  const completions = useMemo(() => completionsQuery.data ?? [], [completionsQuery.data]);
  const focusSessions = useMemo(() => focusQuery.data ?? [], [focusQuery.data]);
  const overrides = useMemo(() => overridesQuery.data ?? [], [overridesQuery.data]);

  const range = useMemo(() => {
    if (custom.from && custom.to && compareISO(custom.to, custom.from) >= 0) {
      const days = Math.round(
        (Date.UTC(...split(custom.to)) - Date.UTC(...split(custom.from))) / 86400000,
      ) + 1;
      return { from: custom.from, to: custom.to, label: `${toPersianDigits(days)} روز` };
    }
    return rangeFromPreset(presetDays, now.date);
  }, [custom, presetDays, now.date]);

  const report = useMemo(() => {
    const byDate = new Map<string, import('@/types').TaskOccurrence[]>();
    let cursor = range.from;
    let guard = 0;
    while (compareISO(cursor, range.to) <= 0 && guard < 400) {
      byDate.set(
        cursor,
        buildDayOccurrences(tasks, cursor, {
          nowDate: range.to,
          nowMinutes: 23 * 60 + 59,
          completions: new Map(completions.map((record) => [record.id, record])),
          dayOverrides: new Map(overrides.map((override) => [override.date, override])),
        }),
      );
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return buildCounselorReport({
      range,
      tasks,
      categories: settings.categories,
      excludedCategories: settings.report.excludedCategories,
      completions,
      focusSessions,
      dayOverrides: overrides,
      occurrencesByDate: byDate,
    });
  }, [range, tasks, settings.categories, settings.report.excludedCategories, completions, focusSessions, overrides]);

  const reportableCount = settings.categories.filter((category) =>
    isReportableCategory(category, settings.report.excludedCategories),
  ).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3 p-4">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-4 w-4 text-accent" />
              بازخورد به مشاور
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              خلاصه‌ای واقعی و بدون قضاوت از کارهای درسی و عمومی. کارهای شخصی هرگز در این گزارش نمی‌آیند.
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted">بازه‌ی گزارش</p>
            <div className="flex flex-wrap gap-1.5">
              {REPORT_PRESETS.map((preset) => (
                <Chip
                  key={preset.days}
                  active={preset.days === presetDays && !custom.from}
                  onClick={() => {
                    setPresetDays(preset.days);
                    setCustom({ from: '', to: '' });
                  }}
                >
                  {preset.label}
                </Chip>
              ))}
              <Chip active={Boolean(custom.from)} onClick={() => setCustom({ from: range.from, to: range.to })}>
                بازه دلخواه
              </Chip>
            </div>
          </div>

          {custom.from ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="از تاریخ (میلادی — نمایش شمسی)">
                <Input type="date" value={custom.from} onChange={(event) => setCustom((current) => ({ ...current, from: event.target.value }))} />
              </Field>
              <Field label="تا تاریخ">
                <Input type="date" value={custom.to} onChange={(event) => setCustom((current) => ({ ...current, to: event.target.value }))} />
              </Field>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{reportRangeLabel(range, settings.persianDigits)}</Badge>
            <Badge tone="neutral">{toPersianDigits(reportableCount)} دسته‌بندی قابل گزارش</Badge>
            <Badge tone="muted">دسته‌های excluded: {toPersianDigits(settings.categories.length - reportableCount)}</Badge>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">متن گزارش</h2>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard
                  .writeText(report.text)
                  .then(() => push('گزارش کپی شد.', 'success'))
                  .catch(() => push('کپی ممکن نشد؛ متن را دستی انتخاب کن.', 'error'));
              }}
            >
              <Clipboard className="h-4 w-4" />
              کپی
            </Button>
          </div>
        </div>
        <div className="space-y-4 p-4">
          {report.hasEnoughData ? (
            report.sections.map((section) => (
              <div key={section.title}>
                <p className="mb-1 text-[0.7rem] font-semibold text-subtle">{section.title}</p>
                <ul className="space-y-1 text-xs leading-7 text-fg">
                  {section.lines.map((line) => (
                    <li key={line}>• {sanitizeReportLine(line)}</li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<Info className="h-6 w-6" />}
              title="برای این بازه اطلاعات کافی نیست"
              description="بعد از چند روز ثبت کار، همین‌جا خلاصه‌ای واقعی ساخته می‌شود."
            />
          )}
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">دسته‌بندی‌های گزارش</h2>
          <p className="mt-0.5 text-xs text-muted">می‌توانی دسته‌ای را از گزارش خارج یا به آن اضافه کنی.</p>
        </div>
        <ul className="divide-y divide-line">
          {settings.categories.map((category) => {
            const excluded = settings.report.excludedCategories.includes(category.id) || category.includeInReport === false;
            return (
              <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{category.name}</p>
                  <p className="mt-0.5 text-[0.65rem] text-subtle">
                    {CATEGORY_KIND_LABELS[resolveCategoryKind(category)]}
                  </p>
                </div>
                <Switch
                  checked={!excluded}
                  onChange={(value) => {
                    const next = new Set(settings.report.excludedCategories);
                    if (value) next.delete(category.id);
                    else next.add(category.id);
                    void update({ report: { ...settings.report, excludedCategories: Array.from(next) } });
                  }}
                  label={excluded ? 'در گزارش نمی‌آید' : 'در گزارش می‌آید'}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <p className={cn('px-1 text-[0.7rem] leading-6 text-subtle')}>
        گزارش فقط از داده‌های ثبت‌شده در همین برنامه ساخته می‌شود؛ چیزی به آن اضافه نمی‌شود. تاریخ‌ها به شمسی نمایش داده می‌شوند
        (مثلاً {formatJalaliDate(range.from, { persianDigits: true, style: 'medium' })}).
      </p>
    </div>
  );
}

function split(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}
