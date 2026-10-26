'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Bike, BookOpen, CalendarDays,
  Check, CheckCircle2, Circle, Clock3, Download, Dumbbell, HeartPulse,
  Minus, Pencil, Plus, RotateCcw, Save, Settings2, ShieldCheck, Sparkles,
  Trash2, Upload, X
} from 'lucide-react';

type RepeatMode = 'daily' | 'weekdays' | 'friday' | 'custom';
type TaskStatus = 'done' | 'skipped';
type TaskCategory = 'روتین' | 'درس' | 'نماز و معنویت' | 'بهداشت' | 'خودسازی' | 'استراحت';
type LifeTask = {
  id: string; title: string; category: TaskCategory; time: string; repeat: RepeatMode;
  days: number[]; enabled: boolean; reminder: boolean; notes: string;
};
type ZikrCounter = { id: string; title: string; phrase: string; target: number; step: number; enabled: boolean };
type Exercise = { id: string; title: string; target: number; unit: 'تکرار' | 'دقیقه' | 'کیلومتر' | 'ثانیه'; step: number; days: number[]; group: 'روزانه' | 'قدرتی' | 'هوازی'; enabled: boolean };
type LifeStore = {
  schema: 1; challengeStart: string; tasks: LifeTask[]; counters: ZikrCounter[]; exercises: Exercise[];
  taskLogs: Record<string, Record<string, TaskStatus>>;
  zikrLogs: Record<string, Record<string, number>>;
  exerciseLogs: Record<string, Record<string, number>>;
};

