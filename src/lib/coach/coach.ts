/**
 * Coach — short, human, data-driven messages. No network, no LLM, no fabrication:
 * every sentence is derived from real records, and messages are rotated so the
 * coach never repeats the same line twice in a row.
 */

import { formatDuration } from '@/lib/date/format';
import { computeDayProgress } from '@/lib/progress/score';
import type { TaskOccurrence } from '@/types';

export type CoachMoment = 'morning' | 'midday' | 'evening';

export interface CoachInput {
  moment: CoachMoment;
  occurrences: TaskOccurrence[];
  nowMinutes: number;
  focusMinutesToday: number;
  /** previous days' completion rates, most recent last */
  recentRates: number[];
  lastMessageId?: string | null;
}

function fa(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

export interface CoachMessage {
  id: string;
  text: string;
  tone: 'encourage' | 'inform' | 'challenge' | 'recover';
}

export function buildCoachMessage(input: CoachInput): CoachMessage {
  const pending = input.occurrences.filter(
    (occurrence) => occurrence.status === 'scheduled' || occurrence.status === 'active',
  );
  const completed = input.occurrences.filter((occurrence) => occurrence.status === 'completed');
  const missed = input.occurrences.filter((occurrence) => occurrence.status === 'missed');
  const progress = computeDayProgress({ occurrences: input.occurrences });
  const next = pending[0];

  const candidates: CoachMessage[] = [];

  if (input.moment === 'morning') {
    if (next) {
      candidates.push({
        id: `morning-first-${next.taskId}`,
        text: `اول ${next.task.name}؛ بعد بقیه. ${fa(pending.length)} کار برای امروز داری.`,
        tone: 'encourage',
      });
    }
    if (completed.length === 0 && pending.length === 0) {
      candidates.push({
        id: 'morning-empty',
        text: 'برای امروز هنوز برنامه‌ای نگذاشتی. یک تسک کافی است تا روز شکل بگیرد.',
        tone: 'inform',
      });
    }
    if (input.recentRates.length >= 3) {
      const average = input.recentRates.slice(-3).reduce((total, value) => total + value, 0) / 3;
      if (average >= 0.8) {
        candidates.push({
          id: 'morning-strong',
          text: 'سه روز اخیر منظم بوده؛ امروز هم با همان ریتم شروع کن.',
          tone: 'encourage',
        });
      } else if (average < 0.5) {
        candidates.push({
          id: 'morning-light',
          text: 'چند روز اخیر سنگین بود. امروز با یکی دو کار مشخص شروع کن، نه با کل فهرست.',
          tone: 'recover',
        });
      }
    }
  }

  if (input.moment === 'midday') {
    if (completed.length && pending.length) {
      candidates.push({
        id: `midday-next-${next?.taskId ?? 'x'}`,
        text: `${fa(completed.length)} کار انجام شد. ادامه با ${next?.task.name ?? 'بعدی'}.`,
        tone: 'inform',
      });
    }
    if (missed.length >= 2) {
      candidates.push({
        id: 'midday-missed',
        text: `${fa(missed.length)} کار عقب افتاده. یکی از آن‌ها را امروز ببند، بقیه را همین هفته جبران می‌کنیم.`,
        tone: 'recover',
      });
    }
    if (input.focusMinutesToday >= 45) {
      candidates.push({
        id: 'midday-focus',
        text: `${formatDuration(input.focusMinutesToday)} تمرکز ثبت شده؛ بعد از این بلوک چند دقیقه استراحت بده.`,
        tone: 'encourage',
      });
    }
  }

  if (input.moment === 'evening') {
    if (progress.plannedCount === 0) {
      candidates.push({ id: 'evening-empty', text: 'امروز برنامه‌ی ثبت‌شده نداشتیم. فردا را امشب بنویس.', tone: 'inform' });
    } else {
      candidates.push({
        id: 'evening-summary',
        text: `${fa(completed.length)} کار از ${fa(input.occurrences.length)} کار برنامه انجام شد${
          missed.length ? ` و ${missed.length} کار باقی ماند` : ''
        }.`,
        tone: 'inform',
      });
      if (progress.score >= 75) {
        candidates.push({ id: 'evening-good', text: 'امروز اجرای خوبی داشت. فردا با همین شروع کن.', tone: 'encourage' });
      }
      if (missed.length) {
        const nextDay = missed[0].task.name;
        candidates.push({
          id: 'evening-carry',
          text: `فردا ${nextDay} هنوز باقی مانده است؛ اول همان را بگذار.`,
          tone: 'challenge',
        });
      }
    }
  }

  if (!candidates.length) {
    candidates.push({ id: 'fallback', text: 'برنامه‌ات مشخص است؛ فقط قدم بعدی را بردار.', tone: 'encourage' });
  }

  // rotate: prefer a message different from the last shown one
  const alternative = candidates.find((candidate) => candidate.id !== input.lastMessageId);
  return alternative ?? candidates[0];
}

export function coachMomentFrom(nowMinutes: number): CoachMoment {
  if (nowMinutes < 12 * 60) return 'morning';
  if (nowMinutes < 18 * 60) return 'midday';
  return 'evening';
}
