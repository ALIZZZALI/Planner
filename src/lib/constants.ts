/** Design tokens + default catalogues (categories, colors, icons, priorities). */

import type { Category, CategoryKind, ColorToken, Priority, Settings, Weekday } from '@/types';

export const COLOR_TOKENS: ColorToken[] = [
  'blue',
  'indigo',
  'violet',
  'cyan',
  'teal',
  'emerald',
  'lime',
  'amber',
  'orange',
  'red',
  'rose',
  'pink',
  'slate',
];

export const COLOR_LABELS: Record<ColorToken, string> = {
  blue: 'آبی',
  indigo: 'نیلی',
  violet: 'بنفش',
  cyan: 'فیروزه‌ای',
  teal: 'سبز آبی',
  emerald: 'سبز',
  lime: 'لیمویی',
  amber: 'کهربایی',
  orange: 'نارنجی',
  red: 'قرمز',
  rose: 'گلبهی',
  pink: 'صورتی',
  slate: 'خاکستری',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'کم',
  normal: 'معمولی',
  high: 'زیاد',
  critical: 'خیلی زیاد',
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 3,
  high: 2,
  normal: 1,
  low: 0,
};

/**
 * Kind mapping for existing category ids so stored (older) categories get the
 * right reporting behaviour without any data migration.
 */
export const CATEGORY_KINDS: Record<string, CategoryKind> = {
  study: 'academic',
  homework: 'academic',
  class: 'academic',
  coding: 'general',
  electronics: 'general',
  media: 'general',
  social: 'rest',
  health: 'rest',
  rest: 'rest',
  fun: 'rest',
  personal: 'personal',
};

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  academic: 'درسی',
  general: 'عمومی',
  rest: 'استراحت',
  personal: 'شخصی (در گزارش مشاور نمی‌آید)',
};

export function resolveCategoryKind(category: Category): CategoryKind {
  if (category.kind) return category.kind;
  return CATEGORY_KINDS[category.id] ?? 'general';
}

/** A category is reportable unless it is personal or explicitly excluded. */
export function isReportableCategory(category: Category, excluded: string[] = []): boolean {
  if (excluded.includes(category.id)) return false;
  if (category.includeInReport === false) return false;
  return resolveCategoryKind(category) !== 'personal';
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'study', name: 'درس', color: 'blue', icon: 'book', kind: 'academic', includeInReport: true },
  { id: 'homework', name: 'تکلیف', color: 'violet', icon: 'pencil', kind: 'academic', includeInReport: true },
  { id: 'class', name: 'کلاس', color: 'cyan', icon: 'presentation', kind: 'academic', includeInReport: true },
  { id: 'coding', name: 'برنامه‌نویسی', color: 'emerald', icon: 'code', kind: 'general', includeInReport: true },
  { id: 'electronics', name: 'الکترونیک', color: 'teal', icon: 'cpu', kind: 'general', includeInReport: true },
  { id: 'media', name: 'رسانه', color: 'rose', icon: 'image', kind: 'general', includeInReport: true },
  { id: 'health', name: 'سلامت', color: 'lime', icon: 'heart', kind: 'rest', includeInReport: true },
  { id: 'rest', name: 'استراحت', color: 'slate', icon: 'moon', kind: 'rest', includeInReport: true },
  { id: 'fun', name: 'سرگرمی', color: 'orange', icon: 'gamepad', kind: 'rest', includeInReport: true },
  { id: 'personal', name: 'شخصی', color: 'indigo', icon: 'user', kind: 'personal', includeInReport: false },
];

export const STATUS_LABELS: Record<string, string> = {
  scheduled: 'در انتظار',
  active: 'در حال انجام',
  completed: 'انجام شد',
  skipped: 'رد شده',
  missed: 'از دست رفته',
};

export const ICON_NAMES = [
  'book',
  'pencil',
  'presentation',
  'calculator',
  'atom',
  'flask',
  'dna',
  'code',
  'cpu',
  'image',
  'message',
  'youtube',
  'gamepad',
  'dumbbell',
  'heart',
  'moon',
  'sun',
  'coffee',
  'clock',
  'check',
  'user',
  'brain',
  'globe',
  'music',
  'camera',
  'target',
  'star',
  'sparkles',
  'zap',
  'briefcase',
  'graduation',
  'laptop',
  'phone',
  'bus',
  'car',
  'food',
  'water',
  'study',
] as const;

