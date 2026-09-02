/**
 * Badge catalogue + deterministic evaluation.
 * Badges are milestones, not streak counters: several require combining
 * behaviours (recovery, difficulty, sleep consistency, realistic planning).
 */

import type { BadgeRarity } from '@/types';

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  rarity: BadgeRarity;
  icon: string;
}

export const BADGES: BadgeDefinition[] = [
  { id: 'first-step', title: 'اولین قدم', description: 'اولین تسک برنامه را انجام دادی.', rarity: 'common', icon: 'check' },
  { id: 'early-bird', title: 'سحرخیز', description: '۵ روز پشت‌سرهم قبل از ساعت ۸ شروع کردی.', rarity: 'uncommon', icon: 'sun' },
  { id: 'night-owl-recovered', title: 'جبران‌گر', description: 'بعد از تأخیر، همان روز برنامه را جابه‌جا کردی و ادامه دادی.', rarity: 'uncommon', icon: 'zap' },
  { id: 'marathon', title: 'ماراتن', description: '۵ ساعت مطالعه‌ی ثبت‌شده در یک روز.', rarity: 'rare', icon: 'book' },
  { id: 'deep-focus', title: 'تمرکز عمیق', description: 'یک جلسه‌ی تمرکز ۵۰ دقیقه‌ای کامل.', rarity: 'uncommon', icon: 'brain' },
  { id: 'focus-master', title: 'استاد تمرکز', description: '۲۰ ساعت تمرکز ثبت‌شده در مجموع.', rarity: 'epic', icon: 'target' },
  { id: 'hard-task-1', title: 'از سنگ سخت گذشتی', description: 'اولین تسک سخت را کامل کردی.', rarity: 'uncommon', icon: 'dumbbell' },
  { id: 'hard-task-25', title: 'شکست‌ناپذیر', description: '۲۵ تسک سخت انجام شد.', rarity: 'rare', icon: 'dumbbell' },
  { id: 'week-clean', title: 'هفته‌ی کامل', description: 'یک هفته با نرخ انجام بالای ۸۰٪.', rarity: 'rare', icon: 'star' },
  { id: 'month-steady', title: 'ماه پایدار', description: '۳۰ روز پیاپی با حداقل یک کار انجام‌شده.', rarity: 'epic', icon: 'sparkles' },
  { id: 'planner-real', title: 'برنامه‌ریز واقع‌بین', description: '۷ روز پیاپی نرخ انجام بین ۶۰ تا ۹۵٪ — برنامه‌ای که واقعاً اجرا شد.', rarity: 'rare', icon: 'clock' },
  { id: 'backlog-hero', title: 'عقب‌افتاده‌شکن', description: '۱۰ جلسه‌ی عقب‌افتاده را جبران کردی.', rarity: 'rare', icon: 'graduation' },
  { id: 'math-master', title: 'استاد ریاضی', description: '۵۰ جلسه‌ی درسی در یک دسته‌بندی مشخص.', rarity: 'epic', icon: 'calculator' },
  { id: 'time-commander', title: 'فرمانده زمان', description: '۳ بار از حالت روز سخت بدون از دست دادن برنامه استفاده کردی.', rarity: 'epic', icon: 'briefcase' },
  { id: 'sleep-steady', title: 'خواب منظم', description: '۷ روز پیاپی خواب بین ۷ تا ۹ ساعت.', rarity: 'rare', icon: 'moon' },
  { id: 'balanced-day', title: 'روز متعادل', description: '۱۰ روز با هم برنامه‌ی درس و هم استراحت انجام‌شده.', rarity: 'uncommon', icon: 'heart' },
  { id: 'garden-first', title: 'اولین جوانه', description: 'باغچه‌ی پیشرفت شروع به رشد کرد.', rarity: 'common', icon: 'sparkles' },
  { id: 'garden-bloom', title: 'باغ شکوفا', description: '۳۰ گیاه در باغچه‌ی پیشرفت.', rarity: 'epic', icon: 'star' },
  { id: 'quest-hunter', title: 'شکارچی ماموریت', description: '۲۰ ماموریت روزانه کامل شد.', rarity: 'uncommon', icon: 'target' },
  { id: 'punctual-10', title: 'سرِ ساعت', description: '۱۰ تسک دقیقاً در زمان برنامه‌ریزی‌شده شروع شد.', rarity: 'uncommon', icon: 'clock' },
  { id: 'comeback', title: 'بازگشت', description: 'بعد از ۳ روز کم‌کار، دوباره به برنامه برگشتی.', rarity: 'rare', icon: 'zap' },
  { id: 'long-haul', title: 'مسیر بلند', description: '۱۰۰ روز فعال در برنامه.', rarity: 'legendary', icon: 'graduation' },
  { id: 'legend-executor', title: 'مجری افسانه‌ای', description: '۳۰ روز با نرخ انجام بالای ۹۰٪.', rarity: 'legendary', icon: 'star' },
  { id: 'shift-master', title: 'مهندس برنامه', description: '۲۰ بار برنامه را هوشمندانه جابه‌جا کردی و به هدف رسیدی.', rarity: 'rare', icon: 'laptop' },
];

