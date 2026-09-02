'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellRing, Database, Info, ShieldCheck, Trash2 } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { usePlanner } from '@/hooks/usePlanner';
import { useToast } from '@/components/ui/toast';
import { Badge, Button, Card, Field, Input, Select, Switch } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/dialog';
import { NotificationService } from '@/services/notificationService';
import { taskRepository, completionRepository } from '@/services/repositories';
import { diagnoseStorage } from '@/services/db';
import { TIMEZONES } from '@/lib/constants';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/lib/date/iso';
import { nowInZone, isValidTimeZone } from '@/lib/date/timezone';
import { formatMinutesOfDay, toPersianDigits } from '@/lib/date/format';
import type { PermissionState } from '@/services/notificationService';
import type { Weekday } from '@/types';

export function SettingsScreen() {
  const { settings, update, reset } = useSettings();
  const { now, refresh, loadSampleData } = usePlanner();
  const { push } = useToast();
  const [permission, setPermission] = useState<PermissionState>('default');
  const [storage, setStorage] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const notifications = useMemo(
    () => new NotificationService(() => settings),
    [settings],
  );

  useEffect(() => {
    setPermission(notifications.permission());
    void diagnoseStorage().then(setStorage);
  }, [notifications]);

  const requestPermission = async () => {
    const result = await notifications.requestPermission();
    setPermission(result.state);
    if (result.state === 'granted') {
      await update({ notifications: { ...settings.notifications, enabled: true } });
      void notifications.registerServiceWorker();
    }
    push(result.message, result.state === 'granted' ? 'success' : 'error');
  };

  const testNotification = async () => {
    const result = await notifications.show(
      'این یک اعلان آزمایشی است',
      `ساعت ${formatMinutesOfDay(now.minutes, settings)} — اعلان‌ها درست کار می‌کنند.`,
    );
    if (!result.delivered) {
      push('اعلان نمایش داده نشد.', 'error', result.message);
    } else {
      push(`اعلان از طریق ${result.channel === 'service-worker' ? 'سرویس‌ورکر' : 'صفحه'} نمایش داده شد.`, 'success');
    }
  };

  const zoneNow = isValidTimeZone(settings.timezone) ? nowInZone(settings.timezone) : now;

  return (
    <div className="space-y-4">
      {/* ------------------------------- date & time ------------------------------ */}
      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">زمان و تاریخ</h2>
          <p className="mt-0.5 text-xs text-muted">
            همه‌ی محاسبات «امروز» و ساعت‌ها بر اساس منطقه‌ی زمانی انتخابی انجام می‌شود.
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="منطقه‌ی زمانی" hint={`اکنون در این منطقه: ${formatMinutesOfDay(zoneNow.minutes, settings)}`}>
            <Select
              value={settings.timezone}
              onChange={(event) => void update({ timezone: event.target.value })}
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="تقویم نمایش تاریخ">
            <Select
              value={settings.calendar}
              onChange={(event) => void update({ calendar: event.target.value as 'persian' | 'gregorian' })}
            >
              <option value="persian">هجری شمسی (جلالی)</option>
              <option value="gregorian">میلادی</option>
            </Select>
          </Field>
          <Field label="اولین روز هفته">
            <Select
              value={settings.firstDayOfWeek}
              onChange={(event) => void update({ firstDayOfWeek: event.target.value as Weekday })}
            >
              {WEEKDAY_ORDER.map((day) => (
                <option key={day} value={day}>
                  {WEEKDAY_LABELS[day]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-card border border-line p-3">
              <Switch
                checked={settings.persianDigits}
                onChange={(value) => void update({ persianDigits: value })}
                label="اعداد فارسی"
                description="۱۲۳"
              />
            </div>
            <div className="rounded-card border border-line p-3">
              <Switch
                checked={settings.hour12}
                onChange={(value) => void update({ hour12: value })}
                label="ساعت ۱۲ ساعتی"
                description="ق.ظ / ب.ظ"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ------------------------------- notifications ---------------------------- */}
      <Card>
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BellRing className="h-4 w-4 text-accent" />
              یادآورها و اعلان‌ها
            </h2>
            <p className="mt-0.5 text-xs text-muted">اعلان‌های مرورگر برای شروع و پایان بلوک‌های زمانی</p>
          </div>
          <Badge tone={permission === 'granted' ? 'success' : permission === 'denied' ? 'danger' : 'muted'}>
            {permission === 'granted' ? 'مجاز' : permission === 'denied' ? 'رد شده' : permission === 'unsupported' ? 'پشتیبانی نمی‌شود' : 'درخواست نشده'}
          </Badge>
        </div>
        <div className="space-y-3 p-4">
          <Switch
            checked={settings.notifications.enabled}
            onChange={(value) => void update({ notifications: { ...settings.notifications, enabled: value } })}
            label="فعال‌سازی یادآورها"
            description="موتور یادآور هر ۲۰ ثانیه بررسی می‌کند."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="پیش‌فرض: چند دقیقه قبل" hint="۰ یعنی سر ساعت شروع">
              <Input
                type="number"
                min={0}
                max={1440}
                value={settings.notifications.defaultMinutesBefore}
                onChange={(event) =>
                  void update({
                    notifications: {
                      ...settings.notifications,
                      defaultMinutesBefore: Math.max(0, Number(event.target.value || 0)),
                    },
                  })
                }
              />
            </Field>
            <div className="space-y-2 pt-6">
              <Switch
                checked={settings.notifications.atEnd}
                onChange={(value) => void update({ notifications: { ...settings.notifications, atEnd: value } })}
                label="اعلان پایان"
              />
            </div>
            <div className="space-y-2 pt-6">
              <Switch
                checked={settings.notifications.sound}
                onChange={(value) => void update({ notifications: { ...settings.notifications, sound: value } })}
                label="صدای کوتاه"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void requestPermission()} disabled={permission === 'unsupported'}>
              {permission === 'granted' ? 'درخواست مجدد مجوز' : 'دادن مجوز اعلان'}
            </Button>
            <Button variant="secondary" onClick={() => void testNotification()} disabled={!settings.notifications.enabled}>
              ارسال اعلان آزمایشی
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                notifications.playChime();
                push('صدای آزمایشی پخش شد.', 'info');
              }}
            >
              پخش صدا
            </Button>
          </div>
          <ul className="space-y-1.5 rounded-card border border-dashed border-line p-3 text-[0.7rem] leading-6 text-muted">
            {notifications.limitations().map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      </Card>

      {/* --------------------------------- storage -------------------------------- */}
      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-accent" />
            داده‌ها و حریم خصوصی
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            داده‌ها در IndexedDB همین مرورگر ذخیره می‌شوند؛ هیچ چیزی به سرور ارسال نمی‌شود.
          </p>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-2 rounded-card border border-line p-3 text-xs">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-[var(--success)]" />
            <div>
              <p className="font-medium">حالت آفلاین</p>
              <p className="mt-0.5 leading-6 text-muted">
                سرویس‌ورکر پوسته‌ی برنامه را کش می‌کند. بدون اینترنت هم تسک‌ها، تقویم، تکرارها، ویرایش‌ها،
                وضعیت انجام‌شده و ورود/خروج JSON کار می‌کنند.
              </p>
            </div>
          </div>
          <p className={storage ? (storage.ok ? 'text-xs text-[var(--success)]' : 'text-xs text-[var(--danger)]') : 'text-xs text-muted'}>
            {storage?.message ?? 'در حال بررسی پایگاه داده…'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void loadSampleData().then((count) => push(`${count} تسک نمونه اضافه شد.`, 'success'))}>
              افزودن داده‌ی نمونه
            </Button>
            <Button variant="ghost" onClick={() => void reset().then(() => push('تنظیمات به حالت پیش‌فرض برگشت.', 'info'))}>
              بازنشانی تنظیمات
            </Button>
            <Button variant="danger" onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-4 w-4" />
              پاک‌کردن همه‌ی داده‌ها
            </Button>
          </div>
        </div>
      </Card>

      {/* ---------------------------------- about --------------------------------- */}
      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Info className="h-4 w-4 text-accent" />
            درباره‌ی برنامه
          </h2>
        </div>
        <div className="space-y-2 p-4 text-xs leading-6 text-muted">
          <p>برنامه‌ریز شخصی دانش‌آموز — نسخه‌ی ۱٫۰ (نسخه‌ی قالب JSON: {toPersianDigits(settings.version)})</p>
          <p>
            معماری: Next.js App Router + TypeScript + Tailwind + IndexedDB (Dexie) + موتور تکرار مستقل از UI.
            لایه‌ی داده با الگوی Repository نوشته شده تا بعداً بتوان بدون بازنویسی UI به سرور متصل شود.
          </p>
          <p>
            برای نصب روی موبایل: در Chrome/Edge منوی مرورگر را باز کنید و «نصب برنامه» را بزنید؛ در iOS از
            Share → Add to Home Screen.
          </p>
        </div>
      </Card>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="پاک‌کردن همه‌ی داده‌ها"
        description="همه‌ی تسک‌ها، تاریخچه، عادت‌ها و جلسات تمرکز حذف می‌شوند. تنظیمات باقی می‌مانند."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await taskRepository.clearAll();
                await completionRepository.bulkPut([]);
                setConfirmClear(false);
                refresh();
                push('همه‌ی داده‌ها پاک شد.', 'info');
              }}
            >
              پاک کن
            </Button>
          </div>
        }
      >
        <p className="text-sm">قبل از این کار از صفحه‌ی «ورود / خروج» پشتیبان JSON بگیرید.</p>
      </Modal>
    </div>
  );
}
