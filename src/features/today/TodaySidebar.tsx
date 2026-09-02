'use client';

import { useMemo, useState } from 'react';
import { BatteryLow, Brain, CloudRain, Moon, Sparkles, Sun, Target } from 'lucide-react';
import { useProgress } from '@/hooks/useProgress';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { formatMinutesOfDay, formatJalaliDate, toPersianDigits } from '@/lib/date/format';
import { minutesToTime } from '@/lib/date/iso';
import { cn } from '@/lib/utils';
import { findPlannedWakeUp } from '@/lib/schedule/dayShift';

/** Coach card, quests, wake-up/sleep prompt and Bad Day Mode live here so the
 *  hero of the Today screen stays "what should I do now". */
export function TodayAssist() {
  const { settings, update } = useSettings();
  const { todayOccurrences, now, dayOverride } = usePlanner();
  const progress = useProgress();
  const { push } = useToast();
  const [sleepOpen, setSleepOpen] = useState(false);
  const [bedTime, setBedTime] = useState('');
  const [wakeTime, setWakeTime] = useState('');

  const plannedWakeUp = useMemo(() => findPlannedWakeUp(todayOccurrences), [todayOccurrences]);
  const recordedWakeUp = dayOverride?.actualWakeUpMinutes ?? null;

  const importantTasks = useMemo(() => {
    if (!progress.badDay) return [];
    return todayOccurrences
      .filter((occurrence) => occurrence.status !== 'completed' && occurrence.status !== 'skipped')
      .filter((occurrence) => occurrence.task.fixedTime || ['study', 'homework', 'class'].includes(occurrence.task.category))
      .slice(0, 3);
  }, [progress.badDay, todayOccurrences]);

  return (
    <div className="space-y-4">
      {/* ------------------------------ bad day ------------------------------- */}
      {progress.badDay ? (
        <Card className="border-[color-mix(in_oklab,var(--warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--warning)_8%,transparent)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--warning)]">
                <CloudRain className="h-4 w-4" />
                امروز روز خوبی نیست
              </p>
              <p className="mt-1 text-xs leading-6 text-muted">
                فقط {toPersianDigits(importantTasks.length)} کار مهم برای امروز. همین یکی را انجام بده، کافیه.
              </p>
              <ul className="mt-2 space-y-1">
                {importantTasks.map((occurrence) => (
                  <li key={occurrence.id} className="text-xs">
                    • {occurrence.task.name} — {formatMinutesOfDay(occurrence.startMinutes, settings)}
                    {occurrence.task.fixedTime ? ' (زمان ثابت)' : ''}
                  </li>
                ))}
              </ul>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void progress.toggleBadDay()}>
              پایان حالت
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------- coach ------------------------------- */}
      {settings.progress.coachEnabled && progress.coach ? (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
              <Brain className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold text-muted">مربی</p>
              <p className="mt-0.5 text-xs leading-6">{progress.coach.text}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------- quests ------------------------------ */}
      {settings.progress.questsEnabled && progress.quests.length ? (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-accent" />
              ماموریت‌های امروز
            </h2>
            <Badge tone="muted">اختیاری</Badge>
          </div>
          <ul className="divide-y divide-line">
            {progress.quests.map((quest) => (
              <li key={quest.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className={cn('text-xs font-medium', quest.done && 'line-through opacity-60')}>{quest.title}</p>
                  {quest.detail ? <p className="mt-0.5 text-[0.66rem] text-subtle">{quest.detail}</p> : null}
                </div>
                <Badge tone={quest.done ? 'success' : 'neutral'}>{toPersianDigits(quest.xp)} XP</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --------------------------- sleep & energy -------------------------- */}
      {settings.sleepTracking ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Moon className="h-4 w-4 text-accent" />
              خواب و انرژی
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {progress.sleep?.wakeMinutes != null ? (
                <Badge tone="neutral">بیداری: {formatMinutesOfDay(progress.sleep.wakeMinutes, settings)}</Badge>
              ) : null}
              {progress.sleep?.durationMinutes ? (
                <Badge tone="accent">{toPersianDigits(Math.round((progress.sleep.durationMinutes / 60) * 10) / 10)} ساعت خواب</Badge>
              ) : null}
            </div>
          </div>
          <div className="p-4">
            {recordedWakeUp == null && !progress.sleep ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSleepOpen(true)}>
                  <Sun className="h-4 w-4" />
                  ثبت خواب و بیداری
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void update({ sleepTracking: false })}>
                  رد کردن
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSleepOpen(true)}>
                  ویرایش
                </Button>
                <p className="text-[0.7rem] text-subtle">
                  {plannedWakeUp != null
                    ? `بیداری برنامه‌ریزی‌شده: ${minutesToTime(plannedWakeUp)}`
                    : 'برنامه‌ی بیداری مشخص نیست'}
                </p>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {/* ------------------------------ bad day ------------------------------ */}
      {!progress.badDay ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BatteryLow className="h-4 w-4 text-muted" />
                امروز روز خوبی نیست
              </p>
              <p className="mt-0.5 text-[0.7rem] leading-6 text-muted">
                برنامه‌ی امروز سبک می‌شود و فقط کارهای مهم نمایش داده می‌شود.
                {progress.badDayCooldown.allowed
                  ? ' هر ۴ روز یک‌بار قابل استفاده است.'
                  : ` دفعه بعدی: ${toPersianDigits(progress.badDayCooldown.nextAvailableInDays)} روز دیگر.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!progress.badDayCooldown.allowed}
              onClick={() => void progress.toggleBadDay()}
            >
              فعال‌سازی
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ----------------------------- sleep modal --------------------------- */}
      <Modal
        open={sleepOpen}
        onClose={() => setSleepOpen(false)}
        title="خواب و انرژی"
        description="این اطلاعات فقط روی همین دستگاه ذخیره می‌شود و اختیاری است."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSleepOpen(false)}>بستن</Button>
            <Button
              onClick={() => {
                const toMinutes = (value: string) => {
                  if (!value) return null;
                  const [h, m] = value.split(':').map(Number);
                  return Number.isFinite(h) ? h * 60 + m : null;
                };
                void progress
                  .recordSleep({ date: now.date, bedMinutes: toMinutes(bedTime), wakeMinutes: toMinutes(wakeTime) })
                  .then(() => setSleepOpen(false));
              }}
            >
              ثبت
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">ساعت خواب دیشب</span>
            <input
              type="time"
              value={bedTime}
              onChange={(event) => setBedTime(event.target.value)}
              className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">ساعت بیداری امروز</span>
            <input
              type="time"
              value={wakeTime}
              onChange={(event) => setWakeTime(event.target.value)}
              className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm"
            />
          </label>
          <p className="text-[0.7rem] leading-6 text-subtle">
            {plannedWakeUp != null
              ? `بیداری برنامه‌ریزی‌شده امروز: ${minutesToTime(plannedWakeUp)} — اگر دیرتر بیدار شده باشی می‌توانی برنامه را جابه‌جا کنی.`
              : 'برای مقایسه با برنامه، یک تسک «بیدار شدن» در برنامه‌ات بگذار.'}
          </p>
        </div>
      </Modal>
    </div>
  );
}

/** Full-screen celebration overlay used by the progress system. */
export function CelebrationOverlay() {
  const progress = useProgress();
  const { settings } = useSettings();
  if (!progress.celebration || !settings.progress.animations) return null;
  const { kind } = progress.celebration;

  const confetti = kind === 'big' || kind === 'badge' || kind === 'garden';

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center" aria-live="polite">
      <div className={cn('rounded-card border border-line bg-surface/95 px-6 py-5 shadow-2xl', kind === 'small' ? 'celebrate-pop' : 'celebrate-rise')}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-fg">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {kind === 'badge' ? 'نشان جدید!' : kind === 'garden' ? 'باغچه رشد کرد' : 'خیلی خوب بود'}
            </p>
            <p className="mt-0.5 text-[0.7rem] text-muted">
              {kind === 'small' ? 'کار انجام‌شده ثبت شد' : 'ادامه بده، همین مسیر درست است'}
            </p>
          </div>
        </div>
      </div>
      {confetti ? (
        <div className="absolute inset-x-0 top-16 flex justify-center gap-2">
          {Array.from({ length: 9 }, (_, index) => (
            <span
              key={index}
              className="celebrate-confetti h-2 w-2 rounded-full"
              style={{
                backgroundColor: ['var(--accent)', 'var(--success)', 'var(--warning)'][index % 3],
                animationDelay: `${index * 70}ms`,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
