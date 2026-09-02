/**
 * Occurrence building, status resolution, overlap layout and daily stats.
 * Pure functions — no React, no DB.
 */

import { compareISO, timeToMinutes } from '@/lib/date/iso';
import { expandTask } from './recurrence';
import type {
  CompletionRecord,
  DayOverride,
  OccurrenceStatus,
  Task,
  TaskOccurrence,
} from '@/types';

/** Daily overrides (date -> record). Absent = the day follows its templates. */
export type DayOverrideMap = Map<string, DayOverride>;

export interface OccurrenceContext {
  /** `YYYY-MM-DD` of "now" in the configured timezone */
  nowDate: string;
  /** minutes since midnight of "now" in the configured timezone */
  nowMinutes: number;
  /** completion records keyed by `${taskId}:${date}` */
  completions: Map<string, CompletionRecord>;
  /** optional per-day schedule overrides (late wake-up / flexible day) */
  dayOverrides?: DayOverrideMap;
}

function shiftFor(task: Task, dateISO: string, ctx: OccurrenceContext): number {
  const override = ctx.dayOverrides?.get(dateISO);
  if (!override || task.fixedTime) return 0;
  return (override.globalShiftMinutes ?? 0) + (override.taskShifts?.[task.id] ?? 0);
}

export function occurrenceId(taskId: string, dateISO: string): string {
  return `${taskId}:${dateISO}`;
}

export interface BuildOptions {
  nowDate?: string;
  nowMinutes?: number;
}

export function buildOccurrence(task: Task, dateISO: string, ctx: OccurrenceContext): TaskOccurrence {
  const originalStartMinutes = timeToMinutes(task.start);
  const originalEndMinutes = timeToMinutes(task.end);
  const shiftMinutes = shiftFor(task, dateISO, ctx);
  const startMinutes = originalStartMinutes + shiftMinutes;
  const endMinutes = originalEndMinutes + shiftMinutes;
  const record = ctx.completions.get(occurrenceId(task.id, dateISO));
  const crossesMidnight = endMinutes <= startMinutes;
  const effectiveEnd = crossesMidnight ? endMinutes + 1440 : endMinutes;

  let status: OccurrenceStatus;
  if (record?.status === 'completed') status = 'completed';
  else if (record?.status === 'skipped') status = 'skipped';
  else if (ctx.nowDate === dateISO || (crossesMidnight && isNextDay(ctx.nowDate, dateISO))) {
    if (ctx.nowMinutes >= startMinutes && ctx.nowMinutes < effectiveEnd) status = 'active';
    else if (ctx.nowMinutes >= effectiveEnd) status = 'missed';
    else status = 'scheduled';
  } else if (compareISO(dateISO, ctx.nowDate) < 0) {
    status = 'missed';
  } else {
    status = 'scheduled';
  }

  return {
    id: occurrenceId(task.id, dateISO),
    taskId: task.id,
    task,
    date: dateISO,
    start: task.start,
    end: task.end,
    startMinutes,
    endMinutes: effectiveEnd,
    crossesMidnight,
    durationMinutes: effectiveEnd - startMinutes,
    status,
    fixedTime: task.fixedTime === true,
    shiftMinutes,
    ...(shiftMinutes
      ? { originalStartMinutes, originalEndMinutes: originalEndMinutes <= originalStartMinutes ? originalEndMinutes + 1440 : originalEndMinutes }
      : {}),
  };
}

function isNextDay(a: string, b: string): boolean {
  // a == b + 1 day
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ua = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const ub = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return ua - ub === 86400000;
}

export function buildDayOccurrences(
  tasks: Task[],
  dateISO: string,
  ctx: OccurrenceContext,
): TaskOccurrence[] {
  const out: TaskOccurrence[] = [];
  // Tasks dated for `dateISO - 1` that cross midnight spill into today.
  const yesterday = shiftISO(dateISO, -1);
  for (const task of tasks) {
    if (task.archived) continue;
    for (const date of expandTask(task, dateISO, dateISO)) {
      out.push(buildOccurrence(task, date, ctx));
    }
    for (const date of expandTask(task, yesterday, yesterday)) {
      if (timeToMinutes(task.end) <= timeToMinutes(task.start)) {
        const occurrence = buildOccurrence(task, date, ctx);
        // represents the tail block that belongs to today
        out.push({ ...occurrence, date: dateISO, id: occurrenceId(task.id, dateISO) });
      }
    }
  }
  return out.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
}

