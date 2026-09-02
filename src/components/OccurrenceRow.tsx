'use client';

import { CheckCircle2, Circle, Pencil, SkipForward, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMinutesOfDay } from '@/lib/date/format';
import { TaskIcon } from '@/lib/icons';
import { STATUS_LABELS } from '@/lib/constants';
import type { Settings, TaskOccurrence } from '@/types';

export function OccurrenceRow({
  occurrence,
  settings,
  onToggle,
  onSkip,
  onEdit,
  onFocus,
  compact,
}: {
  occurrence: TaskOccurrence;
  settings: Settings;
  onToggle?: (occurrence: TaskOccurrence) => void;
  onSkip?: (occurrence: TaskOccurrence) => void;
  onEdit?: (occurrence: TaskOccurrence) => void;
  onFocus?: (occurrence: TaskOccurrence) => void;
  compact?: boolean;
}) {
  const done = occurrence.status === 'completed';
  const skipped = occurrence.status === 'skipped';
  const missed = occurrence.status === 'missed';
  const active = occurrence.status === 'active';

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-card border border-line bg-surface px-3 transition-colors',
        compact ? 'py-2' : 'py-2.5',
        `task-color-${occurrence.task.color}`,
        active && 'border-[color-mix(in_oklab,var(--task)_55%,transparent)] bg-[color-mix(in_oklab,var(--task)_7%,var(--surface))]',
        done && 'opacity-70',
        skipped && 'opacity-50',
      )}
    >
      {onToggle ? (
        <button
          type="button"
          onClick={() => onToggle(occurrence)}
          aria-label={done ? `برداشتن علامت ${occurrence.task.name}` : `علامت‌زدن ${occurrence.task.name} به‌عنوان انجام‌شده`}
          className="shrink-0 text-subtle transition-colors hover:text-[var(--task)]"
        >
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
          ) : (
            <Circle className={cn('h-5 w-5', missed && 'text-[var(--danger)]')} />
          )}
        </button>
      ) : null}

      <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: 'var(--task)' }} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TaskIcon name={occurrence.task.icon} className="h-4 w-4 shrink-0 opacity-70" />
          <p className={cn('truncate text-sm font-medium leading-6', done && 'line-through')}>
            {occurrence.task.name}
          </p>
          {active ? (
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-medium text-accent-fg">
              الان
            </span>
          ) : null}
          {occurrence.shiftMinutes ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[0.6rem] text-accent">
              {occurrence.shiftMinutes > 0 ? '+' : '−'}
              {Math.abs(occurrence.shiftMinutes)}′
            </span>
          ) : null}
          {occurrence.fixedTime ? (
            <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[0.6rem] text-muted">
              ثابت
            </span>
          ) : null}
          {skipped ? (
            <span className="shrink-0 text-[0.6rem] text-subtle">{STATUS_LABELS.skipped}</span>
          ) : null}
        </div>
        <p className="numeral truncate text-[0.7rem] text-muted">
          {formatMinutesOfDay(occurrence.startMinutes, settings)} —{' '}
          {formatMinutesOfDay(occurrence.endMinutes, settings)}
          <span className="mx-1.5 text-subtle">•</span>
          {Math.round(occurrence.durationMinutes / 60) > 0
            ? `${Math.round(occurrence.durationMinutes / 60)} ساعت `
            : ''}
          {occurrence.durationMinutes % 60} دقیقه
          {occurrence.crossesMidnight ? ' • تا فردا' : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {onFocus ? (
          <button
            type="button"
            onClick={() => onFocus(occurrence)}
            title="شروع تمرکز روی این تسک"
            aria-label={`شروع تمرکز روی ${occurrence.task.name}`}
            className="rounded-control p-1.5 text-muted hover:bg-surface2 hover:text-fg"
          >
            <Timer className="h-4 w-4" />
          </button>
        ) : null}
        {onSkip ? (
          <button
            type="button"
            onClick={() => onSkip(occurrence)}
            title={skipped ? 'لغو رد کردن' : 'رد کردن این جلسه'}
            aria-label={`رد کردن ${occurrence.task.name}`}
            className="rounded-control p-1.5 text-muted hover:bg-surface2 hover:text-fg"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        ) : null}
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(occurrence)}
            title="ویرایش"
            aria-label={`ویرایش ${occurrence.task.name}`}
            className="rounded-control p-1.5 text-muted hover:bg-surface2 hover:text-fg"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