export const ICON_LABELS: Record<string, string> = {
  book: 'کتاب / درس',
  pencil: 'قلم / تکلیف',
  presentation: 'کلاس',
  calculator: 'ماشین‌حساب (ریاضی)',
  atom: 'فیزیک',
  flask: 'شیمی',
  dna: 'زیست',
  code: 'کدنویسی',
  cpu: 'برد / الکترونیک',
  image: 'فتوشاپ',
  message: 'پیام‌رسان',
  youtube: 'یوتیوب',
  gamepad: 'بازی',
  dumbbell: 'ورزش',
  heart: 'سلامت',
  moon: 'خواب',
  sun: 'صبح',
  coffee: 'استراحت',
  clock: 'زمان',
  check: 'چک‌لیست',
  user: 'شخصی',
  brain: 'تمرکز',
  globe: 'زبان',
  music: 'موسیقی',
  camera: 'دوربین',
  target: 'هدف',
  star: 'هدف ویژه',
  sparkles: 'ایده',
  zap: 'انرژی',
  briefcase: 'کار',
  graduation: 'دانشگاه',
  laptop: 'کامپیوتر',
  phone: 'موبایل',
  bus: 'مسیر',
  car: 'سفر',
  food: 'غذا',
  water: 'آب',
  study: 'مطالعه',
};

export const THEME_PRESETS: { value: string; label: string; hint: string }[] = [
  { value: 'default', label: 'پیش‌فرض', hint: 'همان حالت آشنا' },
  { value: 'midnight', label: 'نیمه‌شب', hint: 'تیره و آرام برای شب' },
  { value: 'forest', label: 'جنگل', hint: 'سبز و متمرکز' },
  { value: 'sand', label: 'شنی', hint: 'گرم و کم‌تنش' },
  { value: 'berry', label: 'اناری', hint: 'سرزنده و پرانرژی' },
  { value: 'ocean', label: 'اقیانوس', hint: 'آبی خنک' },
  { value: 'mono', label: 'تک‌رنگ', hint: 'حداقلی و بی‌حاشیه' },
];

export const TIMEZONES = [
  'Asia/Tehran',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  timezone: 'Asia/Tehran',
  calendar: 'persian',
  persianDigits: true,
  hour12: false,
  firstDayOfWeek: 'sat',
  theme: 'system',
  themePreset: 'default',
  accent: 'blue',
  fontSize: 'md',
  density: 'comfortable',
  roundness: 'soft',
  timelineStyle: 'bars',
  showSections: {
    progress: true,
    nowNext: true,
    timeline: true,
    habits: true,
    focus: true,
    upcoming: true,
    quickAdd: true,
  },
  notifications: {
    enabled: false,
    defaultMinutesBefore: 5,
    atEnd: false,
    sound: true,
    vibrate: true,
  },
  categories: DEFAULT_CATEGORIES,
  focus: { short: 25, long: 5 },
  onboarded: false,
  shift: { defaultMode: 'normal', defaultScope: 'upcoming' },
  progress: {
    enabled: true,
    xpEnabled: true,
    gardenEnabled: true,
    questsEnabled: true,
    coachEnabled: true,
    animations: true,
  },
  sleepTracking: true,
  report: { excludedCategories: ['personal'] },
  history: { keepVersions: 10 },
};

export const RECURRENCE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'none', label: 'یک‌بار', hint: 'فقط در تاریخ انتخابی' },
  { value: 'daily', label: 'هر روز', hint: 'روزماره، می‌توانید فاصله بدهید' },
  { value: 'interval', label: 'یک روز درمیان / هر N روز', hint: 'مثلاً هر ۲ روز = یک روز درمیان' },
  { value: 'weekdays', label: 'روزهای کاری', hint: 'شنبه تا پنجشنبه' },
  { value: 'weekends', label: 'جمعه‌ها', hint: 'فقط جمعه' },
  { value: 'weekly', label: 'روزهای انتخابی هفته', hint: 'مثلاً شنبه و دوشنبه' },
  { value: 'even', label: 'روزهای زوج', hint: '۲، ۴، ۶، … ماه' },
  { value: 'odd', label: 'روزهای فرد', hint: '۱، ۳، ۵، … ماه' },
  { value: 'monthly', label: 'هر ماه', hint: 'در یک روز مشخص از ماه' },
  { value: 'dates', label: 'تاریخ‌های مشخص', hint: 'فقط چند تاریخ انتخابی (شمسی)' },
];

export const WEEKDAY_ORDER: Weekday[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