function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function buildRangeOccurrences(
  tasks: Task[],
  fromISO: string,
  toISO: string,
  ctx: OccurrenceContext,
): Map<string, TaskOccurrence[]> {
  const map = new Map<string, TaskOccurrence[]>();
  const dates: string[] = [];
  let cursor = fromISO;
  while (compareISO(cursor, toISO) <= 0 && dates.length < 400) {
    dates.push(cursor);
    cursor = shiftISO(cursor, 1);
  }
  for (const date of dates) map.set(date, []);
  for (const task of tasks) {
    if (task.archived) continue;
    for (const date of expandTask(task, fromISO, toISO)) {
      const bucket = map.get(date);
      if (!bucket) continue;
      bucket.push(buildOccurrence(task, date, ctx));
      const crosses = timeToMinutes(task.end) <= timeToMinutes(task.start);
      if (crosses) {
        const next = shiftISO(date, 1);
        const nextBucket = map.get(next);
        if (nextBucket) {
          nextBucket.push({
            ...buildOccurrence(task, next, ctx),
            date: next,
            id: occurrenceId(task.id, next),
          });
        }
      }
    }
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  }
  return map;
}

/* -------------------------------- overlap --------------------------------- */

export interface LaneLayout {
  lane: number;
  lanes: number;
  overlaps: boolean;
}

/**
 * Greedy interval-lane assignment so overlapping blocks render side by side.
 */
export function computeLanes(occurrences: TaskOccurrence[]): Map<string, LaneLayout> {
  const sorted = [...occurrences].sort((a, b) => a.startMinutes - b.startMinutes);
  const result = new Map<string, LaneLayout>();
  let cluster: TaskOccurrence[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    // sort cluster by length desc so long blocks get the left lane
    const ordered = [...cluster].sort(
      (a, b) => b.durationMinutes - a.durationMinutes || a.startMinutes - b.startMinutes,
    );
    const laneEnds: number[] = [];
    const assignment = new Map<string, number>();
    for (const occ of ordered) {
      let lane = laneEnds.findIndex((end) => end <= occ.startMinutes);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(occ.endMinutes);
      } else {
        laneEnds[lane] = occ.endMinutes;
      }
      assignment.set(occ.id, lane);
    }
    const lanes = laneEnds.length;
    for (const occ of cluster) {
      result.set(occ.id, { lane: assignment.get(occ.id) ?? 0, lanes, overlaps: lanes > 1 });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const occ of sorted) {
    if (cluster.length && occ.startMinutes >= clusterEnd) flush();
    cluster.push(occ);
    clusterEnd = Math.max(clusterEnd, occ.endMinutes);
  }
  flush();
  return result;
}

/* --------------------------------- stats ---------------------------------- */

export interface DayStats {
  total: number;
  completed: number;
  skipped: number;
  missed: number;
  remaining: number;
  scheduledMinutes: number;
  completedMinutes: number;
  progress: number;
}

export function computeDayStats(occurrences: TaskOccurrence[]): DayStats {
  const stats: DayStats = {
    total: occurrences.length,
    completed: 0,
    skipped: 0,
    missed: 0,
    remaining: 0,
    scheduledMinutes: 0,
    completedMinutes: 0,
    progress: 0,
  };
  for (const occ of occurrences) {
    stats.scheduledMinutes += occ.durationMinutes;
    if (occ.status === 'completed') {
      stats.completed += 1;
      stats.completedMinutes += occ.durationMinutes;
    } else if (occ.status === 'skipped') stats.skipped += 1;
    else if (occ.status === 'missed') stats.missed += 1;
  }
  const denominator = stats.total - stats.skipped;
  stats.remaining = stats.total - stats.completed - stats.skipped;
  stats.progress = denominator > 0 ? Math.round((stats.completed / denominator) * 100) : 0;
  return stats;
}

export function findCurrentAndNext(
  occurrences: TaskOccurrence[],
  nowMinutes: number,
): { current: TaskOccurrence | null; next: TaskOccurrence | null } {
  const relevant = occurrences.filter((o) => o.status !== 'skipped');
  const current =
    relevant.find((o) => o.startMinutes <= nowMinutes && o.endMinutes > nowMinutes) ?? null;
  const next =
    relevant.find((o) => o.startMinutes > nowMinutes && o.status !== 'completed') ?? null;
  return { current, next };
}
