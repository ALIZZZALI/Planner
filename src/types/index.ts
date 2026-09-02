/**
 * Domain models for the planner.
 * These types are framework-agnostic: they are used by the persistence layer
 * (IndexedDB), the scheduling engine and the UI alike.
 */

export type Weekday = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export const WEEKDAYS: Weekday[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

/** Persian week: شنبه … پنجشنبه are work days, جمعه is the weekend. */
export const WORKDAYS: Weekday[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'];

export type RecurrenceType =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'weekdays'
  | 'weekends'
  | 'even'
  | 'odd'
  | 'interval'
  | 'monthly'
  | 'dates';

export interface RecurrenceRule {
  type: RecurrenceType;
  /** Used by `weekly` (selected weekdays) */
  days?: Weekday[];
  /** Every N days / N weeks / N months */
  every?: number;
  /** Explicit list of dates (`YYYY-MM-DD`) used by the `dates` rule */
  dates?: string[];
}

export type Priority = 'low' | 'normal' | 'high' | 'critical';

export type ColorToken =
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'cyan'
  | 'teal'
  | 'emerald'
  | 'lime'
  | 'amber'
  | 'orange'
  | 'red'
  | 'rose'
  | 'pink'
  | 'slate';

export interface Reminder {
  enabled: boolean;
  /** 0 = exactly at start time */
  minutesBefore: number;
  /** also notify when the block ends */
  atEnd: boolean;
  sound: boolean;
  vibrate: boolean;
}

export interface Task {
  id: string;
  name: string;
  /** Start date of the schedule (Gregorian ISO `YYYY-MM-DD`) */
  date: string;
  /** Optional inclusive end date limiting the recurrence */
  endDate?: string | null;
  /** `HH:MM` (24h, local to the configured timezone) */
  start: string;
  /** `HH:MM` — may be earlier than `start` (crosses midnight) */
  end: string;
  repeat: RecurrenceRule;
  category: string;
  icon: string;
  color: ColorToken;
  priority: Priority;
  reminder: Reminder;
  notes?: string;
  /** Maximum number of occurrences counted from the start date */
  occurrenceLimit?: number | null;
  /**
   * Fixed-time tasks (classes, exams, appointments…) never move when the
   * daily schedule is shifted. Defaults to false (movable).
   */
  fixedTime?: boolean;
  /** Subjective difficulty, used by the progress score (default: normal). */
  difficulty?: 'easy' | 'normal' | 'hard';
  meta?: Record<string, string | number | boolean | null>;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OccurrenceStatus = 'scheduled' | 'active' | 'completed' | 'skipped' | 'missed';

export interface TaskOccurrence {
  /** `${taskId}:${dateISO}` */
  id: string;
  taskId: string;
  task: Task;
  date: string;
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
  durationMinutes: number;
  status: OccurrenceStatus;
  /** true when the task is pinned to its clock time */
  fixedTime?: boolean;
  /** minutes this occurrence is shifted by a daily override (0 = none) */
  shiftMinutes?: number;
  /** unshifted times, present only when a daily override applies */
  originalStartMinutes?: number;
  originalEndMinutes?: number;
}

export interface CompletionRecord {
  /** `${taskId}:${dateISO}` */
  id: string;
  taskId: string;
  date: string;
  status: 'completed' | 'skipped';
  completedAt: string;
  minutesSpent?: number;
  note?: string;
}

export type CategoryKind = 'academic' | 'general' | 'rest' | 'personal';

export interface Category {
  id: string;
  name: string;
  color: ColorToken;
  icon: string;
  /** academic | general | rest | personal — used by reports and the garden */
  kind?: CategoryKind;
  /** personal categories are excluded from the counselor report by default */
  includeInReport?: boolean;
}

export type HabitCadence = 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: ColorToken;
  cadence: HabitCadence;
  days: Weekday[];
  /** optional reminder time `HH:MM` */
  reminderTime?: string | null;
  archived?: boolean;
  createdAt: string;
}

export interface HabitLog {
  /** `${habitId}:${dateISO}` */
  id: string;
  habitId: string;
  date: string;
  done: boolean;
  updatedAt: string;
}

export interface FocusSession {
  id?: number;
  taskId?: string | null;
  taskName?: string | null;
  date: string;
  startedAt: string;
  endedAt?: string | null;
  plannedMinutes: number;
  actualMinutes?: number;
  completed: boolean;
}

/* ------------------------- daily schedule overrides ------------------------ */

/** Which of today's tasks a shift applies to. */
export type ShiftScope = 'all' | 'incomplete' | 'upcoming' | 'selected';


export interface ShiftLogEntry {
  at: string;
  appliedMinutes: number;
  totalAfter: number;
  mode: 'normal' | 'smart' | 'wakeup' | 'reset' | 'undo';
  scope: ShiftScope;
  note?: string;
  /** state before this entry was applied — used by undo */
  snapshot?: { globalShiftMinutes: number; taskShifts: Record<string, number> };
}


/**
 * A single day's temporary adjustment. Completely separate from the recurring
 * task template: deleting it restores the originally calculated times.
 */
export interface DayOverride {
  /** `YYYY-MM-DD` */
  date: string;
  /** cumulative offset applied to every movable task of the day */
  globalShiftMinutes: number;
  /** per-task extra offset (smart reflow / manual selection) */
  taskShifts: Record<string, number>;
  /** observation about the day, never rewrites the wake-up task template */
  actualWakeUpMinutes?: number | null;
  plannedWakeUpMinutes?: number | null;
  log: ShiftLogEntry[];
  createdAt: string;
  updatedAt: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
/** Full palettes (beyond accent-only theming) */
export type ThemePreset =
  | 'default'
  | 'midnight'
  | 'forest'
  | 'sand'
  | 'berry'
  | 'ocean'
  | 'mono';
export type FontSize = 'sm' | 'md' | 'lg';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type Roundness = 'sharp' | 'soft' | 'round';
export type TimelineStyle = 'bars' | 'blocks' | 'minimal';
export type CalendarSystem = 'persian' | 'gregorian';

export interface VisibleSections {
  progress: boolean;
  nowNext: boolean;
  timeline: boolean;
  habits: boolean;
  focus: boolean;
  upcoming: boolean;
  quickAdd: boolean;
}

export interface Settings {
  version: 1;
  timezone: string;
  calendar: CalendarSystem;
  persianDigits: boolean;
  hour12: boolean;
  firstDayOfWeek: Weekday;
  theme: ThemeMode;
  themePreset?: ThemePreset;
  accent: ColorToken;
  fontSize: FontSize;
  density: Density;
  roundness: Roundness;
  timelineStyle: TimelineStyle;
  showSections: VisibleSections;
  notifications: {
    enabled: boolean;
    defaultMinutesBefore: number;
    atEnd: boolean;
    sound: boolean;
    vibrate: boolean;
  };
  categories: Category[];
  focus: { short: number; long: number };
  onboarded: boolean;
  shift: {
    defaultMode: 'normal' | 'smart';
    defaultScope: ShiftScope;
  };
  progress: {
    enabled: boolean;
    xpEnabled: boolean;
    gardenEnabled: boolean;
    questsEnabled: boolean;
    coachEnabled: boolean;
    animations: boolean;
  };
  sleepTracking: boolean;
  report: {
    /** categories that must never appear in the counselor report */
    excludedCategories: string[];
  };
  history: { keepVersions: number };
}

/* ------------------------------ progress domain --------------------------- */

export type XpKind = 'task' | 'quest' | 'badge' | 'focus' | 'spend' | 'adjust';

export interface XpEntry {
  id?: number;
  at: string;
  date: string;
  amount: number;
  kind: XpKind;
  reason: string;
  taskId?: string | null;
}

export interface RewardItem {
  id: string;
  name: string;
  priceXp: number;
  icon: string;
  note?: string;
  archived?: boolean;
  createdAt: string;
}

export interface RedemptionRecord {
  id?: number;
  rewardId: string;
  name: string;
  priceXp: number;
  at: string;
}

export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface BadgeAward {
  /** badge id from the catalogue */
  id: string;
  awardedAt: string;
  date: string;
  seen?: boolean;
}

export interface SleepRecord {
  /** `YYYY-MM-DD` of the morning the record belongs to */
  date: string;
  /** minutes since midnight (may be > 1440 when bedtime is after midnight) */
  bedMinutes?: number | null;
  wakeMinutes?: number | null;
  durationMinutes?: number | null;
  /** subjective 1..5, optional */
  energy?: number | null;
  updatedAt: string;
}

export interface DailyQuest {
  id: string;
  title: string;
  detail?: string;
  /** occurrence / task this quest is derived from */
  taskId?: string | null;
  targetMinutes?: number | null;
  beforeMinutes?: number | null;
  xp: number;
  done: boolean;
}

export interface DayState {
  date: string;
  /** Bad Day Mode — limited by a cooldown */
  badDay?: boolean;
  badDayUsedAt?: string | null;
  quests?: DailyQuest[];
  questsDate?: string | null;
  coachSeenAt?: string | null;
  /** recovery suggestions that were shown, so they are not repeated */
  acknowledgedInsights?: string[];
  updatedAt: string;
}

export interface ProgressReason {
  amount: number;
  label: string;
}

export interface DayProgress {
  score: number;
  reasons: ProgressReason[];
  completedMinutes: number;
  plannedMinutes: number;
  completedCount: number;
  plannedCount: number;
  focusMinutes: number;
  punctualityBonus: number;
}

export interface AppMeta {
  key: string;
  value: unknown;
  updatedAt: string;
}
