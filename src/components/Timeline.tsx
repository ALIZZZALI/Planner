'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { computeLanes } from '@/lib/schedule/occurrence';
import { formatMinutesOfDay } from '@/lib/date/format';
import { cn } from '@/lib/utils';
import { TaskIcon } from '@/lib/icons';
import type { Settings, TaskOccurrence } from '@/types';

const HOUR_HEIGHT = 56;

export function Timeline({
  occurrences,
  nowMinutes,
  settings,
  onOpen,
  onToggle,
  className,
  scrollToNow = true,
  startHour = 0,
  endHour = 24,
}: {
  occurrences: TaskOccurrence[];
  nowMinutes: number;
  settings: Settings;
  onOpen?: (occurrence: TaskOccurrence) => void;
  onToggle?: (occurrence: TaskOccurrence) => void;
  className?: string;
  scrollToNow?: boolean;
  startHour?: number;
  endHour?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lanes = useMemo(() => computeLanes(occurrences), [occurrences]);

  const effectiveStart = useMemo(() => {
    const earliest = occurrences.length ? Math.min(...occurrences.map((o) => o.startMinutes)) : startHour * 60;
    return Math.min(startHour * 60, Math.floor(earliest / 60) * 60);
  }, [occurrences, startHour]);

  const effectiveEnd = useMemo(() => {
    const latest = occurrences.length ? Math.max(...occurrences.map((o) => o.endMinutes)) : endHour * 60;
    return Math.max(endHour * 60, Math.ceil(latest / 60) * 60);
  }, [occurrences, endHour]);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = effectiveStart / 60; h <= effectiveEnd / 60; h += 1) list.push(h);
    return list;
  }, [effectiveStart, effectiveEnd]);

  const totalHeight = hours.length * HOUR_HEIGHT;

  useEffect(() => {
    if (!scrollToNow || !containerRef.current) return;
    const target = ((nowMinutes - effectiveStart) / 60) * HOUR_HEIGHT - 120;
    containerRef.current.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [scrollToNow, nowMinutes, effectiveStart]);

  const showNowLine = nowMinutes >= effectiveStart && nowMinutes <= effectiveEnd;

  return (
    <div className={cn('relative', className)}>
      <div
        ref={containerRef}
        className="max-h-[560px] overflow-y-auto rounded-card border border-line bg-surface"
        role="list"
        aria-label="تایم‌لاین روز"
      >
        <div className="relative flex" style={{ height: totalHeight }}>
          {/* hour gutter */}
          <div className="w-14 shrink-0 border-e border-line bg-surface2/40">
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative"
                style={{ height: HOUR_HEIGHT }}
                aria-hidden
              >
                <span className="numeral absolute -top-2 end-1.5 text-[0.65rem] text-subtle">
                  {formatMinutesOfDay(hour * 60, settings)}
                </span>
              </div>
            ))}
          </div>

          {/* blocks */}
          <div className="relative flex-1 timeline-grid-line" style={{ backgroundSize: `100% ${HOUR_HEIGHT}px` }}>
            {occurrences.map((occurrence) => {
              const layout = lanes.get(occurrence.id);
              const lane = layout?.lane ?? 0;
              const lanesCount = layout?.lanes ?? 1;
              const top = ((occurrence.startMinutes - effectiveStart) / 60) * HOUR_HEIGHT;
              const height = Math.max(26, (occurrence.durationMinutes / 60) * HOUR_HEIGHT - 2);
              const widthPercent = 100 / lanesCount;
              const done = occurrence.status === 'completed';
              const skipped = occurrence.status === 'skipped';
              return (
                <div
                  key={occurrence.id}
                  role="listitem"
                  className={cn(
                    'group absolute rounded-[calc(var(--radius-base)-0.35rem)] p-1.5 transition-all',
                    `task-color-${occurrence.task.color}`,
                    skipped && 'opacity-45',
                  )}
                  style={{
                    top,
                    height,
                    insetInlineStart: `${lane * widthPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpen?.(occurrence)}
                    className={cn(
                      'flex h-full w-full flex-col justify-start gap-0.5 overflow-hidden rounded-[calc(var(--radius-base)-0.45rem)] px-2 py-1 text-start transition-all',
                      settings.timelineStyle === 'blocks'
                        ? 'text-[var(--task)]'
                        : 'bg-[color-mix(in_oklab,var(--task)_10%,var(--surface))] text-fg hover:bg-[color-mix(in_oklab,var(--task)_18%,var(--surface))]',
                      settings.timelineStyle === 'blocks' &&
                        'bg-[color-mix(in_oklab,var(--task)_22%,var(--surface))] hover:bg-[color-mix(in_oklab,var(--task)_30%,var(--surface))]',
                      done && 'opacity-60',
                    )}
                    style={
                      settings.timelineStyle === 'blocks'
                        ? { borderInlineStart: '3px solid var(--task)' }
                        : { borderInlineStart: '3px solid var(--task)' }
                    }
                  >
                    <span className="flex items-center gap-1.5 truncate text-[0.78rem] font-medium leading-5">
                      {done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--task)]" /> : null}
                      <TaskIcon name={occurrence.task.icon} className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className={cn('truncate', done && 'line-through')}>{occurrence.task.name}</span>
                    </span>
                    {height > 44 ? (
                      <span className="numeral truncate text-[0.68rem] text-muted">
                        {formatMinutesOfDay(occurrence.startMinutes, settings)} —{' '}
                        {formatMinutesOfDay(occurrence.endMinutes, settings)}
                        {lanesCount > 1 ? ' • هم‌زمان' : ''}
                      </span>
                    ) : null}
                  </button>
                  {onToggle ? (
                    <button
                      type="button"
                      onClick={() => onToggle(occurrence)}
                      aria-label={done ? 'برداشتن علامت انجام شد' : 'علامت‌زدن انجام شد'}
                      className="absolute end-1 top-1 rounded-full bg-surface/85 p-1 text-subtle opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" /> : <Circle className="h-3.5 w-3.5" />}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {showNowLine ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                style={{ top: ((nowMinutes - effectiveStart) / 60) * HOUR_HEIGHT }}
                aria-hidden
              >
                <span className="h-2 w-2 -translate-x-1 rounded-full bg-accent" />
                <span className="h-px flex-1 bg-accent" />
                <span className="numeral rounded-s-full bg-accent px-1.5 py-0.5 text-[0.6rem] font-medium text-accent-fg">
                  {formatMinutesOfDay(nowMinutes, settings)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {!occurrences.length ? (
        <div className="flex items-center gap-2 rounded-card border border-dashed border-line px-4 py-6 text-xs text-muted">
          <Clock className="h-4 w-4" />
          در این روز زمان‌بندی‌ای ثبت نشده است.
        </div>
      ) : (
        <p className="mt-2 text-[0.7rem] text-subtle">
          {occurrences.length > 0
            ? `${occurrences.length} بلوک زمانی • ${occurrences.filter((o) => lanes.get(o.id)?.overlaps).length} مورد هم‌پوشانی`
            : ''}
        </p>
      )}
    </div>
  );
}
