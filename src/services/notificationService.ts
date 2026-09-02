'use client';

/**
 * NotificationService + ReminderScheduler.
 *
 * Honest capability model for a web PWA:
 *  - Notifications only fire while the app (or its service worker) is alive.
 *    Browsers suspend service workers, so background delivery at an exact time
 *    is NOT guaranteed — the app keeps a foreground scheduler running while the
 *    tab/PWA is open and uses the service worker when it is available.
 *  - Permission is requested explicitly from a user gesture.
 *  - Every failure path surfaces a Persian message instead of failing silently.
 */

import { metaRepository } from '@/services/repositories';
import { nowInZone } from '@/lib/date/timezone';
import { addDays, compareISO } from '@/lib/date/iso';
import type { Settings, TaskOccurrence } from '@/types';

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface ShowResult {
  delivered: boolean;
  channel: 'service-worker' | 'page' | 'none';
  message?: string;
}

export class NotificationService {
  constructor(private getSettings: () => Settings) {}

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  permission(): PermissionState {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission as PermissionState;
  }

  isServiceWorkerAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  }

  async requestPermission(): Promise<{ state: PermissionState; message: string }> {
    if (!this.isSupported()) {
      return {
        state: 'unsupported',
        message: 'این مرورگر از Notification API پشتیبانی نمی‌کند. می‌توانید از هشدار درون‌برنامه‌ای استفاده کنید.',
      };
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        return { state: 'granted', message: 'دسترسی اعلان‌ها داده شد.' };
      }
      if (result === 'denied') {
        return {
          state: 'denied',
          message: 'دسترسی اعلان رد شد. از تنظیمات مرورگر/سیستم‌عامل اجازه دهید تا اعلان‌ها کار کنند.',
        };
      }
      return { state: 'default', message: 'دسترسی اعلان هنوز مشخص نشده است.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { state: 'denied', message: `خطا در دریافت دسترسی اعلان: ${message}` };
    }
  }

  async registerServiceWorker(): Promise<{ ok: boolean; message: string }> {
    if (!this.isServiceWorkerAvailable()) {
      return { ok: false, message: 'این مرورگر Service Worker ندارد؛ حالت آفلاین کامل فعال نمی‌شود.' };
    }
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      return { ok: true, message: 'سرویس‌ورکر برای اعلان‌ها و آفلاین ثبت شد.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `ثبت سرویس‌ورکر ناموفق بود: ${message}` };
    }
  }

  async show(title: string, body: string, options: Partial<NotificationOptions> = {}): Promise<ShowResult> {
    const settings = this.getSettings();
    if (!settings.notifications.enabled) {
      return { delivered: false, channel: 'none', message: 'اعلان‌ها در تنظیمات خاموش هستند.' };
    }
    if (!this.isSupported()) {
      return { delivered: false, channel: 'none', message: 'مرورگر از اعلان پشتیبانی نمی‌کند.' };
    }
    if (this.permission() !== 'granted') {
      return {
        delivered: false,
        channel: 'none',
        message: 'اجازه‌ی اعلان داده نشده است؛ از بخش تنظیمات اجازه دهید.',
      };
    }

    const payload: NotificationOptions = {
      body,
      dir: 'rtl',
      lang: 'fa-IR',
      tag: options.tag ?? `planner-${Date.now()}`,
      icon: '/icons/icon-512.png',
      badge: '/icons/icon-512.png',
      ...options,
    };

    // Prefer the service worker: it works when the page is backgrounded.
    if (this.isServiceWorkerAvailable()) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(title, payload);
          this.sideEffects(settings);
          return { delivered: true, channel: 'service-worker' };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          delivered: false,
          channel: 'none',
          message: `نمایش اعلان از طریق سرویس‌ورکر ناموفق بود: ${message}`,
        };
      }
    }

    try {
      const notification = new Notification(title, payload);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      this.sideEffects(settings);
      return { delivered: true, channel: 'page' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { delivered: false, channel: 'none', message: `نمایش اعلان ناموفق بود: ${message}` };
    }
  }

  private sideEffects(settings: Settings) {
    if (settings.notifications.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([90, 60, 90]);
      } catch {
        /* vibration unsupported — ignore */
      }
    }
    if (settings.notifications.sound) this.playChime();
  }

  /** Short synthesized chime — no network, no audio files. */
  playChime() {
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const notes = [880, 1174.66];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        oscGain.gain.setValueAtTime(0.0001, ctx.currentTime + index * 0.18);
        oscGain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + index * 0.18 + 0.03);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + index * 0.18 + 0.35);
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        osc.start(ctx.currentTime + index * 0.18);
        osc.stop(ctx.currentTime + index * 0.18 + 0.4);
      });
      setTimeout(() => ctx.close().catch(() => undefined), 1400);
    } catch {
      /* audio blocked until user gesture — silent */
    }
  }

  /** Human readable list of limitations, shown in Settings. */
  limitations(): string[] {
    const notes: string[] = [];
    notes.push(
      'اعلان‌های وب فقط وقتی قابل نمایش هستند که مرورگر یا PWA در حال اجرا باشد؛ اگر برنامه بسته باشد، اعلان آن زمان ارسال نمی‌شود.',
    );
    if (!this.isSupported()) notes.push('این مرورگر Notification API را ندارد.');
    if (this.permission() === 'denied') {
      notes.push('اجازه‌ی اعلان رد شده است؛ باید از تنظیمات سیستم‌عامل/مرورگر تغییر کند.');
    }
    if (typeof navigator !== 'undefined' && 'standalone' in navigator) {
      notes.push('برای بهترین نتیجه برنامه را نصب (Install) کنید تا در حالت مستقل اجرا شود.');
    }
    notes.push('در iOS باید برنامه روی صفحه‌ی اصلی نصب شده و اجازه‌ی اعلان از تنظیمات Safari داده شود.');
    return notes;
  }
}

