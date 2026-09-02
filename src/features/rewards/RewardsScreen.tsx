'use client';

import { useState } from 'react';
import { Gift, Plus, Trash2 } from 'lucide-react';
import { useProgress } from '@/hooks/useProgress';
import { useSettings } from '@/hooks/useSettings';
import { Badge, Button, Card, EmptyState, Field, Input } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { toPersianDigits } from '@/lib/date/format';
import { uid } from '@/lib/utils';
import { levelFromXp } from '@/lib/progress/score';
import type { RewardItem } from '@/types';

export function RewardsScreen() {
  const { rewards, xp, redeemReward, saveReward, deleteReward, badges } = useProgress();
  const { settings } = useSettings();
  const { push } = useToast();
  const [editing, setEditing] = useState<RewardItem | null>(null);

  const level = levelFromXp(Math.max(0, xp.balance));

  const create = () =>
    setEditing({
      id: uid('reward'),
      name: '',
      priceXp: 100,
      icon: 'star',
      createdAt: new Date().toISOString(),
    });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <Gift className="h-4 w-4 text-accent" />
              فروشگاه پاداش شخصی
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              پاداش‌ها را خودت تعریف کن و با XP که از انجام کارها گرفتی خرجشان کن.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">XP: {toPersianDigits(xp.balance)}</Badge>
            <Badge tone="neutral">سطح {toPersianDigits(level.level)}</Badge>
            <Badge tone="muted">امروز: {toPersianDigits(xp.today)}+</Badge>
            <Badge tone="success">نشان‌ها: {toPersianDigits(badges.length)}</Badge>
          </div>
        </div>
        <div className="border-t border-line px-4 py-3">
          <p className="text-[0.7rem] leading-6 text-subtle">
            توجه: XP با امتیاز پیشرفت روزانه فرق دارد. امتیاز پیشرفت فقط توضیح می‌دهد امروز چطور پیش رفتی و خرج‌شدنی نیست.
          </p>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">پاداش‌های من</h2>
          <Button size="sm" onClick={create}>
            <Plus className="h-4 w-4" />
            پاداش جدید
          </Button>
        </div>
        {rewards.length ? (
          <ul className="divide-y divide-line">
            {rewards.map((reward) => {
              const affordable = xp.balance >= reward.priceXp;
              return (
                <li key={reward.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{reward.name}</p>
                    {reward.note ? <p className="mt-0.5 text-[0.7rem] text-muted">{reward.note}</p> : null}
                    <p className="numeral mt-1 text-[0.7rem] text-subtle">{toPersianDigits(reward.priceXp)} XP</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant={affordable ? 'primary' : 'secondary'} disabled={!affordable} onClick={() => void redeemReward(reward)}>
                      {affordable ? 'دریافت' : 'XP کافی نیست'}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(reward)} aria-label={`ویرایش ${reward.name}`}>
                      <Plus className="h-4 w-4 rotate-45" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => void deleteReward(reward.id)} aria-label={`حذف ${reward.name}`}>
                      <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Gift className="h-6 w-6" />}
            title="هنوز پاداشی تعریف نکرده‌ای"
            description="مثلاً: ۳۰ دقیقه بازی = ۱۰۰ XP، یک قسمت سریال = ۲۵۰ XP."
            action={
              <Button onClick={create}>
                <Plus className="h-4 w-4" />
                افزودن پاداش
              </Button>
            }
          />
        )}
      </Card>

      {settings.progress.xpEnabled ? null : (
        <p className="text-xs text-subtle">سیستم XP در تنظیمات خاموش است؛ می‌توانی از تنظیمات فعالش کنی.</p>
      )}

      <RewardEditor
        reward={editing}
        onClose={() => setEditing(null)}
        onSave={async (reward) => {
          if (!reward.name.trim()) {
            push('نام پاداش را بنویس.', 'error');
            return;
          }
          if (!Number.isFinite(reward.priceXp) || reward.priceXp <= 0) {
            push('قیمت پاداش باید عددی مثبت باشد.', 'error');
            return;
          }
          await saveReward(reward);
          push('پاداش ذخیره شد.', 'success');
          setEditing(null);
        }}
      />
    </div>
  );
}

function RewardEditor({
  reward,
  onClose,
  onSave,
}: {
  reward: RewardItem | null;
  onClose: () => void;
  onSave: (reward: RewardItem) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RewardItem | null>(reward);
  if (reward && draft?.id !== reward.id) setDraft(reward);
  if (!reward || !draft) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={reward.name ? 'ویرایش پاداش' : 'پاداش جدید'}
      description="قیمت را واقع‌بینانه بگذار تا خرج کردنش معنا داشته باشد."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button onClick={() => void onSave(draft)}>ذخیره</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="نام پاداش">
          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="۳۰ دقیقه بازی" />
        </Field>
        <Field label="قیمت (XP)" hint="مثلاً ۱۰۰">
          <Input
            dir="ltr"
            inputMode="numeric"
            value={draft.priceXp}
            onChange={(event) => setDraft({ ...draft, priceXp: Number(event.target.value) || 0 })}
          />
        </Field>
        <Field label="یادداشت (اختیاری)">
          <Input value={draft.note ?? ''} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
