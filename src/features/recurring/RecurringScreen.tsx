'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, Repeat as RepeatIcon } from 'lucide-react';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { useTaskEditor } from '@/features/tasks/TaskEditorProvider';
import { Badge, Button, Card, EmptyState, Segmented } from '@/components/ui/primitives';
import { describeRecurrence, expandTask, nextOccurrenceDate } from '@/lib/schedule/recurrence';
import { addDays, compareISO } from '@/lib/date/iso';
import { formatJalaliDate, toPersianDigits, weekdayLabel } from '@/lib/date/format';
import { RECURRENCE_OPTIONS } from '@/lib/constants';
import { TaskIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';

type GroupMode = 'type' | 'category';

export function RecurringScreen() {
  const { settings } = useSettings();
  const { tasks, now } = usePlanner();
  const { openEditor } = useTaskEditor();
  const [group, setGroup] = useState<GroupMode>('type');

  const recurring = useMemo(
    () => tasks.filter((task) => !task.archived && task.repeat.type !== 'none'),
    [tasks],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of recurring) {
      const key =
        group === 'type'
          ? task.repeat.type
          : settings.categories.find((c) => c.id === task.category)?.name ?? task.category;
      const bucket = map.get(key) ?? [];
      bucket.push(task);
      map.set(key, bucket);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [recurring, group, settings.categories]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div>
            <h1 className="text-base font-semibold">تسک‌های تکرارشونده</h1>
            <p className="mt-0.5 text-xs text-muted">
              {toPersianDigits(recurring.length)} الگوی تکرار فعال — تاریخچه‌ی انجام‌شده‌ها جدا از تعریف تکرار نگه‌داری می‌شود.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              ariaLabel="گروه‌بندی"
              value={group}
              onChange={setGroup}
              options={[
                { value: 'type', label: 'نوع تکرار' },
                { value: 'category', label: 'دسته‌بندی' },
              ]}
            />
            <Button onClick={() => openEditor(undefined, now.date)}>
              <Plus className="h-4 w-4" />
              الگوی جدید
            </Button>
          </div>
        </div>
      </Card>

      {recurring.length ? (
        <div className="space-y-4">
          {groups.map(([key, items]) => (
            <Card key={key}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  {group === 'type' ? <RepeatIcon className="h-4 w-4 text-accent" /> : null}
                  {group === 'type'
                    ? RECURRENCE_OPTIONS.find((option) => option.value === key)?.label ?? key
                    : key}
                </h2>
                <Badge tone="muted">{toPersianDigits(items.length)} تسک</Badge>
              </div>
              <div className="divide-y divide-line">
                {items.map((task) => (
                  <RecurringRow key={task.id} task={task} nowISO={now.date} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<RepeatIcon className="h-6 w-6" />}
            title="الگوی تکراری ندارید"
            description="تکرار روزانه، روزهای انتخابی هفته، روزهای زوج/فرد و بازه‌ی تاریخ را می‌توانید در ویرایشگر تسک تنظیم کنید."
            action={
              <Button onClick={() => openEditor(undefined, now.date)}>
                <Plus className="h-4 w-4" />
                ساختن الگو
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}

function RecurringRow({ task, nowISO }: { task: Task; nowISO: string }) {
  const { settings } = useSettings();
  const { openEditor } = useTaskEditor();
  const [expanded, setExpanded] = useState(false);

  const upcoming = useMemo(() => {
    const next = nextOccurrenceDate(task, nowISO, 30);
    if (!next) return [];
    return expandTask(task, next, addDays(next, 30)).slice(0, expanded ? 8 : 3);
  }, [task, nowISO, expanded]);

  const next = upcoming[0];

  return (
    <div className={cn('px-4 py-3', `task-color-${task.color}`)}>
      <div className="flex items-start gap-3">
        <span className="mt-1 h-8 w-1 rounded-full" style={{ backgroundColor: 'var(--task)' }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TaskIcon name={task.icon} className="h-4 w-4 text-muted" />
            <p className="truncate text-sm font-medium">{task.name}</p>
            {next ? (
              <Badge tone="accent">
                <CalendarClock className="h-3 w-3" />
                {formatJalaliDate(next, { persianDigits: settings.persianDigits, withWeekday: true })}
              </Badge>
            ) : (
              <Badge tone="muted">پایان‌یافته</Badge>
            )}
          </div>
          <p className="numeral mt-1 text-[0.7rem] text-muted">
            {task.start} تا {task.end} • {describeRecurrence(task.repeat, () => '')}
            {task.repeat.days?.length ? ` (${task.repeat.days.map((d) => weekdayLabel0(d)).join('، ')})` : ''}
            {task.repeat.every && task.repeat.every > 1 ? ` • هر ${toPersianDigits(task.repeat.every)} ` : ''}
          </p>
          <p className="mt-0.5 text-[0.68rem] text-subtle">
            از {formatJalaliDate(task.date, { persianDigits: settings.persianDigits, style: 'medium' })}
            {task.endDate ? ` تا ${formatJalaliDate(task.endDate, { persianDigits: settings.persianDigits, style: 'medium' })}` : ' (بی‌پایان)'}
            {task.occurrenceLimit ? ` • حداکثر ${toPersianDigits(task.occurrenceLimit)} جلسه` : ''}
          </p>

          {upcoming.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {upcoming.map((date) => (
                <span
                  key={date}
                  className={cn(
                    'numeral rounded-full border px-2 py-0.5 text-[0.62rem]',
                    compareISO(date, nowISO) === 0
                      ? 'border-transparent bg-accent text-accent-fg'
                      : 'border-line text-muted',
                  )}
                >
                  {formatJalaliDate(date, { persianDigits: settings.persianDigits, style: 'short' })}
                  <span className="ms-1 opacity-70">{weekdayLabel(date).slice(0, 3)}</span>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="text-[0.62rem] text-accent hover:underline"
              >
                {expanded ? 'نمایش کمتر' : 'بیشتر…'}
              </button>
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" onClick={() => openEditor(task)} aria-label={`ویرایش ${task.name}`}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function weekdayLabel0(day: string) {
  const map: Record<string, string> = {
    sat: 'شنبه',
    sun: 'یکشنبه',
    mon: 'دوشنبه',
    tue: 'سه‌شنبه',
    wed: 'چهارشنبه',
    thu: 'پنجشنبه',
    fri: 'جمعه',
  };
  return map[day] ?? day;
}