export interface ReminderOutcome {
  fired: { occurrence: TaskOccurrence; kind: 'start' | 'end' }[];
  errors: string[];
}

const FIRE_WINDOW_MINUTES = 15;

export class ReminderScheduler {
  private fired = new Set<string>();
  private hydrated = false;

  constructor(
    private notifications: NotificationService,
    private getSettings: () => Settings,
  ) {}

  async hydrate(todayISO: string) {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const rows = await metaRepository.all();
      for (const row of rows) {
        if (row.key.startsWith('fired:')) this.fired.add(row.key);
      }
      // prune entries older than a week to keep storage tidy
      const cutoff = addDays(todayISO, -7);
      const stale = rows
        .filter((r) => r.key.startsWith('fired:'))
        .filter((r) => {
          const date = r.key.split(':')[1];
          return compareISO(date, cutoff) < 0;
        })
        .map((r) => r.key);
      if (stale.length) {
        const db = (await import('@/services/db')).getDb();
        await db.meta.bulkDelete(stale);
      }
    } catch {
      /* non-fatal: in-memory dedupe still works */
    }
  }

  private key(occurrence: TaskOccurrence, kind: 'start' | 'end') {
    // the effective shift is part of the key so a re-scheduled today's block
    // notifies again at its new time (and never double-fires for one time)
    return `fired:${occurrence.date}:${occurrence.taskId}:${kind}:${occurrence.shiftMinutes ?? 0}`;
  }

  /** Called on every scheduler tick. */
  async evaluate(
    occurrences: TaskOccurrence[],
    todayISO: string,
    nowMinutes: number,
  ): Promise<ReminderOutcome> {
    const settings = this.getSettings();
    const outcome: ReminderOutcome = { fired: [], errors: [] };
    if (!settings.notifications.enabled) return outcome;
    await this.hydrate(todayISO);

    for (const occurrence of occurrences) {
      if (occurrence.task.archived) continue;
      const reminder = occurrence.task.reminder;
      if (!reminder.enabled) continue;
      if (occurrence.status === 'completed' || occurrence.status === 'skipped') continue;

      const fireAt = occurrence.startMinutes - reminder.minutesBefore;
      const startKey = this.key(occurrence, 'start');
      if (!this.fired.has(startKey) && nowMinutes >= fireAt && nowMinutes - fireAt <= FIRE_WINDOW_MINUTES) {
        const when = reminder.minutesBefore > 0 ? `${reminder.minutesBefore} دقیقه دیگر` : 'همین حالا';
        const result = await this.notifications.show(
          occurrence.task.name,
          `${when} شروع می‌شود • ${occurrence.start} تا ${occurrence.end}`,
          { tag: startKey },
        );
        if (result.delivered) {
          this.fired.add(startKey);
          await this.mark(startKey);
          outcome.fired.push({ occurrence, kind: 'start' });
        } else if (result.message) {
          outcome.errors.push(result.message);
        }
      }

      if (reminder.atEnd) {
        const endKey = this.key(occurrence, 'end');
        if (
          !this.fired.has(endKey) &&
          nowMinutes >= occurrence.endMinutes &&
          nowMinutes - occurrence.endMinutes <= FIRE_WINDOW_MINUTES
        ) {
          const result = await this.notifications.show(
            `پایان ${occurrence.task.name}`,
            `بازه‌ی ${occurrence.start} تا ${occurrence.end} تمام شد.`,
            { tag: endKey },
          );
          if (result.delivered) {
            this.fired.add(endKey);
            await this.mark(endKey);
            outcome.fired.push({ occurrence, kind: 'end' });
          }
        }
      }
    }
    return outcome;
  }

  private async mark(key: string) {
    try {
      await metaRepository.set(key, true);
    } catch {
      /* non-fatal */
    }
  }
}

export function createReminderEngine(getSettings: () => Settings) {
  const notifications = new NotificationService(getSettings);
  const scheduler = new ReminderScheduler(notifications, getSettings);
  return { notifications, scheduler };
}

/** Convenience: "now" inside the configured timezone. */
export function zoneNow(timezone: string) {
  return nowInZone(timezone);
}
