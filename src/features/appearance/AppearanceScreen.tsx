'use client';

import { useState } from 'react';
import { Palette, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useToast } from '@/components/ui/toast';
import { Badge, Button, Card, Chip, Field, Input, Segmented, Select, Switch } from '@/components/ui/primitives';
import { COLOR_LABELS, COLOR_TOKENS, ICON_LABELS, ICON_NAMES, THEME_PRESETS } from '@/lib/constants';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/lib/date/iso';
import { TaskIcon } from '@/lib/icons';
import { uid } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Category, ColorToken, Density, FontSize, Roundness, Settings, TimelineStyle, ThemeMode, ThemePreset, Weekday } from '@/types';

export function AppearanceScreen() {
  const { settings, update } = useSettings();
  const { push } = useToast();

  const setSection = (key: keyof Settings['showSections'], value: boolean) =>
    void update({ showSections: { ...settings.showSections, [key]: value } });

  const updateCategory = (id: string, patch: Partial<Category>) =>
    void update({ categories: settings.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const addCategory = () => {
    const category: Category = {
      id: uid('cat'),
      name: 'دسته‌بندی جدید',
      color: 'indigo',
      icon: 'star',
    };
    void update({ categories: [...settings.categories, category] });
  };

  const removeCategory = (id: string) => {
    if (settings.categories.length <= 1) {
      push('حداقل یک دسته‌بندی لازم است.', 'error');
      return;
    }
    void update({ categories: settings.categories.filter((c) => c.id !== id) });
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="h-4 w-4 text-accent" />
            پوسته و رنگ
          </h2>
          <p className="mt-0.5 text-xs text-muted">همه‌ی رنگ‌ها با متغیرهای CSS اعمال می‌شوند؛ انتخاب شما بی‌درنگ ذخیره می‌شود.</p>
        </div>
        <div className="space-y-4 p-4">
          <Field label="حالت نمایش">
            <Segmented
              ariaLabel="حالت نمایش"
              value={settings.theme}
              onChange={(value) => void update({ theme: value as ThemeMode })}
              options={[
                { value: 'light', label: 'روشن' },
                { value: 'dark', label: 'تیره' },
                { value: 'system', label: 'سیستم' },
              ]}
            />
          </Field>

          <Field label="پالت کلی" hint="پالت، پس‌زمینه و رنگ اصلی را با هم تنظیم می‌کند.">
            <div className="flex flex-wrap gap-2">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.hint}
                  aria-pressed={(settings.themePreset ?? 'default') === preset.value}
                  onClick={() => void update({ themePreset: preset.value as ThemePreset })}
                  className={cn(
                    'rounded-control border px-3 py-2 text-start text-[0.7rem] transition-colors',
                    (settings.themePreset ?? 'default') === preset.value
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-muted hover:text-fg',
                  )}
                >
                  <span className="block font-medium">{preset.label}</span>
                  <span className="mt-0.5 block text-[0.62rem] opacity-75">{preset.hint}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="رنگ اصلی" hint={`انتخاب فعلی: ${COLOR_LABELS[settings.accent]}`}>
            <div className="flex flex-wrap gap-2">
              {COLOR_TOKENS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={COLOR_LABELS[color]}
                  aria-label={COLOR_LABELS[color]}
                  aria-pressed={settings.accent === color}
                  onClick={() => void update({ accent: color as ColorToken })}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 transition-transform',
                    `task-color-${color}`,
                    settings.accent === color ? 'scale-110 border-fg' : 'border-transparent',
                  )}
                  style={{ backgroundColor: 'var(--task)' }}
                />
              ))}
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="اندازه‌ی فونت">
              <Segmented
                ariaLabel="اندازه فونت"
                size="sm"
                value={settings.fontSize}
                onChange={(value) => void update({ fontSize: value as FontSize })}
                options={[
                  { value: 'sm', label: 'کوچک' },
                  { value: 'md', label: 'متوسط' },
                  { value: 'lg', label: 'بزرگ' },
                ]}
              />
            </Field>
            <Field label="تراکم">
              <Segmented
                ariaLabel="تراکم"
                size="sm"
                value={settings.density}
                onChange={(value) => void update({ density: value as Density })}
                options={[
                  { value: 'compact', label: 'متراکم' },
                  { value: 'comfortable', label: 'متعادل' },
                  { value: 'spacious', label: 'باز' },
                ]}
              />
            </Field>
            <Field label="گردی گوشه‌ها">
              <Segmented
                ariaLabel="گردی گوشه‌ها"
                size="sm"
                value={settings.roundness}
                onChange={(value) => void update({ roundness: value as Roundness })}
                options={[
                  { value: 'sharp', label: 'تیز' },
                  { value: 'soft', label: 'نرم' },
                  { value: 'round', label: 'گرد' },
                ]}
              />
            </Field>
          </div>

          <Field label="سبک تایم‌لاین" hint="چطور بلوک‌های زمانی روز نمایش داده شوند.">
            <Segmented
              ariaLabel="سبک تایم‌لاین"
              size="sm"
              value={settings.timelineStyle}
              onChange={(value) => void update({ timelineStyle: value as TimelineStyle })}
              options={[
                { value: 'bars', label: 'نوار رنگی' },
                { value: 'blocks', label: 'بلوک پررنگ' },
                { value: 'minimal', label: 'ساده' },
              ]}
            />
          </Field>

          <div className="rounded-card border border-line p-3">
            <p className="mb-2 text-xs font-medium">پیش‌نمایش</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">دکمه اصلی</Button>
              <Button size="sm" variant="secondary">
                دکمه دوم
              </Button>
              <Badge tone="accent">برچسب</Badge>
              <span className="text-xs text-muted">متن کم‌رنگ با اندازه‌ی انتخابی</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">بخش‌های صفحه‌ی امروز</h2>
          <p className="mt-0.5 text-xs text-muted">مواردی که لازم ندارید را خاموش کنید تا صفحه سبک‌تر شود.</p>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {(
            [
              ['nowNext', 'کارت «الان» و «بعدی»'],
              ['progress', 'نوار پیشرفت روز'],
              ['timeline', 'تایم‌لاین'],
              ['quickAdd', 'دکمه‌های افزودن سریع'],
              ['habits', 'عادت‌های امروز'],
              ['focus', 'میان‌بر تمرکز'],
              ['upcoming', 'لیست پیش رو'],
            ] as [keyof Settings['showSections'], string][]
          ).map(([key, label]) => (
            <div key={key} className="rounded-card border border-line px-3">
              <Switch checked={settings.showSections[key]} onChange={(value) => setSection(key, value)} label={label} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">دسته‌بندی‌ها</h2>
            <p className="mt-0.5 text-xs text-muted">
              نام، رنگ و آیکون هر دسته را تغییر دهید؛ دسته‌بندی‌ها در فیلترها، آمار و JSON استفاده می‌شوند.
            </p>
          </div>
          <Button size="sm" onClick={addCategory}>
            <Plus className="h-4 w-4" />
            افزودن
          </Button>
        </div>
        <div className="divide-y divide-line">
          {settings.categories.map((category) => (
            <div key={category.id} className={cn('flex flex-wrap items-center gap-2 p-3', `task-color-${category.color}`)}>
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-control"
                style={{ backgroundColor: 'color-mix(in oklab, var(--task) 18%, transparent)', color: 'var(--task)' }}
              >
                <TaskIcon name={category.icon} className="h-4 w-4" />
              </span>
              <Input
                value={category.name}
                onChange={(event) => updateCategory(category.id, { name: event.target.value })}
                aria-label={`نام دسته ${category.id}`}
                className="h-9 max-w-[180px] flex-1"
              />
              <Select
                value={category.icon}
                onChange={(event) => updateCategory(category.id, { icon: event.target.value })}
                aria-label="آیکون دسته"
                className="h-9 w-auto max-w-[150px] text-xs"
              >
                {ICON_NAMES.map((icon) => (
                  <option key={icon} value={icon}>
                    {ICON_LABELS[icon] ?? icon}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-1">
                {COLOR_TOKENS.slice(0, 13).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={COLOR_LABELS[color]}
                    aria-pressed={category.color === color}
                    onClick={() => updateCategory(category.id, { color })}
                    className={cn(
                      'h-5 w-5 rounded-full border',
                      `task-color-${color}`,
                      category.color === color ? 'border-fg' : 'border-transparent',
                    )}
                    style={{ backgroundColor: 'var(--task)' }}
                  />
                ))}
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeCategory(category.id)} aria-label={`حذف ${category.name}`}>
                <Trash2 className="h-4 w-4 text-[var(--danger)]" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">پیشرفت، پاداش و جابه‌جایی</h2>
          <p className="mt-0.5 text-xs text-muted">این‌ها فقط رفتار انگیزشی و پیش‌فرض‌ها را تغییر می‌دهند؛ برنامه‌ی تو دست‌نخورده می‌ماند.</p>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <div className="rounded-card border border-line px-3"><Switch checked={settings.progress.enabled} onChange={(value) => void update({ progress: { ...settings.progress, enabled: value } })} label="سیستم پیشرفت" description="امتیاز روز و دلایل آن" /></div>
          <div className="rounded-card border border-line px-3"><Switch checked={settings.progress.xpEnabled} onChange={(value) => void update({ progress: { ...settings.progress, xpEnabled: value } })} label="XP و فروشگاه پاداش" /></div>
          <div className="rounded-card border border-line px-3"><Switch checked={settings.progress.gardenEnabled} onChange={(value) => void update({ progress: { ...settings.progress, gardenEnabled: value } })} label="باغچه‌ی پیشرفت" /></div>
          <div className="rounded-card border border-line px-3"><Switch checked={settings.progress.questsEnabled} onChange={(value) => void update({ progress: { ...settings.progress, questsEnabled: value } })} label="ماموریت‌های روزانه" /></div>
          <div className="rounded-card border border-line px-3"><Switch checked={settings.progress.coachEnabled} onChange={(value) => void update({ progress: { ...settings.progress, coachEnabled: value } })} label="حالت مربی شخصی" /></div>
          <div className="rounded-card border border-line px-3"><Switch checked={settings.progress.animations} onChange={(value) => void update({ progress: { ...settings.progress, animations: value } })} label="انیمیشن‌های پیشرفت" /></div>
          <div className="rounded-card border border-line px-3"><Switch checked={settings.sleepTracking} onChange={(value) => void update({ sleepTracking: value })} label="ردگیری خواب و انرژی" description="اختیاری" /></div>
          <div className="rounded-card border border-line px-3"><Switch checked={settings.shift.defaultMode === 'smart'} onChange={(value) => void update({ shift: { ...settings.shift, defaultMode: value ? 'smart' : 'normal' } })} label="جابه‌جایی هوشمند به‌صورت پیش‌فرض" /></div>
        </div>
        <div className="border-t border-line px-4 py-3">
          <Field label="پیش‌فرض اعمال جابه‌جایی">
            <Segmented
              ariaLabel="پیش‌فرض جابه‌جایی"
              size="sm"
              value={settings.shift.defaultScope}
              onChange={(value) => void update({ shift: { ...settings.shift, defaultScope: value as Settings['shift']['defaultScope'] } })}
              options={[
                { value: 'upcoming', label: 'بعد از الآن' },
                { value: 'incomplete', label: 'ناقص‌ها' },
                { value: 'all', label: 'همه' },
                { value: 'selected', label: 'انتخابی' },
              ]}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">اولین روز هفته در تقویم</h2>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {WEEKDAY_ORDER.map((day: Weekday) => (
            <Chip key={day} active={settings.firstDayOfWeek === day} onClick={() => void update({ firstDayOfWeek: day })}>
              {WEEKDAY_LABELS[day]}
            </Chip>
          ))}
        </div>
      </Card>
    </div>
  );
}