const STORAGE_KEY = 'planner-life-challenge-v1';
const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const CATEGORIES: TaskCategory[] = ['روتین', 'درس', 'نماز و معنویت', 'بهداشت', 'خودسازی', 'استراحت'];
const DAY_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function localISODate(date = new Date()): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function parseLocalDate(value: string): Date {
  return new Date(value + 'T12:00:00');
}
function shiftDate(value: string, amount: number): string {
  const d = parseLocalDate(value);
  d.setDate(d.getDate() + amount);
  return localISODate(d);
}
function persianDayIndex(value: string): number {
  return (parseLocalDate(value).getDay() + 1) % 7;
}
function makeId(prefix: string): string {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function applies(mode: RepeatMode, days: number[], date: string): boolean {
  const day = persianDayIndex(date);
  if (mode === 'daily') return true;
  if (mode === 'weekdays') return day !== 6;
  if (mode === 'friday') return day === 6;
  return days.includes(day);
}
function repeatLabel(task: LifeTask): string {
  if (task.repeat === 'daily') return 'هر روز';
  if (task.repeat === 'weekdays') return 'شنبه تا پنجشنبه';
  if (task.repeat === 'friday') return 'جمعه‌ها';
  return task.days.map((day) => DAYS[day]).join('، ') || 'روز انتخاب نشده';
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(parseLocalDate(value));
}
function percent(n: number, d: number): number {
  return d > 0 ? Math.max(0, Math.min(100, Math.round((n / d) * 100))) : 0;
}
function progressText(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}
function defaultStore(): LifeStore {
  const now = localISODate();
  const workDays = [0, 1, 2, 3, 4, 5];
  const strengthDays = [0, 2, 4];
  const task = (id: string, title: string, time: string, category: TaskCategory, repeat: RepeatMode = 'daily', days: number[] = [], notes = ''): LifeTask => ({
    id, title, time, category, repeat, days, enabled: true, reminder: false, notes
  });
  return {
    schema: 1, challengeStart: now,
    tasks: [
      task('wake-up', 'بیدار شدن و شروع روز', '05:00', 'روتین', 'weekdays', workDays),
      task('bike-morning', 'دوچرخه‌سواری صبحگاهی', '05:10', 'روتین', 'weekdays', workDays, 'هدف مسیر: ۲ تا ۳ کیلومتر سربالایی'),
      task('prayer-fajr', 'نماز صبح', '', 'نماز و معنویت'),
      task('breakfast', 'صبحانه، مسواک و آماده‌شدن', '06:00', 'بهداشت', 'weekdays', workDays),
      task('school', 'مدرسه', '07:30', 'درس', 'weekdays', workDays, 'ساعت مدرسه: ۷:۳۰ تا ۱۴:۰۰'),
      task('lunch-rest', 'ناهار و استراحت کوتاه', '14:30', 'استراحت', 'weekdays', workDays),
      task('study-1', 'مطالعه اول: درس سخت‌تر امروز', '16:00', 'درس', 'weekdays', workDays),
      task('study-2', 'حل تمرین و تست همان مبحث', '16:50', 'درس', 'weekdays', workDays),
      task('prayer-dhuhr', 'نماز ظهر و عصر', '', 'نماز و معنویت'),
      task('workout', 'تمرین عضلات طبق برنامه', '17:40', 'روتین', 'daily'),
      task('study-3', 'تکالیف و مطالعه درس بعدی', '18:30', 'درس', 'weekdays', workDays),
      task('study-4', 'تحلیل تست‌های غلط و مرور', '19:40', 'درس', 'weekdays', workDays),
      task('prayer-maghrib', 'نماز مغرب و عشا', '', 'نماز و معنویت'),
      task('personal-care', 'رسیدگی به پوست، مو و دندان', '20:10', 'بهداشت'),
      task('tomorrow-ready', 'آماده‌کردن کیف و لباس فردا', '20:15', 'روتین', 'weekdays', workDays),
      task('personal-goal', 'پایبندی به هدف ترک خودارضایی', '', 'خودسازی'),
      task('sleep', 'خاموش‌کردن وسایل و خواب شبانه', '20:45', 'روتین')
    ],
    counters: [
      { id: 'salawat', title: 'صلوات', phrase: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَآلِ مُحَمَّدٍ', target: 600, step: 1, enabled: true },
      { id: 'istighfar', title: 'استغفار', phrase: 'أستغفرُ اللهَ وأتوبُ إليه', target: 600, step: 1, enabled: true }
    ],
    exercises: [
      { id: 'pushups', title: 'شنا', target: 30, unit: 'تکرار', step: 1, days: [0, 1, 2, 3, 4, 5, 6], group: 'روزانه', enabled: true },
      { id: 'situps', title: 'درازونشست', target: 60, unit: 'تکرار', step: 1, days: [0, 1, 2, 3, 4, 5, 6], group: 'روزانه', enabled: true },
      { id: 'cycling', title: 'دوچرخه‌سواری صبحگاهی', target: 2.5, unit: 'کیلومتر', step: 0.5, days: workDays, group: 'هوازی', enabled: true },
      { id: 'squats', title: 'اسکوات', target: 36, unit: 'تکرار', step: 1, days: strengthDays, group: 'قدرتی', enabled: true },
      { id: 'rows', title: 'پارویی با کوله‌پشتی سبک', target: 36, unit: 'تکرار', step: 1, days: strengthDays, group: 'قدرتی', enabled: true },
      { id: 'curls', title: 'جلو بازو با بطری آب', target: 36, unit: 'تکرار', step: 1, days: strengthDays, group: 'قدرتی', enabled: true },
      { id: 'plank', title: 'پلانک', target: 90, unit: 'ثانیه', step: 5, days: strengthDays, group: 'قدرتی', enabled: true }
    ],
    taskLogs: {}, zikrLogs: {}, exerciseLogs: {}
  };
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={'rounded-2xl border border-line bg-surface p-4 shadow-sm ' + className}>{children}</section>;
}
function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'green' | 'amber' }) {
  const color = tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-accent';
  return <div className="h-2 overflow-hidden rounded-full bg-surface2"><div className={'h-full rounded-full transition-all ' + color} style={{ width: value + '%' }} /></div>;
}
function ActionButton({ children, onClick, variant = 'primary', title, disabled = false }: { children: ReactNode; onClick: () => void; variant?: 'primary' | 'soft' | 'ghost' | 'danger'; title?: string; disabled?: boolean }) {
  const styles = variant === 'primary'
    ? 'bg-accent text-accent-fg hover:opacity-90'
    : variant === 'soft'
      ? 'bg-accent-soft text-accent hover:opacity-90'
      : variant === 'danger'
        ? 'text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]'
        : 'text-muted hover:bg-surface2';
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ' + styles}>{children}</button>;
}
function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={'w-full rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 ' + (props.className || '')} />;
}
function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={'w-full rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm text-fg outline-none focus:border-accent ' + (props.className || '')} />;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1.5"><span className="block text-sm font-medium">{label}</span>{children}{hint ? <span className="block text-xs text-muted">{hint}</span> : null}</label>;
}
function ModalFrame({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><ActionButton onClick={onClose} variant="ghost" title="بستن"><X className="h-4 w-4" /></ActionButton></div>
      {children}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">{footer}</div>
    </div>
  </div>;
}
function DayPicker({ selected, onChange }: { selected: number[]; onChange: (value: number[]) => void }) {
  return <div className="flex flex-wrap gap-1.5">{DAY_SHORT.map((label, i) => <button key={label} type="button" aria-pressed={selected.includes(i)} onClick={() => onChange(selected.includes(i) ? selected.filter((d) => d !== i) : [...selected, i].sort())} className={'grid h-9 w-9 place-items-center rounded-lg border text-xs font-semibold transition ' + (selected.includes(i) ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface2 text-muted hover:text-fg')} title={DAYS[i]}>{label}</button>)}</div>;
}

export function LifeChallengeScreen() {
  const [store, setStore] = useState<LifeStore>(() => defaultStore());
  const [hydrated, setHydrated] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => localISODate());
  const [view, setView] = useState<'today' | 'zikr' | 'workout' | 'templates' | 'report' | 'settings'>('today');
  const [taskDraft, setTaskDraft] = useState<LifeTask | null>(null);
  const [counterDraft, setCounterDraft] = useState<ZikrCounter | null>(null);
  const [exerciseDraft, setExerciseDraft] = useState<Exercise | null>(null);
  const [toast, setToast] = useState('');
  const [taskFilter, setTaskFilter] = useState<'all' | 'open' | 'done'>('all');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LifeStore>;
        if (parsed.schema === 1 && Array.isArray(parsed.tasks) && Array.isArray(parsed.counters) && Array.isArray(parsed.exercises)) {
          const seed = defaultStore();
          setStore({
            ...seed, ...parsed,
            tasks: parsed.tasks as LifeTask[], counters: parsed.counters as ZikrCounter[], exercises: parsed.exercises as Exercise[],
            taskLogs: parsed.taskLogs && typeof parsed.taskLogs === 'object' ? parsed.taskLogs : {},
            zikrLogs: parsed.zikrLogs && typeof parsed.zikrLogs === 'object' ? parsed.zikrLogs : {},
            exerciseLogs: parsed.exerciseLogs && typeof parsed.exerciseLogs === 'object' ? parsed.exerciseLogs : {}
          });
        }
      }
    } catch {
      setToast('خواندن داده‌های قبلی ممکن نشد؛ داده‌های جدید پس از تغییر ذخیره می‌شوند.');
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch { setToast('فضای ذخیره‌سازی مرورگر پر شده است؛ از بخش پشتیبان‌گیری خروجی بگیر.'); }
  }, [store, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const checkReminders = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const now = new Date();
      const date = localISODate(now);
      const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const seenKey = 'planner-life-notified-v1';
      let seen: string[] = [];
      try {
        const raw = window.localStorage.getItem(seenKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) seen = parsed.filter((item): item is string => typeof item === 'string');
        }
      } catch { /* ignore damaged reminder history */ }
      let changed = false;
      for (const task of store.tasks) {
        const key = date + ':' + task.id;
        if (!task.enabled || !task.reminder || !task.time || task.time !== time || !applies(task.repeat, task.days, date) || seen.includes(key)) continue;
        try {
          new Notification(task.title, { body: 'زمان انجام این کار در برنامه روزانه است.' });
          seen.push(key);
          changed = true;
        } catch { /* browser may deny notifications */ }
      }
      if (changed) {
        try { window.localStorage.setItem(seenKey, JSON.stringify(seen.slice(-300))); } catch { /* ignore quota errors */ }
      }
    };
    const timer = window.setInterval(checkReminders, 20000);
    checkReminders();
    return () => window.clearInterval(timer);
  }, [store.tasks]);

  const dayTasks = useMemo(() => store.tasks.filter((task) => task.enabled && applies(task.repeat, task.days, selectedDate)).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')), [store.tasks, selectedDate]);
  const dayExercises = useMemo(() => store.exercises.filter((exercise) => exercise.enabled && exercise.days.includes(persianDayIndex(selectedDate))), [store.exercises, selectedDate]);
  const statuses = store.taskLogs[selectedDate] || {};
  const zikrCounts = store.zikrLogs[selectedDate] || {};
  const exerciseCounts = store.exerciseLogs[selectedDate] || {};
  const taskDone = dayTasks.filter((task) => statuses[task.id] === 'done').length;
  const taskSkipped = dayTasks.filter((task) => statuses[task.id] === 'skipped').length;
  const taskProgress = percent(taskDone, dayTasks.length);
  const zikrTarget = store.counters.filter((counter) => counter.enabled).reduce((sum, counter) => sum + counter.target, 0);
  const zikrCount = store.counters.filter((counter) => counter.enabled).reduce((sum, counter) => sum + (zikrCounts[counter.id] || 0), 0);
  const zikrProgress = percent(zikrCount, zikrTarget);
  const exerciseDone = dayExercises.filter((exercise) => (exerciseCounts[exercise.id] || 0) >= exercise.target).length;
  const exerciseProgress = percent(exerciseDone, dayExercises.length);
  const selectedDayIndex = persianDayIndex(selectedDate);
  const challengeDays = Math.max(1, Math.min(90, Math.floor((parseLocalDate(localISODate()).getTime() - parseLocalDate(store.challengeStart).getTime()) / 86400000) + 1));
  const filteredTasks = dayTasks.filter((task) => taskFilter === 'all' || (taskFilter === 'done' ? statuses[task.id] === 'done' : !statuses[task.id]));
  const groupedTasks = useMemo(() => {
    const groups: { name: TaskCategory; tasks: LifeTask[] }[] = [];
    for (const category of CATEGORIES) {
      const tasks = filteredTasks.filter((task) => task.category === category);
      if (tasks.length) groups.push({ name: category, tasks });
    }
    return groups;
  }, [filteredTasks]);

  const updateStore = (updater: (current: LifeStore) => LifeStore) => setStore((current) => updater(current));
  const setTaskStatus = (taskId: string, status: TaskStatus | null) => updateStore((current) => {
    const dateLog = { ...(current.taskLogs[selectedDate] || {}) };
    if (status) dateLog[taskId] = status; else delete dateLog[taskId];
    return { ...current, taskLogs: { ...current.taskLogs, [selectedDate]: dateLog } };
  });
  const changeZikr = (id: string, delta: number) => updateStore((current) => {
    const dayLog = { ...(current.zikrLogs[selectedDate] || {}) };
    dayLog[id] = Math.max(0, (dayLog[id] || 0) + delta);
    return { ...current, zikrLogs: { ...current.zikrLogs, [selectedDate]: dayLog } };
  });
  const setZikrToTarget = (id: string, target: number) => updateStore((current) => {
    const dayLog = { ...(current.zikrLogs[selectedDate] || {}) };
    dayLog[id] = target;
    return { ...current, zikrLogs: { ...current.zikrLogs, [selectedDate]: dayLog } };
  });
  const changeExercise = (id: string, delta: number) => updateStore((current) => {
    const dayLog = { ...(current.exerciseLogs[selectedDate] || {}) };
    const exercise = current.exercises.find((item) => item.id === id);
    if (!exercise) return current;
    const next = Math.max(0, Math.round(((dayLog[id] || 0) + delta) * 100) / 100);
    dayLog[id] = next;
    return { ...current, exerciseLogs: { ...current.exerciseLogs, [selectedDate]: dayLog } };
  });
  const exerciseToTarget = (exercise: Exercise) => changeExercise(exercise.id, (exerciseCounts[exercise.id] || 0) >= exercise.target ? -(exerciseCounts[exercise.id] || 0) : exercise.target - (exerciseCounts[exercise.id] || 0));

  const openTaskEditor = (task?: LifeTask) => setTaskDraft(task ? { ...task, days: [...task.days] } : {
    id: makeId('task'), title: '', category: 'روتین', time: '', repeat: 'daily', days: [selectedDayIndex],
    enabled: true, reminder: false, notes: ''
  });
  const saveTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskDraft || !taskDraft.title.trim()) { setToast('نام کار را وارد کن.'); return; }
    if (taskDraft.repeat === 'custom' && !taskDraft.days.length) { setToast('حداقل یک روز برای تکرار انتخاب کن.'); return; }
    updateStore((current) => {
      const exists = current.tasks.some((task) => task.id === taskDraft.id);
      return { ...current, tasks: exists ? current.tasks.map((task) => task.id === taskDraft.id ? { ...taskDraft, title: taskDraft.title.trim() } : task) : [...current.tasks, { ...taskDraft, title: taskDraft.title.trim() }] };
    });
    setTaskDraft(null); setToast('کار ذخیره شد.');
  };
  const removeTask = (task: LifeTask) => {
    if (!window.confirm('کار «' + task.title + '» حذف شود؟ تاریخچه انجام آن حفظ می‌شود.')) return;
    updateStore((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }));
    setToast('کار حذف شد.');
  };

  const openCounterEditor = (counter?: ZikrCounter) => setCounterDraft(counter ? { ...counter } : { id: makeId('zikr'), title: '', phrase: '', target: 100, step: 1, enabled: true });
  const saveCounter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!counterDraft || !counterDraft.title.trim() || !counterDraft.phrase.trim()) { setToast('نام ذکر و متن آن را وارد کن.'); return; }
    if (counterDraft.target < 1 || counterDraft.step < 1) { setToast('هدف و گام شمارنده باید حداقل ۱ باشند.'); return; }
    updateStore((current) => ({ ...current, counters: current.counters.some((item) => item.id === counterDraft.id) ? current.counters.map((item) => item.id === counterDraft.id ? { ...counterDraft, title: counterDraft.title.trim(), phrase: counterDraft.phrase.trim() } : item) : [...current.counters, { ...counterDraft, title: counterDraft.title.trim(), phrase: counterDraft.phrase.trim() }] }));
    setCounterDraft(null); setToast('ذکرشمار ذخیره شد.');
  };
  const removeCounter = (counter: ZikrCounter) => {
    if (!window.confirm('ذکرشمار «' + counter.title + '» حذف شود؟')) return;
    updateStore((current) => ({ ...current, counters: current.counters.filter((item) => item.id !== counter.id) }));
    setToast('ذکرشمار حذف شد.');
  };

  const openExerciseEditor = (exercise?: Exercise) => setExerciseDraft(exercise ? { ...exercise, days: [...exercise.days] } : {
    id: makeId('exercise'), title: '', target: 10, unit: 'تکرار', step: 1, days: [selectedDayIndex], group: 'روزانه', enabled: true
  });
  const saveExercise = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!exerciseDraft || !exerciseDraft.title.trim()) { setToast('نام تمرین را وارد کن.'); return; }
    if (exerciseDraft.target <= 0 || exerciseDraft.step <= 0 || !exerciseDraft.days.length) { setToast('هدف، گام و حداقل یک روز معتبر وارد کن.'); return; }
    updateStore((current) => ({ ...current, exercises: current.exercises.some((item) => item.id === exerciseDraft.id) ? current.exercises.map((item) => item.id === exerciseDraft.id ? { ...exerciseDraft, title: exerciseDraft.title.trim() } : item) : [...current.exercises, { ...exerciseDraft, title: exerciseDraft.title.trim() }] }));
    setExerciseDraft(null); setToast('تمرین ذخیره شد.');
  };
  const removeExercise = (exercise: Exercise) => {
    if (!window.confirm('تمرین «' + exercise.title + '» حذف شود؟')) return;
    updateStore((current) => ({ ...current, exercises: current.exercises.filter((item) => item.id !== exercise.id) }));
    setToast('تمرین حذف شد.');
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'life-challenge-backup-' + localISODate() + '.json'; link.click();
    URL.revokeObjectURL(url); setToast('فایل پشتیبان آماده شد.');
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<LifeStore>;
      if (parsed.schema !== 1 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.counters) || !Array.isArray(parsed.exercises) || !parsed.taskLogs || !parsed.zikrLogs || !parsed.exerciseLogs) throw new Error('ساختار فایل با پشتیبان چالش زندگی سازگار نیست.');
      if (!window.confirm('اطلاعات فعلی با محتوای فایل جایگزین شود؟ قبلش از اطلاعات فعلی خروجی بگیر.')) return;
      setStore(parsed as LifeStore); setToast('پشتیبان بازیابی شد.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'فایل پشتیبان خوانده نشد.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };
  const resetToday = () => {
    if (!window.confirm('ثبت‌های ذکر، ورزش و تسک‌های این روز پاک شوند؟ تعریف برنامه‌ها حذف نمی‌شود.')) return;
    updateStore((current) => {
      const taskLogs = { ...current.taskLogs }; delete taskLogs[selectedDate];
      const zikrLogs = { ...current.zikrLogs }; delete zikrLogs[selectedDate];
      const exerciseLogs = { ...current.exerciseLogs }; delete exerciseLogs[selectedDate];
      return { ...current, taskLogs, zikrLogs, exerciseLogs };
    });
    setToast('ثبت‌های این روز پاک شد.');
  };
  const restartChallenge = () => {
    if (!window.confirm('روز اول چالش از امروز شروع شود؟ تاریخچه فعلی پاک نمی‌شود.')) return;
    updateStore((current) => ({ ...current, challengeStart: localISODate() }));
    setToast('چالش از امروز شروع شد.');
  };

  const weekRows = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(selectedDate, i - 6);
    const tasks = store.tasks.filter((task) => task.enabled && applies(task.repeat, task.days, date));
    const logs = store.taskLogs[date] || {};
    const exs = store.exercises.filter((exercise) => exercise.enabled && exercise.days.includes(persianDayIndex(date)));
    const exLogs = store.exerciseLogs[date] || {};
    const doneTasks = tasks.filter((task) => logs[task.id] === 'done').length;
    const doneExs = exs.filter((exercise) => (exLogs[exercise.id] || 0) >= exercise.target).length;
    const rate = percent(doneTasks + doneExs, tasks.length + exs.length);
    const count = Object.values(store.zikrLogs[date] || {}).reduce((sum, val) => sum + val, 0);
    return { date, tasks: tasks.length, doneTasks, exercises: exs.length, doneExs, rate, zikr: count };
  }), [selectedDate, store]);

  const tabs = [
    { id: 'today' as const, label: 'امروز', icon: <CalendarDays className="h-4 w-4" /> },
    { id: 'zikr' as const, label: 'ذکرشمار', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'workout' as const, label: 'ورزش‌ها', icon: <Dumbbell className="h-4 w-4" /> },
    { id: 'templates' as const, label: 'برنامه‌ها', icon: <RotateCcw className="h-4 w-4" /> },
    { id: 'report' as const, label: 'گزارش', icon: <Activity className="h-4 w-4" /> },
    { id: 'settings' as const, label: 'پشتیبان و تنظیمات', icon: <Settings2 className="h-4 w-4" /> }
  ];

  return <div className="space-y-5 pb-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-accent"><HeartPulse className="h-4 w-4" /> چالش شخصی ۹۰ روزه</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">زندگی بهتر، هر روز</h1>
        <p className="mt-2 text-sm text-muted">{formatDate(selectedDate)} <span className="mx-1">·</span> روز {progressText(challengeDays)} از ۹۰</p>
      </div>
      <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
        <ActionButton variant="ghost" onClick={() => setSelectedDate((date) => shiftDate(date, -1))} title="روز قبل"><ArrowRight className="h-4 w-4" /></ActionButton>
        <TextInput aria-label="انتخاب تاریخ" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="w-[145px] border-0 bg-transparent px-1" />
        <ActionButton variant="ghost" onClick={() => setSelectedDate((date) => shiftDate(date, 1))} title="روز بعد"><ArrowLeft className="h-4 w-4" /></ActionButton>
        <ActionButton variant="soft" onClick={() => setSelectedDate(localISODate())}>امروز</ActionButton>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Panel>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted">تسک‌های انجام‌شده</p><p className="mt-1 text-2xl font-bold">{progressText(taskDone)} <span className="text-sm font-normal text-muted">از {progressText(dayTasks.length)}</span></p></div><span className="rounded-xl bg-accent-soft p-2.5 text-accent"><CheckCircle2 className="h-5 w-5" /></span></div>
        <ProgressBar value={taskProgress} />
        <p className="mt-2 text-xs text-muted">{progressText(taskProgress)}٪ انجام شده{taskSkipped ? ' · ' + progressText(taskSkipped) + ' مورد رد شده' : ''}</p>
      </Panel>
      <Panel>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted">ذکرهای امروز</p><p className="mt-1 text-2xl font-bold">{progressText(zikrCount)} <span className="text-sm font-normal text-muted">از {progressText(zikrTarget)}</span></p></div><span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600"><Sparkles className="h-5 w-5" /></span></div>
        <ProgressBar value={zikrProgress} tone="amber" />
        <p className="mt-2 text-xs text-muted">{progressText(zikrProgress)}٪ از مجموع هدف ذکرشمارهای فعال</p>
      </Panel>
      <Panel>
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted">تمرین‌های تکمیل‌شده</p><p className="mt-1 text-2xl font-bold">{progressText(exerciseDone)} <span className="text-sm font-normal text-muted">از {progressText(dayExercises.length)}</span></p></div><span className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600"><Dumbbell className="h-5 w-5" /></span></div>
        <ProgressBar value={exerciseProgress} tone="green" />
        <p className="mt-2 text-xs text-muted">{progressText(exerciseProgress)}٪ هدف‌های تمرینی تکمیل شده</p>
      </Panel>
    </div>

    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 hide-scrollbar" role="tablist" aria-label="بخش‌های چالش">
      {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)} className={'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ' + (view === tab.id ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:bg-surface2 hover:text-fg')}>{tab.icon}<span>{tab.label}</span></button>)}
    </div>

    {view === 'today' ? <div className="space-y-4">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">برنامه امروز</h2><p className="mt-1 text-xs text-muted">کارها را تیک بزن؛ وضعیت هر تاریخ جداگانه ذخیره می‌شود.</p></div>
          <div className="flex items-center gap-2"><SelectInput aria-label="فیلتر تسک‌ها" value={taskFilter} onChange={(event) => setTaskFilter(event.target.value as 'all' | 'open' | 'done')} className="w-auto min-w-28"><option value="all">همه کارها</option><option value="open">انجام‌نشده</option><option value="done">انجام‌شده</option></SelectInput><ActionButton onClick={() => openTaskEditor()}><Plus className="h-4 w-4" /> کار جدید</ActionButton></div>
        </div>
        {groupedTasks.length ? <div className="space-y-5">{groupedTasks.map((group) => <div key={group.name}><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted"><span>{group.name}</span><span className="h-px flex-1 bg-line" /></div><div className="space-y-2">{group.tasks.map((task) => {
          const status = statuses[task.id];
          return <div key={task.id} className={'flex items-center gap-3 rounded-xl border p-3 transition ' + (status === 'done' ? 'border-emerald-500/25 bg-emerald-500/5' : status === 'skipped' ? 'border-line bg-surface2 opacity-70' : 'border-line bg-surface hover:bg-surface2/60')}>
            <button type="button" aria-label={status === 'done' ? 'برداشتن تیک' : 'ثبت انجام'} aria-pressed={status === 'done'} onClick={() => setTaskStatus(task.id, status === 'done' ? null : 'done')} className={'grid h-8 w-8 shrink-0 place-items-center rounded-full border transition ' + (status === 'done' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-line text-muted hover:border-accent hover:text-accent')}>{status === 'done' ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}</button>
            <div className="min-w-0 flex-1"><p className={'text-sm font-medium ' + (status === 'done' ? 'text-muted line-through' : '')}>{task.title}</p><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-muted">{task.time ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{task.time}</span> : null}<span>{repeatLabel(task)}</span>{task.reminder ? <span>یادآور روشن</span> : null}</div>{task.notes ? <p className="mt-1 text-xs text-muted">{task.notes}</p> : null}</div>
            <div className="flex shrink-0 items-center gap-0.5"><ActionButton variant="ghost" title="رد کردن این مورد" onClick={() => setTaskStatus(task.id, status === 'skipped' ? null : 'skipped')}><X className={'h-4 w-4 ' + (status === 'skipped' ? 'text-amber-600' : '')} /></ActionButton><ActionButton variant="ghost" title="ویرایش کار" onClick={() => openTaskEditor(task)}><Pencil className="h-4 w-4" /></ActionButton></div>
          </div>;
        })}</div></div>)}</div> : <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-muted" /><p className="mt-2 text-sm font-medium">کاری برای این فیلتر نیست</p><p className="mt-1 text-xs text-muted">فیلتر دیگری انتخاب کن یا یک کار جدید بساز.</p></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"><p className="text-xs text-muted">تیک و رد کردن قابل برگشت است.</p><ActionButton variant="ghost" onClick={resetToday}><RotateCcw className="h-3.5 w-3.5" /> پاک‌کردن ثبت‌های این روز</ActionButton></div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">ذکرشمارهای فعال</h2><p className="mt-1 text-xs text-muted">با یک لمس، تعداد را افزایش بده.</p></div><ActionButton variant="soft" onClick={() => setView('zikr')}>باز کردن ذکرشمار</ActionButton></div>
          <div className="mt-4 space-y-3">{store.counters.filter((item) => item.enabled).slice(0, 3).map((counter) => {
            const count = zikrCounts[counter.id] || 0;
            return <div key={counter.id} className="rounded-xl border border-line p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{counter.title}</span><span className="numeral text-sm font-bold">{progressText(count)} / {progressText(counter.target)}</span></div><ProgressBar value={percent(count, counter.target)} tone="amber" /><div className="mt-2 flex justify-end gap-2"><ActionButton variant="soft" onClick={() => changeZikr(counter.id, 1)}><Plus className="h-3.5 w-3.5" /> ۱</ActionButton><ActionButton variant="soft" onClick={() => changeZikr(counter.id, 33)}>+۳۳</ActionButton></div></div>;
          })}</div>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">تمرین‌های امروز</h2><p className="mt-1 text-xs text-muted">هدف هر حرکت و مقدار ثبت‌شده را ببین.</p></div><ActionButton variant="soft" onClick={() => setView('workout')}>باز کردن ورزش</ActionButton></div>
          <div className="mt-4 space-y-3">{dayExercises.slice(0, 4).map((exercise) => {
            const count = exerciseCounts[exercise.id] || 0;
            const done = count >= exercise.target;
            return <div key={exercise.id} className="flex items-center gap-3 rounded-xl border border-line p-3"><span className={'grid h-9 w-9 place-items-center rounded-xl ' + (done ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface2 text-muted')}>{done ? <Check className="h-4 w-4" /> : <Dumbbell className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{exercise.title}</p><p className="mt-0.5 text-xs text-muted">{progressText(count)} از {progressText(exercise.target)} {exercise.unit}</p></div><ActionButton variant="soft" onClick={() => changeExercise(exercise.id, exercise.step)}><Plus className="h-4 w-4" /></ActionButton></div>;
          })}</div>
        </Panel>
      </div>
    </div> : null}

    {view === 'zikr' ? <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">ذکرشمار شخصی</h2><p className="mt-1 text-sm text-muted">ذکر تازه بساز، متن و هدف و گام شمارنده را خودت تعیین کن. آمار هر روز جدا می‌ماند.</p></div><div className="flex gap-2"><ActionButton variant="ghost" onClick={() => { if (window.confirm('تمام شمارنده‌های ذکر در این تاریخ صفر شوند؟')) updateStore((current) => { const logs = { ...current.zikrLogs }; delete logs[selectedDate]; return { ...current, zikrLogs: logs }; }); }}><RotateCcw className="h-4 w-4" /> صفرکردن روز</ActionButton><ActionButton onClick={() => openCounterEditor()}><Plus className="h-4 w-4" /> ذکر جدید</ActionButton></div></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{store.counters.filter((counter) => counter.enabled).map((counter) => {
          const count = zikrCounts[counter.id] || 0;
          const rate = percent(count, counter.target);
          return <article key={counter.id} className="rounded-2xl border border-line bg-surface2/50 p-4">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-semibold">{counter.title}</h3><p className="mt-1 text-sm leading-7 text-muted" dir="rtl">{counter.phrase}</p></div><div className="flex gap-0.5"><ActionButton variant="ghost" title="ویرایش ذکر" onClick={() => openCounterEditor(counter)}><Pencil className="h-4 w-4" /></ActionButton><ActionButton variant="ghost" title="حذف ذکرشمار" onClick={() => removeCounter(counter)}><Trash2 className="h-4 w-4" /></ActionButton></div></div>
            <div className="my-5 text-center"><p className="numeral text-4xl font-bold tracking-tight">{progressText(count)}</p><p className="mt-1 text-xs text-muted">هدف روزانه {progressText(counter.target)} بار</p></div>
            <ProgressBar value={rate} tone="amber" /><div className="mt-2 flex justify-between text-xs text-muted"><span>{progressText(rate)}٪</span><span>{count >= counter.target ? 'هدف تکمیل شد' : progressText(Math.max(0, counter.target - count)) + ' تا هدف'}</span></div>
            <div className="mt-4 grid grid-cols-5 gap-2"><ActionButton variant="soft" onClick={() => changeZikr(counter.id, -1)} title="یک عدد کم کن"><Minus className="h-4 w-4" /></ActionButton><ActionButton variant="soft" onClick={() => changeZikr(counter.id, 1)}>+۱</ActionButton><ActionButton variant="soft" onClick={() => changeZikr(counter.id, 10)}>+۱۰</ActionButton><ActionButton variant="soft" onClick={() => changeZikr(counter.id, 33)}>+۳۳</ActionButton><ActionButton variant="soft" onClick={() => changeZikr(counter.id, 100)}>+۱۰۰</ActionButton></div>
            <div className="mt-2 flex gap-2"><ActionButton onClick={() => setZikrToTarget(counter.id, counter.target)}><Check className="h-4 w-4" /> ثبت تکمیل هدف</ActionButton><ActionButton variant="ghost" onClick={() => changeZikr(counter.id, -count)}>صفرکردن این ذکر</ActionButton></div>
          </article>;
        })}</div>
        {store.counters.some((counter) => !counter.enabled) ? <div className="mt-5 rounded-xl border border-dashed border-line p-3"><p className="mb-2 text-xs font-semibold text-muted">ذکرشمارهای غیرفعال</p><div className="space-y-2">{store.counters.filter((counter) => !counter.enabled).map((counter) => <div key={counter.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface2 px-3 py-2"><span className="text-sm">{counter.title}</span><div className="flex gap-1"><ActionButton variant="soft" onClick={() => updateStore((current) => ({ ...current, counters: current.counters.map((item) => item.id === counter.id ? { ...item, enabled: true } : item) }))}>فعال‌کردن</ActionButton><ActionButton variant="ghost" onClick={() => openCounterEditor(counter)}><Pencil className="h-3.5 w-3.5" /></ActionButton></div></div>)}</div></div> : null}
        {!store.counters.some((counter) => counter.enabled) ? <div className="py-12 text-center text-sm text-muted">ذکرشمار فعالی وجود ندارد. یک ذکر اضافه کن.</div> : null}
      </Panel>
      <Panel><h3 className="font-semibold">نکته</h3><p className="mt-1 text-sm leading-7 text-muted">شمارنده ابزار ثبت تعداد است؛ می‌توانی هدف را متناسب با برنامه روزانه خودت تنظیم کنی. متن ذکر و تعداد ثبت‌شده فقط در ذخیره‌سازی همین مرورگر نگه‌داری می‌شوند.</p></Panel>
    </div> : null}

    {view === 'workout' ? <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">تمرین‌های بدن و استقامت</h2><p className="mt-1 text-sm text-muted">هدف، واحد، مقدار انجام‌شده و روزهای تکرار هر حرکت قابل ویرایش است.</p></div><ActionButton onClick={() => openExerciseEditor()}><Plus className="h-4 w-4" /> تمرین جدید</ActionButton></div>
        <div className="mt-4 space-y-3">{(['روزانه', 'هوازی', 'قدرتی'] as const).map((group) => {
          const list = store.exercises.filter((exercise) => exercise.enabled && exercise.group === group);
          if (!list.length) return null;
          return <div key={group}><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted"><span>{group === 'روزانه' ? 'چالش روزانه' : group === 'هوازی' ? 'دوچرخه‌سواری و هوازی' : 'تقویت عضلات'}</span><span className="h-px flex-1 bg-line" /></div><div className="grid gap-3 md:grid-cols-2">{list.map((exercise) => {
            const count = exerciseCounts[exercise.id] || 0;
            const rate = percent(count, exercise.target);
            const done = count >= exercise.target;
            return <article key={exercise.id} className="rounded-2xl border border-line p-4">
              <div className="flex items-start gap-3"><span className={'grid h-10 w-10 shrink-0 place-items-center rounded-xl ' + (done ? 'bg-emerald-500/10 text-emerald-600' : 'bg-accent-soft text-accent')}>{done ? <CheckCircle2 className="h-5 w-5" /> : group === 'هوازی' ? <Bike className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{exercise.title}</h3><div className="flex gap-0.5"><ActionButton variant="ghost" title="ویرایش تمرین" onClick={() => openExerciseEditor(exercise)}><Pencil className="h-4 w-4" /></ActionButton><ActionButton variant="ghost" title="حذف تمرین" onClick={() => removeExercise(exercise)}><Trash2 className="h-4 w-4" /></ActionButton></div></div><p className="mt-1 text-xs text-muted">{exercise.days.map((day) => DAYS[day]).join('، ') || 'بدون روز برنامه‌ریزی‌شده'}</p></div></div>
              <div className="my-4 flex items-end justify-between gap-3"><div><span className="numeral text-3xl font-bold">{progressText(count)}</span><span className="mr-1 text-sm text-muted">/ {progressText(exercise.target)} {exercise.unit}</span></div><span className={'text-xs font-semibold ' + (done ? 'text-emerald-600' : 'text-muted')}>{done ? 'هدف کامل شد' : progressText(rate) + '٪'}</span></div>
              <ProgressBar value={rate} tone={done ? 'green' : 'accent'} />
              <div className="mt-4 grid grid-cols-4 gap-2"><ActionButton variant="soft" onClick={() => changeExercise(exercise.id, -exercise.step)}><Minus className="h-4 w-4" /></ActionButton><ActionButton variant="soft" onClick={() => changeExercise(exercise.id, exercise.step)}>+{progressText(exercise.step)}</ActionButton><ActionButton variant="soft" onClick={() => changeExercise(exercise.id, exercise.step * 5)}>+{progressText(exercise.step * 5)}</ActionButton><ActionButton onClick={() => exerciseToTarget(exercise)}>{done ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}{done ? 'بازنشانی' : 'تکمیل هدف'}</ActionButton></div>
            </article>;
          })}</div></div>;
        })}</div>
        {store.exercises.some((exercise) => !exercise.enabled) ? <div className="mt-5 rounded-xl border border-dashed border-line p-3"><p className="mb-2 text-xs font-semibold text-muted">تمرین‌های غیرفعال</p><div className="space-y-2">{store.exercises.filter((exercise) => !exercise.enabled).map((exercise) => <div key={exercise.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface2 px-3 py-2"><span className="text-sm">{exercise.title}</span><ActionButton variant="soft" onClick={() => updateStore((current) => ({ ...current, exercises: current.exercises.map((item) => item.id === exercise.id ? { ...item, enabled: true } : item) }))}>فعال‌کردن</ActionButton></div>)}</div></div> : null}
        {!store.exercises.length ? <div className="py-12 text-center text-sm text-muted">تمرینی ثبت نشده. حرکت دلخواهت را اضافه کن.</div> : null}
      </Panel>
      <Panel><h3 className="font-semibold">ثبت مقدار واقعی</h3><p className="mt-1 text-sm leading-7 text-muted">برای شنا و درازونشست می‌توانی مقدار را چند مرحله ثبت کنی. تعداد ثبت‌شده در تاریخ انتخاب‌شده می‌ماند و با رفتن به فردا دوباره از صفر شروع می‌شود؛ سابقه روزهای قبل پاک نمی‌شود.</p></Panel>
    </div> : null}

    {view === 'templates' ? <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">قالب برنامه و تکرار تسک‌ها</h2><p className="mt-1 text-sm text-muted">تسک تکرارشونده یک‌بار ساخته می‌شود؛ هر روز ثبت انجام جداگانه دارد.</p></div><ActionButton onClick={() => openTaskEditor()}><Plus className="h-4 w-4" /> تسک جدید</ActionButton></div>
        <div className="mt-4 space-y-2">{store.tasks.map((task) => <div key={task.id} className={'flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 ' + (!task.enabled ? 'opacity-50' : '')}><span className="grid h-9 w-9 place-items-center rounded-xl bg-surface2 text-muted"><BookOpen className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{task.title}</p><p className="mt-1 text-xs text-muted">{task.category} · {task.time || 'بدون ساعت ثابت'} · {repeatLabel(task)}</p></div><ActionButton variant="ghost" onClick={() => updateStore((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, enabled: !item.enabled } : item) }))}>{task.enabled ? 'خاموش‌کردن' : 'فعال‌کردن'}</ActionButton><ActionButton variant="ghost" title="ویرایش" onClick={() => openTaskEditor(task)}><Pencil className="h-4 w-4" /></ActionButton><ActionButton variant="ghost" title="حذف" onClick={() => removeTask(task)}><Trash2 className="h-4 w-4" /></ActionButton></div>)}</div>
      </Panel>
    </div> : null}

    {view === 'report' ? <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">گزارش هفت روز اخیر</h2><p className="mt-1 text-sm text-muted">بر اساس تاریخ انتخاب‌شده و ثبت‌هایی که انجام داده‌ای.</p></div><div className="rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent">روز {progressText(challengeDays)} / ۹۰</div></div>
        <div className="mt-5 space-y-4">{weekRows.map((row) => <div key={row.date} className="grid grid-cols-[95px_1fr_62px] items-center gap-3"><div><p className="text-xs font-medium">{new Intl.DateTimeFormat('fa-IR', { weekday: 'short' }).format(parseLocalDate(row.date))}</p><p className="mt-0.5 text-[0.65rem] text-muted">{formatDate(row.date).split('، ').slice(-1)[0]}</p></div><div><ProgressBar value={row.rate} tone={row.rate === 100 ? 'green' : 'accent'} /><p className="mt-1 text-[0.65rem] text-muted">{progressText(row.doneTasks + row.doneExs)} از {progressText(row.tasks + row.exercises)} تسک و تمرین</p></div><div className="text-left"><p className="numeral text-sm font-semibold">{progressText(row.rate)}٪</p><p className="mt-1 text-[0.65rem] text-muted">{progressText(row.zikr)} ذکر</p></div></div>)}</div>
      </Panel>
      <Panel>
        <h3 className="font-semibold">راهنمای آمار</h3><p className="mt-1 text-sm leading-7 text-muted">درصد روزانه، تسک‌های ثبت‌شده به‌عنوان «انجام شد» و تمرین‌هایی را محاسبه می‌کند که به هدف رسیده‌اند. «رد شده» جزو انجام‌شده حساب نمی‌شود. اگر روزی بخشی از برنامه انجام نشد، تاریخچه حفظ می‌شود و می‌توانی از فردا ادامه بدهی.</p>
      </Panel>
    </div> : null}

    {view === 'settings' ? <div className="space-y-4">
      <Panel>
        <h2 className="text-lg font-semibold">پشتیبان‌گیری و داده‌ها</h2><p className="mt-1 text-sm leading-7 text-muted">برنامه بدون حساب کاربری است؛ کارها، شمارنده‌ها و تاریخچه در حافظه محلی مرورگر ذخیره می‌شوند. برای جلوگیری از دست‌رفتن داده‌ها، هر چند وقت یک‌بار خروجی JSON بگیر.</p>
        <div className="mt-4 flex flex-wrap gap-2"><ActionButton onClick={exportBackup}><Download className="h-4 w-4" /> دانلود پشتیبان</ActionButton><ActionButton variant="soft" onClick={() => importRef.current?.click()}><Upload className="h-4 w-4" /> بازیابی پشتیبان</ActionButton><input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importBackup(event.target.files?.[0])} /></div>
      </Panel>
      <Panel>
        <h2 className="font-semibold">چالش ۹۰ روزه</h2><p className="mt-1 text-sm text-muted">شروع فعلی: {formatDate(store.challengeStart)}. شروع دوباره فقط شماره روز چالش را از امروز حساب می‌کند و تاریخچه ثبت‌شده را پاک نمی‌کند.</p><div className="mt-3 flex flex-wrap gap-2"><ActionButton variant="soft" onClick={restartChallenge}><RotateCcw className="h-4 w-4" /> شروع دوباره شمارش ۹۰ روز</ActionButton><ActionButton variant="ghost" onClick={() => setSelectedDate(localISODate())}><CalendarDays className="h-4 w-4" /> رفتن به امروز</ActionButton></div>
      </Panel>
      <Panel>
        <h2 className="font-semibold">حریم خصوصی</h2><div className="mt-3 flex items-start gap-3"><span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600"><ShieldCheck className="h-5 w-5" /></span><p className="text-sm leading-7 text-muted">اطلاعات این بخش در localStorage مرورگر همین دستگاه ذخیره می‌شود و به سرور ارسال نمی‌شود. اگر داده‌های مرورگر را پاک کنی، ممکن است اطلاعات حذف شوند؛ از فایل پشتیبان استفاده کن. برای یادآوری حین بسته‌بودن کامل مرورگر، این بخش به‌تنهایی اعلان تضمین‌شده اجرا نمی‌کند.</p></div>
      </Panel>
      <Panel>
        <h2 className="font-semibold">پاک‌کردن ثبت‌های روز</h2><p className="mt-1 text-sm text-muted">برای تاریخ انتخاب‌شده، تیک کارها و تعداد ذکرها و تمرین‌ها را حذف می‌کند. تعریف کارها، تمرین‌ها و شمارنده‌ها باقی می‌ماند.</p><div className="mt-3"><ActionButton variant="danger" onClick={resetToday}><Trash2 className="h-4 w-4" /> پاک‌کردن ثبت‌های این روز</ActionButton></div>
      </Panel>
    </div> : null}

    {taskDraft ? <ModalFrame title={store.tasks.some((task) => task.id === taskDraft.id) ? 'ویرایش تسک' : 'تسک جدید'} onClose={() => setTaskDraft(null)} footer={<><ActionButton variant="ghost" onClick={() => setTaskDraft(null)}>انصراف</ActionButton><ActionButton onClick={() => document.getElementById('life-task-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}><Save className="h-4 w-4" /> ذخیره تسک</ActionButton></>}>
      <form id="life-task-form" onSubmit={saveTask} className="space-y-4">
        <Field label="عنوان کار"><TextInput autoFocus value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} placeholder="مثلاً مرور زیست یا مسواک شب" /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="دسته‌بندی"><SelectInput value={taskDraft.category} onChange={(event) => setTaskDraft({ ...taskDraft, category: event.target.value as TaskCategory })}>{CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</SelectInput></Field><Field label="ساعت (اختیاری)"><TextInput type="time" value={taskDraft.time} onChange={(event) => setTaskDraft({ ...taskDraft, time: event.target.value })} /></Field></div>
        <Field label="تکرار"><SelectInput value={taskDraft.repeat} onChange={(event) => setTaskDraft({ ...taskDraft, repeat: event.target.value as RepeatMode })}><option value="daily">هر روز</option><option value="weekdays">شنبه تا پنجشنبه</option><option value="friday">فقط جمعه</option><option value="custom">روزهای انتخابی</option></SelectInput></Field>
        {taskDraft.repeat === 'custom' ? <Field label="روزهای تکرار"><DayPicker selected={taskDraft.days} onChange={(days) => setTaskDraft({ ...taskDraft, days })} /></Field> : null}
        <Field label="توضیح (اختیاری)"><textarea value={taskDraft.notes} onChange={(event) => setTaskDraft({ ...taskDraft, notes: event.target.value })} rows={2} className="w-full rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm outline-none focus:border-accent" placeholder="جزئیات یا هدف این کار" /></Field>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"><span><span className="block text-sm font-medium">فعال بودن برنامه</span><span className="mt-1 block text-xs text-muted">تسک غیرفعال در فهرست روزانه ظاهر نمی‌شود.</span></span><input type="checkbox" checked={taskDraft.enabled} onChange={(event) => setTaskDraft({ ...taskDraft, enabled: event.target.checked })} className="h-4 w-4 accent-[var(--accent)]" /></label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"><span><span className="block text-sm font-medium">یادآور اعلان مرورگر</span><span className="mt-1 block text-xs text-muted">برای یادآوری، ساعت کار را هم انتخاب کن؛ اعلان وقتی برنامه/مرورگر فعال باشد بررسی می‌شود.</span></span><input type="checkbox" checked={taskDraft.reminder} onChange={async (event) => { const enabled = event.target.checked; if (enabled) { if (typeof Notification === 'undefined') { setToast('این مرورگر اعلان را پشتیبانی نمی‌کند.'); return; } const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); if (permission !== 'granted') { setToast('اجازه اعلان داده نشد.'); return; } } setTaskDraft({ ...taskDraft, reminder: enabled }); }} className="h-4 w-4 accent-[var(--accent)]" /></label>
      </form>
    </ModalFrame> : null}

    {counterDraft ? <ModalFrame title={store.counters.some((item) => item.id === counterDraft.id) ? 'ویرایش ذکرشمار' : 'ذکرشمار جدید'} onClose={() => setCounterDraft(null)} footer={<><ActionButton variant="ghost" onClick={() => setCounterDraft(null)}>انصراف</ActionButton><ActionButton onClick={() => document.getElementById('life-counter-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}><Save className="h-4 w-4" /> ذخیره ذکر</ActionButton></>}>
      <form id="life-counter-form" onSubmit={saveCounter} className="space-y-4">
        <Field label="نام ذکر"><TextInput autoFocus value={counterDraft.title} onChange={(event) => setCounterDraft({ ...counterDraft, title: event.target.value })} placeholder="مثلاً صلوات" /></Field>
        <Field label="متن ذکر" hint="متن دلخواهت را بنویس؛ عربی، فارسی یا هر متن دیگری."><textarea value={counterDraft.phrase} onChange={(event) => setCounterDraft({ ...counterDraft, phrase: event.target.value })} rows={3} dir="auto" className="w-full rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm leading-7 outline-none focus:border-accent" placeholder="متن کامل ذکر" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="هدف روزانه"><TextInput type="number" min={1} step={1} value={counterDraft.target} onChange={(event) => setCounterDraft({ ...counterDraft, target: Number(event.target.value) })} /></Field><Field label="گام افزایش"><SelectInput value={counterDraft.step} onChange={(event) => setCounterDraft({ ...counterDraft, step: Number(event.target.value) })}><option value={1}>۱</option><option value={10}>۱۰</option><option value={33}>۳۳</option><option value={100}>۱۰۰</option></SelectInput></Field></div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"><span className="text-sm font-medium">نمایش در ذکرشمار</span><input type="checkbox" checked={counterDraft.enabled} onChange={(event) => setCounterDraft({ ...counterDraft, enabled: event.target.checked })} className="h-4 w-4 accent-[var(--accent)]" /></label>
      </form>
    </ModalFrame> : null}

    {exerciseDraft ? <ModalFrame title={store.exercises.some((item) => item.id === exerciseDraft.id) ? 'ویرایش تمرین' : 'تمرین جدید'} onClose={() => setExerciseDraft(null)} footer={<><ActionButton variant="ghost" onClick={() => setExerciseDraft(null)}>انصراف</ActionButton><ActionButton onClick={() => document.getElementById('life-exercise-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}><Save className="h-4 w-4" /> ذخیره تمرین</ActionButton></>}>
      <form id="life-exercise-form" onSubmit={saveExercise} className="space-y-4">
        <Field label="نام حرکت"><TextInput autoFocus value={exerciseDraft.title} onChange={(event) => setExerciseDraft({ ...exerciseDraft, title: event.target.value })} placeholder="مثلاً شنا یا دوچرخه‌سواری" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="هدف"><TextInput type="number" min={0.1} step="any" value={exerciseDraft.target} onChange={(event) => setExerciseDraft({ ...exerciseDraft, target: Number(event.target.value) })} /></Field><Field label="واحد"><SelectInput value={exerciseDraft.unit} onChange={(event) => setExerciseDraft({ ...exerciseDraft, unit: event.target.value as Exercise['unit'] })}><option value="تکرار">تکرار</option><option value="دقیقه">دقیقه</option><option value="ثانیه">ثانیه</option><option value="کیلومتر">کیلومتر</option></SelectInput></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="مقدار دکمه افزایش"><TextInput type="number" min={0.1} step="any" value={exerciseDraft.step} onChange={(event) => setExerciseDraft({ ...exerciseDraft, step: Number(event.target.value) })} /></Field><Field label="گروه"><SelectInput value={exerciseDraft.group} onChange={(event) => setExerciseDraft({ ...exerciseDraft, group: event.target.value as Exercise['group'] })}><option value="روزانه">چالش روزانه</option><option value="هوازی">هوازی</option><option value="قدرتی">قدرتی</option></SelectInput></Field></div>
        <Field label="روزهای تکرار"><DayPicker selected={exerciseDraft.days} onChange={(days) => setExerciseDraft({ ...exerciseDraft, days })} /></Field>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"><span className="text-sm font-medium">فعال بودن تمرین</span><input type="checkbox" checked={exerciseDraft.enabled} onChange={(event) => setExerciseDraft({ ...exerciseDraft, enabled: event.target.checked })} className="h-4 w-4 accent-[var(--accent)]" /></label>
      </form>
    </ModalFrame> : null}

    {toast ? <div role="status" className="fixed bottom-24 left-1/2 z-[90] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-xl sm:bottom-6">{toast}</div> : null}
    {!hydrated ? <div className="fixed bottom-3 left-3 z-40 rounded-lg bg-surface px-3 py-2 text-xs text-muted shadow">در حال آماده‌سازی داده‌های محلی…</div> : null}
  </div>;
}
