'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Lock, Move, Wand2 } from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import { Button, Field, Input, Select, Switch, Textarea, Chip, Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { buildBlankTask } from '@/lib/sampleData';
import { parseQuickAdd } from '@/lib/schedule/quickParse';
import { describeRecurrence } from '@/lib/schedule/recurrence';
import { addDays, compareISO, isISODate, isTimeString, timeToMinutes, WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/lib/date/iso';
import { COLOR_LABELS, COLOR_TOKENS, ICON_LABELS, ICON_NAMES, PRIORITY_LABELS, RECURRENCE_OPTIONS } from '@/lib/constants';
import { TaskIcon } from '@/lib/icons';
import { formatJalaliDate } from '@/lib/date/format';
import { cn } from '@/lib/utils';
import type { ColorToken, Priority, RecurrenceRule, Task, Weekday } from '@/types';

interface TaskEditorContextValue {
  openEditor: (task?: Task, dateISO?: string) => void;
  openQuickAdd: () => void;
}

const TaskEditorContext = createContext<TaskEditorContextValue | null>(null);

export function useTaskEditor() {
  const context = useContext(TaskEditorContext);
  if (!context) throw new Error('useTaskEditor باید داخل TaskEditorProvider استفاده شود.');
  return context;
}

export function TaskEditorProvider({ children }: { children: ReactNode }) {
  const { saveTask, deleteTask } = usePlanner();
  const { settings } = useSettings();
  const { push } = useToast();
  const [draft, setDraft] = useState<Task | null>(null);
  const [mode, setMode] = useState<'form' | 'quick'>('form');
  const [quickText, setQuickText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isNew, setIsNew] = useState(true);

  const openEditor = useCallback(
    (task?: Task, dateISO?: string) => {
      const base =
        task ??
        buildBlankTask(dateISO ?? '', {
          color: settings.accent,
          category: settings.categories[0]?.id ?? 'study',
          reminder: {
            enabled: settings.notifications.enabled,
            minutesBefore: settings.notifications.defaultMinutesBefore,
            atEnd: settings.notifications.atEnd,
            sound: settings.notifications.sound,
            vibrate: settings.notifications.vibrate,
          },
        });
      setDraft({ ...base, date: dateISO ?? base.date });
      setIsNew(!task);
      setErrors({});
      setMode('form');
    },
    [settings],
  );

  const openQuickAdd = useCallback(() => {
    setDraft(buildBlankTask(''));
    setMode('quick');
    setQuickText('');
    setIsNew(true);
    setErrors({});
  }, []);

  const close = useCallback(() => setDraft(null), []);

  const validate = useCallback((task: Task) => {
    const next: Record<string, string> = {};
    if (!task.name.trim()) next.name = 'نام تسک را بنویسید.';
    if (!isISODate(task.date)) next.date = 'تاریخ شروع معتبر نیست.';
    if (task.endDate && !isISODate(task.endDate)) next.endDate = 'تاریخ پایان معتبر نیست.';
    if (task.endDate && isISODate(task.date) && compareISO(task.endDate, task.date) < 0) {
      next.endDate = 'تاریخ پایان باید بعد از تاریخ شروع باشد.';
    }
    if (!isTimeString(task.start)) next.start = 'ساعت شروع معتبر نیست (مثال ۰۸:۳۰).';
    if (!isTimeString(task.end)) next.end = 'ساعت پایان معتبر نیست.';
    if (
      isTimeString(task.start) &&
      isTimeString(task.end) &&
      timeToMinutes(task.end) === timeToMinutes(task.start)
    ) {
      next.end = 'ساعت پایان نمی‌تواند برابر ساعت شروع باشد.';
    }
    if (task.repeat.type === 'weekly' && !task.repeat.days?.length) {
      next.repeat = 'برای تکرار هفتگی حداقل یک روز انتخاب کنید.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, []);

  const submit = useCallback(async () => {
    if (!draft) return;
    if (!validate(draft)) {
      push('لطفاً خطاهای فرم را برطرف کنید.', 'error');
      return;
    }
    try {
      await saveTask(draft);
      push(isNew ? 'تسک ذخیره شد.' : 'تغییرات ذخیره شد.', 'success');
      setDraft(null);
    } catch (error) {
      push('ذخیره‌سازی ناموفق بود.', 'error', error instanceof Error ? error.message : undefined);
    }
  }, [draft, validate, saveTask, push, isNew]);

  const remove = useCallback(async () => {
    if (!draft) return;
    try {
      await deleteTask(draft.id);
      push('تسک حذف شد. تاریخچه‌ی انجام‌شده‌ها هم پاک شد.', 'info');
      setDraft(null);
    } catch (error) {
      push('حذف ناموفق بود.', 'error', error instanceof Error ? error.message : undefined);
    }
  }, [draft, deleteTask, push]);

  const applyQuickAdd = useCallback(() => {
    if (!quickText.trim()) {
      push('چیزی برای افزودن ننوشتید.', 'error');
      return;
    }
    const { task, interpretation } = parseQuickAdd(quickText, draft?.date || '', {
      color: settings.accent,
      category: settings.categories[0]?.id ?? 'study',
    });
    if (!task.date) {
      push('ابتدا تاریخ پیش‌فرض را مشخص کنید یا تاریخ را در متن بنویسید.', 'error');
      return;
    }
    setDraft(task);
    setMode('form');
    push('پیش‌نویس ساخته شد؛ بازبینی و ذخیره کنید.', 'info', interpretation.join(' • '));
  }, [quickText, draft?.date, settings, push]);

  const value = useMemo(() => ({ openEditor, openQuickAdd }), [openEditor, openQuickAdd]);

  return (
    <TaskEditorContext.Provider value={value}>
      {children}
      <Modal
        open={draft !== null}
        onClose={close}
        size="lg"
        title={mode === 'quick' ? 'افزودن سریع' : isNew ? 'تسک جدید' : 'ویرایش تسک'}
        description={
          mode === 'quick'
            ? 'به زبان خودتان بنویسید؛ سیستم زمان و تکرار را حدس می‌زند.'
            : 'همه‌ی فیلدها اختیاری هستند به‌جز نام و زمان‌ها.'
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            {!isNew ? (
              <Button variant="danger" size="sm" onClick={remove}>
                حذف تسک
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={close}>
                انصراف
              </Button>
              <Button onClick={submit}>{isNew ? 'افزودن' : 'ذخیره'}</Button>
            </div>
          </div>
        }
      >
        {draft ? (
          mode === 'quick' ? (
            <div className="space-y-4">
              <Field
                label="متن تسک"
                hint="مثال: ریاضی ۸:۳۰ تا ۹:۳۰ هر روز شنبه و دوشنبه"
              >
                <Input
                  autoFocus
                  value={quickText}
                  onChange={(event) => setQuickText(event.target.value)}
                  placeholder="فیزیک 16:00 تا 17:30 هر روز"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyQuickAdd();
                  }}
                />
              </Field>
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                {['هر روز', 'شنبه و دوشنبه', 'زوج', 'فرد', 'فردا'].map((sample) => (
                  <Chip key={sample} onClick={() => setQuickText((t) => `${t} ${sample}`.trim())}>
                    {sample}
                  </Chip>
                ))}
              </div>
              <Button variant="soft" onClick={applyQuickAdd} className="w-full">
                <Wand2 className="h-4 w-4" />
                ساخت پیش‌نویس
              </Button>
            </div>
          ) : (
            <TaskForm
              draft={draft}
              errors={errors}
              onChange={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
            />
          )
        ) : null}
      </Modal>
    </TaskEditorContext.Provider>
  );
}

function TaskForm({
  draft,
  errors,
  onChange,
}: {
  draft: Task;
  errors: Record<string, string>;
  onChange: (patch: Partial<Task>) => void;
}) {
  const { settings } = useSettings();
  const categories = settings.categories;

  const setRepeat = (patch: Partial<RecurrenceRule>) =>
    onChange({ repeat: { ...draft.repeat, ...patch } });

  const nextDay = useMemo(() => addDays(draft.date, 1), [draft.date]);

  return (
    <div className="space-y-5">
      <Field label="نام تسک" error={errors.name}>
        <Input
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="مثلاً ریاضی — ویدیو و تمرین"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="تاریخ شروع" error={errors.date} className="col-span-2 sm:col-span-1">
          <Input
            type="date"
            value={draft.date}
            onChange={(event) => onChange({ date: event.target.value })}
          />
        </Field>
        <Field label="ساعت شروع" error={errors.start}>
          <Input
            type="time"
            value={draft.start}
            onChange={(event) => onChange({ start: event.target.value })}
          />
        </Field>
        <Field label="ساعت پایان" error={errors.end} hint="اگر کمتر از شروع باشد، تا روز بعد ادامه می‌یابد.">
          <Input
            type="time"
            value={draft.end}
            onChange={(event) => onChange({ end: event.target.value })}
          />
        </Field>
        <Field label="تاریخ پایان (اختیاری)" error={errors.endDate}>
          <Input
            type="date"
            value={draft.endDate ?? ''}
            onChange={(event) => onChange({ endDate: event.target.value || null })}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="تکرار" error={errors.repeat}>
          <Select
            value={draft.repeat.type}
            onChange={(event) =>
              onChange({
                repeat: { type: event.target.value as RecurrenceRule['type'], days: draft.repeat.days, every: draft.repeat.every },
              })
            }
          >
            {RECURRENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.hint}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="فاصله‌ی تکرار (هر چند روز/هفته/ماه)"
          hint="برای «هر ۳ روز» یا «هر ۲ هفته» مقدار بدهید."
        >
          <Input
            type="number"
            min={1}
            max={365}
            value={draft.repeat.every ?? 1}
            onChange={(event) =>
              setRepeat({ every: event.target.value ? Math.max(1, Number(event.target.value)) : undefined })
            }
            disabled={!['daily', 'interval', 'weekly', 'monthly'].includes(draft.repeat.type)}
          />
        </Field>
      </div>

      {draft.repeat.type === 'dates' ? (
        <Field label="تاریخ‌های مشخص" hint="تاریخ‌ها را به شمسی انتخاب کنید؛ ذخیره‌سازی با تاریخ میلادی انجام می‌شود.">
          <div className="flex flex-wrap gap-2">
            {(draft.repeat.dates ?? []).map((date) => (
              <Chip key={date} active onClick={() => onChange({ repeat: { ...draft.repeat, dates: (draft.repeat.dates ?? []).filter((item) => item !== date) } })}>
                {formatJalaliDate(date, { persianDigits: true, style: 'medium' })} ×
              </Chip>
            ))}
            <label className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
              افزودن تاریخ
              <input
                type="date"
                className="bg-transparent text-xs outline-none"
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  const dates = Array.from(new Set([...(draft.repeat.dates ?? []), value])).sort();
                  onChange({ repeat: { ...draft.repeat, dates } });
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </Field>
      ) : null}

      {draft.repeat.type === 'weekly' ? (
        <Field label="روزهای هفته">
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_ORDER.map((day: Weekday) => (
              <Chip
                key={day}
                active={draft.repeat.days?.includes(day)}
                onClick={() => {
                  const days = draft.repeat.days ?? [];
                  setRepeat({
                    days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
                  });
                }}
              >
                {WEEKDAY_LABELS[day]}
              </Chip>
            ))}
          </div>
        </Field>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="دسته‌بندی">
          <Select value={draft.category} onChange={(event) => onChange({ category: event.target.value })}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="سختی کار" hint="کارهای سخت امتیاز و XP بیشتری می‌دهند.">
          <Select
            value={draft.difficulty ?? 'normal'}
            onChange={(event) => onChange({ difficulty: event.target.value as Task['difficulty'] })}
          >
            <option value="easy">آسان</option>
            <option value="normal">معمولی</option>
            <option value="hard">سخت</option>
          </Select>
        </Field>

        <Field label="اولویت">
          <Select
            value={draft.priority}
            onChange={(event) => onChange({ priority: event.target.value as Priority })}
          >
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="آیکون">
          <Select value={draft.icon} onChange={(event) => onChange({ icon: event.target.value })}>
            {ICON_NAMES.map((icon) => (
              <option key={icon} value={icon}>
                {ICON_LABELS[icon] ?? icon}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="رنگ">
        <div className="flex flex-wrap gap-2">
          {COLOR_TOKENS.map((color) => (
            <button
              key={color}
              type="button"
              title={COLOR_LABELS[color]}
              aria-label={COLOR_LABELS[color]}
              aria-pressed={draft.color === color}
              onClick={() => onChange({ color: color as ColorToken })}
              className={cn(
                'h-8 w-8 rounded-full border-2 transition-transform',
                draft.color === color ? 'scale-110 border-fg' : 'border-transparent',
                `task-color-${color}`,
              )}
              style={{ backgroundColor: 'var(--task)' }}
            />
          ))}
        </div>
      </Field>

      <div className="rounded-card border border-line bg-surface2/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">یادآور</span>
          <Switch
            checked={draft.reminder.enabled}
            onChange={(enabled) => onChange({ reminder: { ...draft.reminder, enabled } })}
            label="فعال"
          />
        </div>
        <div className={cn('space-y-3', !draft.reminder.enabled && 'opacity-50')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="چند دقیقه قبل از شروع" hint="۰ یعنی دقیقاً سر ساعت شروع.">
              <Input
                type="number"
                min={0}
                max={1440}
                value={draft.reminder.minutesBefore}
                onChange={(event) =>
                  onChange({
                    reminder: { ...draft.reminder, minutesBefore: Math.max(0, Number(event.target.value || 0)) },
                  })
                }
                disabled={!draft.reminder.enabled}
              />
            </Field>
            <div className="space-y-2 pt-6">
              <Switch
                checked={draft.reminder.atEnd}
                onChange={(atEnd) => onChange({ reminder: { ...draft.reminder, atEnd } })}
                label="اعلان پایان"
                description="وقتی بازه تمام شد خبر بده."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="محدودیت تعداد تکرار (اختیاری)" hint="مثلاً ۱۰ جلسه. خالی یعنی بی‌نهایت.">
          <Input
            type="number"
            min={1}
            value={draft.occurrenceLimit ?? ''}
            onChange={(event) =>
              onChange({ occurrenceLimit: event.target.value ? Number(event.target.value) : null })
            }
          />
        </Field>
        <Field label="خلاصه‌ی تکرار">
          <div className="flex h-10 items-center">
            <Badge tone="accent">{describeRecurrence(draft.repeat, (d) => WEEKDAY_LABELS[d])}</Badge>
          </div>
        </Field>
      </div>

      <Field label="رفتار زمانی" hint="تسک‌های با زمان ثابت هنگام جابه‌جایی برنامه حرکت نمی‌کنند.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={!draft.fixedTime}
            onClick={() => onChange({ fixedTime: false })}
            className={cn(
              'flex-1 rounded-control border px-3 py-2 text-start text-xs transition-colors',
              !draft.fixedTime ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg',
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <Move className="h-3.5 w-3.5" />
              قابل جابه‌جایی
            </span>
            <span className="mt-0.5 block text-[0.65rem] opacity-80">درس، تمرین، پروژه، سرگرمی…</span>
          </button>
          <button
            type="button"
            aria-pressed={draft.fixedTime === true}
            onClick={() => onChange({ fixedTime: true })}
            className={cn(
              'flex-1 rounded-control border px-3 py-2 text-start text-xs transition-colors',
              draft.fixedTime ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg',
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <Lock className="h-3.5 w-3.5" />
              زمان ثابت
            </span>
            <span className="mt-0.5 block text-[0.65rem] opacity-80">کلاس، آزمون، قرار، سفر…</span>
          </button>
        </div>
      </Field>

      <Field label="یادداشت">
        <Textarea
          value={draft.notes ?? ''}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="مثلاً فصل ۳ + ۱۰ تمرین"
        />
      </Field>

      <div className="flex items-center gap-2 rounded-card border border-dashed border-line p-3 text-xs text-muted">
        <TaskIcon name={draft.icon} className="h-4 w-4" />
        پیش‌نمایش: {draft.name || 'بدون نام'} • {draft.start} تا {draft.end}
        {draft.endDate ? ` • تا ${draft.endDate}` : ''} • {nextDay && ''}
      </div>
    </div>
  );
}
