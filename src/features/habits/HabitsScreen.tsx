'use client';

import { useMemo, useState } from 'react';
import { Check, Flame, Pencil, Plus, Trash2 } from 'lucide-react';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { Badge, Button, Card, Chip, EmptyState, Field, Input, Select, Switch } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { addDays, weekdayOfISO, WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/lib/date/iso';
import { formatJalaliDate, toPersianDigits } from '@/lib/date/format';
import { uid } from '@/lib/utils';
import { COLOR_TOKENS } from '@/lib/constants';
import { TaskIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import type { Habit, HabitCadence, Weekday } from '@/types';

export function HabitsScreen() {
  const { habits, habitLogs, now, saveHabit, deleteHabit, toggleHabit } = usePlanner();
  const { settings } = useSettings();
  const { push } = useToast();
  const [editing, setEditing] = useState<Habit | null>(null);

  const days = useMemo(() => {
    const list: string[] = [];
    for (let i = 13; i >= 0; i -= 1) list.push(addDays(now.date, -i));
    return list;
  }, [now.date]);

  const logsByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const log of habitLogs) {
      if (!log.done) continue;
      const set = map.get(log.habitId) ?? new Set<string>();
      set.add(log.date);
      map.set(log.habitId, set);
    }
    return map;
  }, [habitLogs]);

  const streak = (habit: Habit) => {
    const done = logsByHabit.get(habit.id) ?? new Set<string>();
    let count = 0;
    let cursor = now.date;
    for (let i = 0; i < 365; i += 1) {
      if (done.has(cursor)) count += 1;
      else if (i > 0) break;
      cursor = addDays(cursor, -1);
    }
    return count;
  };

  const createHabit = () =>
    setEditing({
      id: uid('habit'),
      name: '',
      icon: 'check',
      color: 'emerald',
      cadence: 'daily',
      days: [...WEEKDAY_ORDER],
      reminderTime: null,
      createdAt: new Date().toISOString(),
    });

  if (!habits.length) {
    return (
      <Card>
        <EmptyState
          icon={<Flame className="h-6 w-6" />}
          title="عادتی ثبت نشده"
          description="عادت‌ها جدا از زمان‌بندی‌اند: مثلاً «ساعت ۸ بیدار شوم» یا «۲ ساعت درس بخوانم». عادت‌های امروز در صفحه‌ی امروز هم دیده می‌شوند."
          action={
            <Button onClick={createHabit}>
              <Plus className="h-4 w-4" />
              عادت جدید
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div>
            <h1 className="text-base font-semibold">عادت‌ها</h1>
            <p className="mt-0.5 text-xs text-muted">
              {toPersianDigits(habits.length)} عادت • دو هفته‌ی گذشته
            </p>
          </div>
          <Button onClick={createHabit}>
            <Plus className="h-4 w-4" />
            عادت جدید
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        {habits.map((habit) => {
          const done = logsByHabit.get(habit.id) ?? new Set<string>();
          const weekCount = days.slice(-7).filter((date) => done.has(date)).length;
          return (
            <Card key={habit.id} className={cn('p-3', `task-color-${habit.color}`)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-control"
                    style={{ backgroundColor: 'color-mix(in oklab, var(--task) 18%, transparent)', color: 'var(--task)' }}
                  >
                    <TaskIcon name={habit.icon} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{habit.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="neutral">
                        {habit.cadence === 'daily'
                          ? 'هر روز'
                          : habit.cadence === 'weekdays'
                            ? 'روزهای کاری'
                            : habit.cadence === 'weekends'
                              ? 'جمعه‌ها'
                              : habit.days.map((d) => WEEKDAY_LABELS[d]).join('، ')}
                      </Badge>
                      <Badge tone="accent">هفته‌ی اخیر: {toPersianDigits(weekCount)}/۷</Badge>
                      <Badge tone="success">
                        <Flame className="h-3 w-3" />
                        {toPersianDigits(streak(habit))} روز پیاپی
                      </Badge>
                      {habit.reminderTime ? <Badge tone="muted">یادآور {habit.reminderTime}</Badge> : null}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(habit)} aria-label={`ویرایش ${habit.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`حذف ${habit.name}`}
                    onClick={() => {
                      void deleteHabit(habit.id);
                      push('عادت حذف شد.', 'info');
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto hide-scrollbar">
                <div className="flex gap-1.5">
                  {days.map((date) => {
                    const isDone = done.has(date);
                    const scheduled =
                      habit.cadence === 'daily' ||
                      (habit.cadence === 'weekdays' && weekdayOfISO(date) !== 'fri') ||
                      (habit.cadence === 'weekends' && weekdayOfISO(date) === 'fri') ||
                      (habit.cadence === 'custom' && habit.days.includes(weekdayOfISO(date)));
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => void toggleHabit(habit.id, date)}
                        aria-pressed={isDone}
                        aria-label={`${habit.name} — ${date}`}
                        title={formatJalaliDate(date, { persianDigits: true, withWeekday: true })}
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-[0.65rem] transition-colors',
                          isDone
                            ? 'border-transparent text-white'
                            : scheduled
                              ? 'border-line bg-surface2 text-muted hover:text-fg'
                              : 'border-dashed border-line text-subtle',
                        )}
                        style={isDone ? { backgroundColor: 'var(--task)' } : undefined}
                      >
                        {isDone ? <Check className="h-4 w-4" /> : formatJalaliDate(date, { persianDigits: true, style: 'short' })}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <HabitEditor
        habit={editing}
        onClose={() => setEditing(null)}
        onSave={async (habit) => {
          await saveHabit(habit);
          push('عادت ذخیره شد.', 'success');
          setEditing(null);
        }}
        persianDigits={settings.persianDigits}
      />
    </div>
  );
}

function HabitEditor({
  habit,
  onClose,
  onSave,
  persianDigits,
}: {
  habit: Habit | null;
  onClose: () => void;
  onSave: (habit: Habit) => Promise<void>;
  persianDigits: boolean;
}) {
  const [draft, setDraft] = useState<Habit | null>(habit);
  const [error, setError] = useState<string | null>(null);

  if (habit && draft?.id !== habit.id) setDraft(habit);
  if (!habit || !draft) return null;

  const patch = (changes: Partial<Habit>) => setDraft({ ...draft, ...changes });

  return (
    <Modal
      open
      onClose={onClose}
      title={habit.name ? 'ویرایش عادت' : 'عادت جدید'}
      description="عادت‌ها زمان مشخصی ندارند؛ فقط روزهایی که باید انجام شوند را انتخاب کنید."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            onClick={() => {
              if (!draft.name.trim()) {
                setError('نام عادت را بنویسید.');
                return;
              }
              void onSave(draft);
            }}
          >
            ذخیره
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="نام عادت" error={error}>
          <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="مثلاً ۲ ساعت درس خواندن" />
        </Field>

        <Field label="تکرار">
          <Select
            value={draft.cadence}
            onChange={(e) => patch({ cadence: e.target.value as HabitCadence })}
          >
            <option value="daily">هر روز</option>
            <option value="weekdays">روزهای کاری (شنبه تا پنجشنبه)</option>
            <option value="weekends">فقط جمعه‌ها</option>
            <option value="custom">روزهای دلخواه</option>
          </Select>
        </Field>

        {draft.cadence === 'custom' ? (
          <Field label="روزها">
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_ORDER.map((day: Weekday) => (
                <Chip
                  key={day}
                  active={draft.days.includes(day)}
                  onClick={() =>
                    patch({
                      days: draft.days.includes(day)
                        ? draft.days.filter((d) => d !== day)
                        : [...draft.days, day],
                    })
                  }
                >
                  {WEEKDAY_LABELS[day]}
                </Chip>
              ))}
            </div>
          </Field>
        ) : null}

        <Field label="رنگ">
          <div className="flex flex-wrap gap-2">
            {COLOR_TOKENS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                aria-pressed={draft.color === color}
                onClick={() => patch({ color })}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition-transform',
                  `task-color-${color}`,
                  draft.color === color ? 'scale-110 border-fg' : 'border-transparent',
                )}
                style={{ backgroundColor: 'var(--task)' }}
              />
            ))}
          </div>
        </Field>

        <div className="rounded-card border border-line p-3">
          <Switch
            checked={Boolean(draft.reminderTime)}
            onChange={(enabled) => patch({ reminderTime: enabled ? '08:00' : null })}
            label="یادآور روزانه"
            description="ساعت مشخصی برای یادآوری این عادت."
          />
          {draft.reminderTime ? (
            <div className="mt-3">
              <Input
                type="time"
                value={draft.reminderTime}
                onChange={(e) => patch({ reminderTime: e.target.value })}
                aria-label="ساعت یادآور"
              />
            </div>
          ) : null}
        </div>

        <p className="text-[0.7rem] text-subtle">
          یادآور عادت‌ها داخل خود برنامه (صفحه‌ی امروز) نمایش داده می‌شود؛ ارسال اعلان سیستم به مجوز اعلان مرورگر و باز بودن برنامه نیاز دارد.
          {persianDigits ? '' : ''}
        </p>
      </div>
    </Modal>
  );
}
