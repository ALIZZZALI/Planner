'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Lock,
  RotateCcw,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import { Badge, Button, Chip, Field, Input, Segmented } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import {
  MAX_ABS_SHIFT_MINUTES,
  calculateWakeUpDelay,
  findPlannedWakeUp,
  minutesLabel,
  previewScheduleShift,
  type ShiftOptions,
  type ShiftPreview,
} from '@/lib/schedule/dayShift';
import { formatMinutesOfDay, toPersianDigits } from '@/lib/date/format';
import { minutesToTime } from '@/lib/date/iso';
import { TaskIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import type { ShiftScope } from '@/types';

const QUICK = [15, 30, 45, 60, 90, 120];
const QUICK_NEG = [-15, -30, -60];

const SCOPE_LABELS: Record<ShiftScope, string> = {
  all: 'همه کارهای قابل جابه‌جایی',
  incomplete: 'فقط انجام‌نشده‌ها',
  upcoming: 'فقط کارهای بعد از الآن',
  selected: 'انتخاب دستی',
};

export function ShiftPanel({
  open,
  onClose,
  dateISO,
  initialWakeup = false,
}: {
  open: boolean;
  onClose: () => void;
  dateISO: string;
  initialWakeup?: boolean;
}) {
  const { settings, update } = useSettings();
  const { tasks, todayOccurrences, now, dayOverride, applyShift, undoShift, resetDay, recordWakeUp, occurrenceContext } = usePlanner();
  const { push } = useToast();

  const [value, setValue] = useState('30');
  const [mode, setMode] = useState<'normal' | 'smart'>(settings.shift.defaultMode);
  const [scope, setScope] = useState<ShiftScope>(settings.shift.defaultScope);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<ShiftPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [wakeupOpen, setWakeupOpen] = useState(initialWakeup);
  const [wakeupTime, setWakeupTime] = useState<string>('');

  const plannedWakeUp = useMemo(() => findPlannedWakeUp(todayOccurrences), [todayOccurrences]);
  const recordedWakeUp = dayOverride?.actualWakeUpMinutes ?? null;
  const currentShift = dayOverride?.globalShiftMinutes ?? 0;

  useEffect(() => {
    if (open) setWakeupTime(recordedWakeUp != null ? minutesToTime(recordedWakeUp) : minutesToTime(now.minutes));
  }, [open, recordedWakeUp, now.minutes]);

  useEffect(() => {
    if (open) setWakeupOpen(initialWakeup);
  }, [open, initialWakeup]);

  const parsedOffset = useMemo(() => {
    const trimmed = value.trim().replace(/[+]/g, '').replace(/[٫,]/g, '.');
    if (!trimmed) return { ok: false as const, message: 'مقدار جابه‌جایی را وارد کنید.' };
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { ok: false as const, message: 'فقط عدد دقیقه وارد کنید (مثلاً ۳۷ یا ‎-20).' };
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return { ok: false as const, message: 'عدد نامعتبر است.' };
    if (!Number.isInteger(numeric)) {
      return { ok: false as const, message: 'دقیقه باید عدد صحیح باشد؛ کسری پذیرفته نمی‌شود.' };
    }
    if (Math.abs(numeric) > MAX_ABS_SHIFT_MINUTES) {
      return {
        ok: false as const,
        message: `مقدار بیش از حد بزرگ است؛ حداکثر ±${toPersianDigits(MAX_ABS_SHIFT_MINUTES)} دقیقه.`,
      };
    }
    return { ok: true as const, minutes: numeric };
  }, [value]);

  const options: ShiftOptions = useMemo(
    () => ({ mode, scope, selectedIds, nowMinutes: now.minutes, nowOffsetHint: parsedOffset.ok ? parsedOffset.minutes : 0 }),
    [mode, scope, selectedIds, now.minutes, parsedOffset],
  );

  const buildPreview = () => {
    if (!parsedOffset.ok) {
      push(parsedOffset.message, 'error');
      return;
    }
    const result = previewScheduleShift(tasks, dateISO, parsedOffset.minutes, options, occurrenceContext, dayOverride ?? undefined);
    setPreview(result);
    if (scope === 'selected' && !selectedIds.length) {
      push('هیچ تسکی انتخاب نشده است.', 'error');
      return;
    }
    push(
      `پیش‌نمایش آماده شد: ${toPersianDigits(result.counts.moved)} جابه‌جا، ${toPersianDigits(result.counts.fixed)} ثابت.`,
      result.counts.conflicts ? 'error' : 'success',
      result.messages[0],
    );
  };

  const doApply = async () => {
    if (!preview || !parsedOffset.ok) return;
    setBusy(true);
    try {
      await applyShift(dateISO, preview, options, 'جابه‌جایی برنامه امروز');
      push(
        `برنامه امروز ${minutesLabel(preview.offsetMinutes)} جابه‌جا شد.`,
        'success',
        `مجموع جابه‌جایی امروز: ${minutesLabel(preview.effectiveOffset)}`,
      );
      setPreview(null);
      onClose();
    } catch (error) {
      push('اعمال جابه‌جایی ناموفق بود.', 'error', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const saveWakeUp = async () => {
    const [h, m] = wakeupTime.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) {
      push('ساعت بیداری معتبر نیست.', 'error');
      return;
    }
    const actual = h * 60 + m;
    await recordWakeUp(dateISO, actual, plannedWakeUp);
    setWakeupOpen(false);
    push('زمان بیداری امروز ثبت شد.', 'success');
  };

  const wakeUpDelay =
    plannedWakeUp != null && recordedWakeUp != null ? calculateWakeUpDelay(plannedWakeUp, recordedWakeUp) : null;

  const movableTasks = todayOccurrences.filter((occurrence) => !occurrence.task.fixedTime);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="جابه‌جایی برنامه امروز"
      description="فقط امروز تغییر می‌کند؛ قالب تسک‌های تکرارشونده و برنامه فردا دست‌نخورده می‌ماند."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => void undoShift(dateISO).then((done) => push(done ? 'آخرین جابه‌جایی واگرد شد.' : 'چیزی برای واگرد نیست.', done ? 'success' : 'info'))}>
              <Undo2 className="h-4 w-4" />
              واگرد
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={!dayOverride}>
              <RotateCcw className="h-4 w-4" />
              بازگردانی امروز
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              بستن
            </Button>
            <Button disabled={busy || !preview} onClick={() => void doApply()}>
              اعمال {preview ? `(${toPersianDigits(preview.counts.moved)} تسک)` : ''}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ---------------------------- wake-up section --------------------------- */}
        <div className="rounded-card border border-line bg-surface2/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlarmClock className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-semibold">من بیدار شدم</p>
                <p className="text-[0.7rem] text-muted">
                  زمان بیداری واقعی ثبت می‌شود و تسک «بیدار شدن» تغییر نمی‌کند.
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setWakeupOpen((v) => !v)}>
              {recordedWakeUp != null ? 'ویرایش زمان بیداری' : 'ثبت زمان بیداری'}
            </Button>
          </div>

          {wakeupOpen ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="بیدار شدن برنامه‌ریزی‌شده" hint="از برنامه امروز خوانده می‌شود">
                  <Input readOnly value={plannedWakeUp != null ? minutesToTime(plannedWakeUp) : '—'} />
                </Field>
                <Field label="بیدار شدن واقعی">
                  <Input type="time" value={wakeupTime} onChange={(event) => setWakeupTime(event.target.value)} />
                </Field>
                <Field label="اختلاف">
                  <div className="flex h-10 items-center">
                    {wakeUpDelay != null ? (
                      <Badge tone={wakeUpDelay > 0 ? 'warning' : 'success'}>{minutesLabel(wakeUpDelay)}</Badge>
                    ) : (
                      <span className="text-xs text-subtle">پس از ثبت محاسبه می‌شود</span>
                    )}
                  </div>
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => void saveWakeUp()}>
                  ثبت زمان بیداری
                </Button>
                {wakeUpDelay != null && wakeUpDelay > 0 ? (
                  <Button
                    variant="soft"
                    onClick={() => {
                      setValue(String(wakeUpDelay));
                      setScope('upcoming');
                      setWakeupOpen(false);
                      push(
                        `امروز ${toPersianDigits(wakeUpDelay)} دقیقه دیرتر شروع کردی.`,
                        'info',
                        'مقدار جابه‌جایی در فرم زیر قرار گرفت؛ پیش‌نمایش را ببین و تأیید کن.',
                      );
                    }}
                  >
                    جابه‌جایی برنامه {minutesLabel(wakeUpDelay)}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => setWakeupOpen(false)}>
                  فعلاً جابه‌جا نکن
                </Button>
              </div>
            </div>
          ) : wakeUpDelay != null ? (
            <p className="mt-2 text-xs text-muted">
              {wakeUpDelay > 0
                ? `امروز ${toPersianDigits(wakeUpDelay)} دقیقه دیرتر شروع کردی.`
                : 'سر وقت (یا زودتر) شروع کردی.'}
            </p>
          ) : null}
        </div>

        {/* ------------------------------- offset form ---------------------------- */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_NEG.map((minutes) => (
              <Chip key={minutes} onClick={() => setValue(String(minutes))}>
                {minutesLabel(minutes)}
              </Chip>
            ))}
            {QUICK.map((minutes) => (
              <Chip key={minutes} active={parsedOffset.ok && parsedOffset.minutes === minutes} onClick={() => setValue(String(minutes))}>
                {minutesLabel(minutes)}
              </Chip>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="مقدار جابه‌جایی (دقیقه)" error={parsedOffset.ok ? undefined : parsedOffset.message} hint="هر عدد صحیحی؛ منفی = زودتر">
              <Input
                dir="ltr"
                inputMode="numeric"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-label="مقدار جابه‌جایی به دقیقه"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="حالت">
                <Segmented
                  ariaLabel="حالت جابه‌جایی"
                  size="sm"
                  value={mode}
                  onChange={(next) => setMode(next)}
                  options={[
                    { value: 'normal', label: 'معمولی' },
                    { value: 'smart', label: 'هوشمند' },
                  ]}
                />
              </Field>
              <Field label="اعمال روی">
                <Segmented
                  ariaLabel="بازه اعمال"
                  size="sm"
                  value={scope}
                  onChange={(next) => {
                    setScope(next);
                    if (next !== 'selected') setPreview(null);
                  }}
                  options={[
                    { value: 'all', label: 'همه' },
                    { value: 'incomplete', label: 'ناقص‌ها' },
                    { value: 'upcoming', label: 'بعد از الآن' },
                    { value: 'selected', label: 'انتخابی' },
                  ]}
                />
              </Field>
            </div>
          </div>

          <p className="text-[0.7rem] leading-6 text-muted">
            {mode === 'normal'
              ? 'حالت معمولی: دقیقاً همین مقدار به همه‌ی تسک‌های انتخاب‌شده اضافه می‌شود؛ مدت‌زمان‌ها و فاصله‌ها دست‌نخورده می‌مانند.'
              : 'حالت هوشمند: تسک‌های قابل جابه‌جایی طوری چیده می‌شوند که با تسک‌های زمان ثابت (مثل کلاس) تداخل نداشته باشند؛ ترتیب و مدت حفظ می‌شود.'}
            {' '}تسک‌های زمان ثابت هرگز جابه‌جا نمی‌شوند.
          </p>

          {scope === 'selected' ? (
            <div className="space-y-2 rounded-card border border-line p-3">
              <p className="text-[0.7rem] font-medium text-muted">انتخاب تسک‌ها ({toPersianDigits(selectedIds.length)})</p>
              <div className="flex flex-wrap gap-1.5">
                {movableTasks.map((occurrence) => (
                  <Chip
                    key={occurrence.id}
                    active={selectedIds.includes(occurrence.taskId)}
                    onClick={() =>
                      setSelectedIds((current) =>
                        current.includes(occurrence.taskId)
                          ? current.filter((id) => id !== occurrence.taskId)
                          : [...current, occurrence.taskId],
                      )
                    }
                  >
                    {occurrence.task.name}
                  </Chip>
                ))}
                {!movableTasks.length ? (
                  <p className="text-[0.7rem] text-subtle">تسک قابل جابه‌جایی‌ای برای امروز نیست.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={buildPreview} disabled={!parsedOffset.ok}>
              پیش‌نمایش
            </Button>
            {currentShift ? <Badge tone="accent">جابه‌جایی امروز: {minutesLabel(currentShift)}</Badge> : null}
            <Badge tone="muted">پیش‌فرض اعمال: {SCOPE_LABELS[(settings as { defaultShiftScope?: ShiftScope }).defaultShiftScope ?? 'upcoming']}</Badge>
            <button
              type="button"
              className="text-[0.7rem] text-accent hover:underline"
              onClick={() => void update({} as never)}
              hidden
            >
              تنظیم پیش‌فرض
            </button>
          </div>
        </div>

        {/* -------------------------------- preview ------------------------------- */}
        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="success">جابه‌جا: {toPersianDigits(preview.counts.moved)}</Badge>
              <Badge tone="neutral">بدون تغییر: {toPersianDigits(preview.counts.unchanged)}</Badge>
              <Badge tone="muted">زمان ثابت: {toPersianDigits(preview.counts.fixed)}</Badge>
              {preview.counts.skipped ? <Badge tone="warning">رد‌شده: {toPersianDigits(preview.counts.skipped)}</Badge> : null}
              {preview.counts.conflicts ? <Badge tone="danger">تداخل: {toPersianDigits(preview.counts.conflicts)}</Badge> : null}
              {preview.counts.warnings ? <Badge tone="warning">هشدار: {toPersianDigits(preview.counts.warnings)}</Badge> : null}
            </div>

            {preview.messages.length ? (
              <ul className="space-y-1 rounded-card border border-[color-mix(in_oklab,var(--warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--warning)_8%,transparent)] p-3 text-[0.7rem] leading-6 text-[var(--warning)]">
                {preview.messages.slice(0, 8).map((message) => (
                  <li key={message}>• {message}</li>
                ))}
              </ul>
            ) : null}

            <div className="overflow-hidden rounded-card border border-line">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-line bg-surface2/60 px-3 py-2 text-[0.65rem] font-medium text-muted">
                <span>تسک</span>
                <span>قبل</span>
                <span>بعد</span>
              </div>
              <div className="max-h-[300px] divide-y divide-line overflow-y-auto">
                {preview.rows.map((row) => (
                  <div
                    key={row.taskId}
                    className={cn(
                      'grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 text-xs',
                      row.severity === 'conflict' && 'bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]',
                      row.severity === 'warning' && 'bg-[color-mix(in_oklab,var(--warning)_8%,transparent)]',
                      row.skipReason === 'completed' && 'opacity-60',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn('shrink-0', `task-color-${row.color}`)} style={{ color: 'var(--task)' }}>
                        {row.fixedTime ? <Lock className="h-3.5 w-3.5" /> : <TaskIcon name={row.icon} className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.name}</p>
                        <p className="text-[0.62rem] text-subtle">
                          {row.fixedTime
                            ? 'زمان ثابت'
                            : row.skipReason === 'completed'
                              ? 'انجام‌شده — رد شد'
                              : row.skipReason === 'past'
                                ? 'گذشته — رد شد'
                                : row.skipReason === 'not-selected'
                                  ? 'انتخاب نشده'
                                  : `${Math.round((row.newEnd - row.newStart) / 60) > 0 ? `${Math.round((row.newEnd - row.newStart) / 60)} ساعت ` : ''}${(row.newEnd - row.newStart) % 60} دقیقه`}
                        </p>
                        {row.conflicts.length ? (
                          <p className="text-[0.62rem] text-[var(--danger)]">{row.conflicts[0]}</p>
                        ) : null}
                      </div>
                    </div>
                    <span className="numeral text-[0.68rem] text-subtle">
                      {formatMinutesOfDay(row.originalStart, settings)}–{formatMinutesOfDay(row.originalEnd, settings)}
                    </span>
                    <span className={cn('numeral text-[0.68rem] font-medium', row.moved ? 'text-fg' : 'text-subtle')}>
                      {formatMinutesOfDay(row.newStart, settings)}–{formatMinutesOfDay(row.newEnd, settings)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {preview.counts.conflicts ? (
                <Button variant="secondary" size="sm" onClick={() => { setMode('smart'); push('حالت هوشمند انتخاب شد؛ دوباره پیش‌نمایش بگیر.', 'info'); }}>
                  <Sparkles className="h-4 w-4" />
                  جابه‌جایی هوشمند
                </Button>
              ) : null}
              <span className="flex items-center gap-1.5 text-[0.7rem] text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                مجموع امروز پس از اعمال: {minutesLabel(preview.effectiveOffset)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-card border border-dashed border-line p-4 text-xs text-muted">
            <Clock className="h-4 w-4" />
            برای دیدن «قبل / بعد» مقدار جابه‌جایی را وارد کنید و «پیش‌نمایش» را بزنید.
          </div>
        )}
      </div>

      {/* reset confirmation */}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="بازگردانی برنامه امروز"
        description="برنامه امروز به حالت اولیه برگردد؟ تاریخچه‌ی انجام‌شده‌ها و قالب تکرارها حفظ می‌شود."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              لغو
            </Button>
            <Button
              onClick={async () => {
                await resetDay(dateISO);
                setConfirmReset(false);
                setPreview(null);
                push('برنامه امروز به حالت اولیه برگشت.', 'success');
                onClose();
              }}
            >
              بازگردانی
            </Button>
          </div>
        }
      >
        <p className="text-sm">
          جابه‌جایی فعلی: {minutesLabel(currentShift)} — با بازگردانی، زمان یادآورها هم به حالت اول برمی‌گردد.
        </p>
      </Modal>
    </Modal>
  );
}

export const ShiftPanelIcon = ArrowLeftRight;