export const BADGES_BY_ID: Record<string, BadgeDefinition> = Object.fromEntries(
  BADGES.map((badge) => [badge.id, badge]),
);

export const RARITY_LABELS: Record<BadgeRarity, string> = {
  common: 'معمولی',
  uncommon: 'کمیاب',
  rare: 'نادر',
  epic: 'حماسی',
  legendary: 'افسانه‌ای',
};

export const RARITY_ORDER: BadgeRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export interface BadgeStats {
  totalCompletions: number;
  hardCompletions: number;
  focusMinutesTotal: number;
  longestFocusSession: number;
  /** completion rate per day, 0..1 */
  dailyRates: { date: string; rate: number; planned: number }[];
  activeDays: number;
  earlyStartDays: number;
  recoveryCount: number;
  backlogRecovered: number;
  categoryCompletions: Record<string, number>;
  questCompletions: number;
  balancedDays: number;
  sleepStreak: number;
  punctualStarts: number;
  shiftCount: number;
  badDaysUsed: number;
  comebackAfter: number;
  gardenPlants: number;
}

/**
 * Deterministic evaluation. Returns the ids that *should* be unlocked so the
 * caller can diff them against already-awarded badges (no duplicate awards).
 */
export function evaluateBadges(stats: BadgeStats): string[] {
  const unlocked: string[] = [];
  const push = (id: string, condition: boolean) => {
    if (condition && BADGES_BY_ID[id]) unlocked.push(id);
  };

  push('first-step', stats.totalCompletions >= 1);
  push('early-bird', stats.earlyStartDays >= 5);
  push('night-owl-recovered', stats.recoveryCount >= 1);
  push('marathon', stats.dailyRates.some((day) => day.rate >= 0.8 && day.planned >= 300));
  push('deep-focus', stats.longestFocusSession >= 50);
  push('focus-master', stats.focusMinutesTotal >= 1200);
  push('hard-task-1', stats.hardCompletions >= 1);
  push('hard-task-25', stats.hardCompletions >= 25);
  push('week-clean', hasConsecutive(stats.dailyRates.filter((d) => d.planned > 0).map((d) => d.rate >= 0.8), 7));
  push('month-steady', hasConsecutive(stats.dailyRates.map((d) => d.rate > 0), 30));
  push('planner-real', hasConsecutive(stats.dailyRates.filter((d) => d.planned > 0).map((d) => d.rate >= 0.6 && d.rate <= 0.95), 7));
  push('backlog-hero', stats.backlogRecovered >= 10);
  push('math-master', Object.values(stats.categoryCompletions).some((count) => count >= 50));
  push('time-commander', stats.badDaysUsed >= 3);
  push('sleep-steady', stats.sleepStreak >= 7);
  push('balanced-day', stats.balancedDays >= 10);
  push('garden-first', stats.gardenPlants >= 1);
  push('garden-bloom', stats.gardenPlants >= 30);
  push('quest-hunter', stats.questCompletions >= 20);
  push('punctual-10', stats.punctualStarts >= 10);
  push('comeback', stats.comebackAfter >= 1);
  push('long-haul', stats.activeDays >= 100);
  push('legend-executor', hasConsecutive(stats.dailyRates.filter((d) => d.planned > 0).map((d) => d.rate >= 0.9), 30));
  push('shift-master', stats.shiftCount >= 20);

  return unlocked;
}

function hasConsecutive(flags: boolean[], needed: number): boolean {
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    if (run >= needed) return true;
  }
  return false;
}
