/**
 * Daily quests — small optional missions derived from the user's *real* tasks.
 * Never invents work; never mandatory.
 */

import { xpForQuest } from './score';
import { weekdayOfISO } from '@/lib/date/iso';
import { minutesToTime } from '@/lib/date/iso';
import type { DailyQuest, TaskOccurrence } from '@/types';

export interface QuestContext {
  occurrences: TaskOccurrence[];
  /** weekday -> average delay in minutes (from the insight engine) */
  weekdayDelays?: Partial<Record<string, number>>;
  /** tasks that are often postponed, from history */
  avoidedTaskIds?: string[];
  nowMinutes: number;
}

/** Generates at most 3 quests for today from real occurrences. */
export function generateQuests(context: QuestContext): DailyQuest[] {
  const quests: DailyQuest[] = [];
  const pending = context.occurrences
    .filter((occurrence) => occurrence.status === 'scheduled' || occurrence.status === 'active')
    .filter((occurrence) => !['rest', 'fun', 'social'].includes(occurrence.task.category));

  // 1) finish an avoided/late task before a concrete hour
  const avoided = pending.find((occurrence) => context.avoidedTaskIds?.includes(occurrence.taskId));
  if (avoided) {
    quests.push({
      id: `quest-avoid-${avoided.taskId}`,
      title: `${avoided.task.name} را نیمه‌کاره رها نکن`,
      detail: 'این کار چند بار عقب افتاده؛ امروز فقط همین را ببند.',
      taskId: avoided.taskId,
      xp: xpForQuest('hard'),
      done: false,
    });
  }

  // 2) morning completion of the first academic block
  const morning = pending.find(
    (occurrence) => occurrence.startMinutes < 11 * 60 && occurrence.task.category !== 'personal',
  );
  if (morning) {
    quests.push({
      id: `quest-morning-${morning.taskId}`,
      title: `${morning.task.name} را قبل از ساعت ${minutesToTime(Math.max(morning.endMinutes, 11 * 60))} تمام کن`,
      detail: 'شروع صبح معمولاً کیفیت بهتری دارد.',
      taskId: morning.taskId,
      beforeMinutes: Math.max(morning.endMinutes, 11 * 60),
      xp: xpForQuest('normal'),
      done: false,
    });
  }

  // 3) a short focused block late in the day
  const evening = pending.find((occurrence) => occurrence.startMinutes >= 18 * 60);
  if (evening) {
    quests.push({
      id: `quest-evening-${evening.taskId}`,
      title: `قبل از خواب ۱۰ دقیقه ${evening.task.name} مرور کن`,
      detail: 'مرور کوتاه، حافظه‌ی همان روز را تثبیت می‌کند.',
      taskId: evening.taskId,
      targetMinutes: 10,
      xp: xpForQuest('easy'),
      done: false,
    });
  }

  return quests.slice(0, 3);
}

/** A quest is satisfied when its task was completed today (or focus recorded). */
export function questSatisfied(quest: DailyQuest, occurrences: TaskOccurrence[]): boolean {
  if (!quest.taskId) return false;
  return occurrences.some(
    (occurrence) => occurrence.taskId === quest.taskId && occurrence.status === 'completed',
  );
}

export function questSuggestionForWeekday(dateISO: string, weekdayDelays?: Partial<Record<string, number>>): string | null {
  const weekday = weekdayOfISO(dateISO);
  const delay = weekdayDelays?.[weekday];
  if (delay == null || delay < 30) return null;
  return 'برنامه‌ی امروز را کمی سبک‌تر شروع کن تا دیر افتادن، کل روز را جابه‌جا نکند.';
}
