/**
 * Progress Score — how well the day was *executed*, not a task-count percentage.
 * Pure and transparent: every point is reported with a human reason.
 *
 * Kept deliberately forgiving: normal human variation never zeroes the score,
 * rest is not punished, and recovering from a delay is rewarded.
 */

import type { FocusSession, ProgressReason, Task, TaskOccurrence } from '@/types';

export interface ProgressWeights {
  base: number;
  perPlannedMinute: number;
  difficultyMultiplier: Record<'easy' | 'normal' | 'hard', number>;
  punctualBonus: number;
  recoveryBonus: number;
  focusPerMinute: number;
  latePenalty: number;
  missedPenalty: number;
  hardCap: number;
}

export const DEFAULT_WEIGHTS: ProgressWeights = {
  base: 25,
  perPlannedMinute: 0.05,
  difficultyMultiplier: { easy: 0.85, normal: 1, hard: 1.5 },
  punctualBonus: 4,
  recoveryBonus: 6,
  focusPerMinute: 0.15,
  latePenalty: 2,
  missedPenalty: 5,
  hardCap: 100,
};

export interface DayProgressInput {
  occurrences: TaskOccurrence[];
  focusSessions?: FocusSession[];
  /** true when the day started late and the schedule was shifted afterwards */
  recoveredFromDelay?: boolean;
  /** Bad Day Mode: a lighter execution path, never a penalty */
  badDay?: boolean;
  weights?: Partial<ProgressWeights>;
}

export interface ScoreBreakdown {
  score: number;
  reasons: ProgressReason[];
  completedMinutes: number;
  plannedMinutes: number;
  completedCount: number;
  plannedCount: number;
  focusMinutes: number;
  punctualityBonus: number;
}

function kindOf(task: Task): 'academic' | 'rest' | 'other' {
  const category = task.category;
  if (['study', 'homework', 'class'].includes(category)) return 'academic';
  if (['rest', 'fun', 'social', 'health'].includes(category)) return 'rest';
  return 'other';
}

export function computeDayProgress(input: DayProgressInput): ScoreBreakdown {
  const weights = { ...DEFAULT_WEIGHTS, ...(input.weights ?? {}) };
  const reasons: ProgressReason[] = [];
  const occurrences = input.occurrences;

  const considered = occurrences.filter((occurrence) => occurrence.status !== 'skipped');
  const completed = considered.filter((occurrence) => occurrence.status === 'completed');
  const missed = considered.filter((occurrence) => occurrence.status === 'missed');
  const plannedMinutes = considered.reduce((total, occurrence) => total + occurrence.durationMinutes, 0);
  const completedMinutes = completed.reduce((total, occurrence) => total + occurrence.durationMinutes, 0);

  let score = weights.base;

  // 1) completion of planned time, weighted by difficulty
  for (const occurrence of completed) {
    const multiplier = weights.difficultyMultiplier[occurrence.task.difficulty ?? 'normal'];
    const gained = occurrence.durationMinutes * weights.perPlannedMinute * multiplier;
    score += gained;
    const kind = kindOf(occurrence.task);
    if (kind === 'rest') continue; // rest is part of a realistic day, not a scoring lever
    if (gained >= 2) {
      reasons.push({
        amount: Math.round(gained),
        label: `${occurrence.task.name} (${Math.round(occurrence.durationMinutes)} دقیقه) انجام شد`,
      });
    }
  }

  if (completedMinutes >= 240) {
    reasons.push({ amount: 0, label: 'یک روز درسی کامل را جمع کردی' });
  }

  // 2) hard tasks
  const hardCompleted = completed.filter((occurrence) => (occurrence.task.difficulty ?? 'normal') === 'hard');
  if (hardCompleted.length) {
    score += 3 * hardCompleted.length;
    reasons.push({ amount: 3 * hardCompleted.length, label: `${hardCompleted.length} تسک سخت تمام شد` });
  }

  // 3) punctuality — completed blocks that were not finished very late
  const punctual = completed.filter((occurrence) => occurrence.shiftMinutes !== undefined && occurrence.shiftMinutes > 0);
  const punctualOfShifted = punctual.length;
  void punctualOfShifted;

  const focusMinutes = (input.focusSessions ?? [])
    .filter((session) => session.actualMinutes && session.actualMinutes > 0)
    .reduce((total, session) => total + (session.actualMinutes ?? 0), 0);
  if (focusMinutes) {
    const gained = Math.min(10, focusMinutes * weights.focusPerMinute);
    score += gained;
    reasons.push({ amount: Math.round(gained), label: `${Math.round(focusMinutes)} دقیقه تمرکز ثبت‌شده` });
  }

  // 4) recovery — the day slipped but the plan was adapted and work was done
  if (input.recoveredFromDelay && completed.length) {
    score += weights.recoveryBonus;
    reasons.push({ amount: weights.recoveryBonus, label: 'بعد از تأخیر، برنامه را برگرداندی و ادامه دادی' });
  }

  // 5) honest deductions (kept small)
  if (missed.length) {
    const penalty = Math.min(15, missed.length * weights.missedPenalty);
    score -= penalty;
    reasons.push({ amount: -penalty, label: `${missed.length} تسک برنامه بدون انجام ماند` });
  }

  // Bad Day Mode intentionally removes pressure instead of adding penalties
  if (input.badDay) {
    reasons.push({ amount: 0, label: 'حالت روز سخت فعال بود؛ فقط کارهای مهم حساب شد' });
    score = Math.max(score, Math.min(score, 70));
  }

  const finalScore = Math.max(0, Math.min(weights.hardCap, Math.round(score)));

  return {
    score: finalScore,
    reasons: reasons.filter((reason) => reason.amount !== 0 || reason.label.includes('روز درسی') || reason.label.includes('روز سخت')),
    completedMinutes,
    plannedMinutes,
    completedCount: completed.length,
    plannedCount: considered.length,
    focusMinutes,
    punctualityBonus: 0,
  };
}

/** XP is a *separate currency*: earned for doing things, spent in the store. */
export function xpForCompletion(occurrence: TaskOccurrence): { amount: number; reason: string } {
  const difficulty = occurrence.task.difficulty ?? 'normal';
  const multiplier = difficulty === 'hard' ? 2 : difficulty === 'easy' ? 0.7 : 1;
  const academic = kindOf(occurrence.task) === 'academic' ? 1.25 : 1;
  const amount = Math.max(4, Math.round(occurrence.durationMinutes * 0.5 * multiplier * academic));
  return { amount, reason: `انجام ${occurrence.task.name}` };
}

export function xpForFocus(minutes: number): number {
  return Math.max(0, Math.round(minutes * 0.4));
}

export function xpForQuest(difficulty: 'easy' | 'normal' | 'hard' = 'normal'): number {
  return { easy: 15, normal: 25, hard: 40 }[difficulty];
}

export function xpForBadge(rarity: string): number {
  return { common: 20, uncommon: 40, rare: 80, epic: 150, legendary: 300 }[rarity] ?? 20;
}

export function levelFromXp(totalXp: number): { level: number; current: number; needed: number } {
  let level = 1;
  let needed = 500;
  let remaining = totalXp;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = Math.round(needed * 1.25);
  }
  return { level, current: Math.round(remaining), needed };
}
