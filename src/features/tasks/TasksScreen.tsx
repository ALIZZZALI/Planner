'use client';

import { useMemo, useState } from 'react';
import { Archive, ListTodo, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { usePlanner } from '@/hooks/usePlanner';
import { useSettings } from '@/hooks/useSettings';
import { useTaskEditor } from '@/features/tasks/TaskEditorProvider';
import { Badge, Button, Card, Chip, EmptyState, Input, Select, Skeleton } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { describeRecurrence, nextOccurrenceDate } from '@/lib/schedule/recurrence';
import { addDays, compareISO } from '@/lib/date/iso';
import { formatDuration, formatJalaliDate, toPersianDigits } from '@/lib/date/format';
import { PRIORITY_LABELS } from '@/lib/constants';
import { TaskIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';

type StatusFilter = 'all' | 'active' | 'archived';
type TimeFilter = 'all' | 'today' | 'week' | 'past' | 'upcoming' | 'range';

export function TasksScreen() {
  const { settings } = useSettings();
  const { tasks, completions, now, archiveTask, deleteTask } = usePlanner();
  const { openEditor } = useTaskEditor();
  const { push } = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [priority, setPriority] = useState('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const completionsByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of completions) {
      if (record.status === 'completed') map.set(record.taskId, (map.get(record.taskId) ?? 0) + 1);
    }
    return map;
  }, [completions]);

  const filtered = useMemo(() => {
    const weekEnd = addDays(now.date, 7);
    return tasks.filter((task) => {
      if (status === 'active' && task.archived) return false;
      if (status === 'archived' && !task.archived) return false;
      if (query && !task.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (category !== 'all' && task.category !== category) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      if (recurringOnly && task.repeat.type === 'none') return false;

      if (timeFilter === 'today') {
        if (!nextOccurrenceDate(task, now.date, 1)) return false;
      } else if (timeFilter === 'week') {
        const next = nextOccurrenceDate(task, now.date, 7);
        if (!next || compareISO(next, weekEnd) > 0) return false;
      } else if (timeFilter === 'past') {
        if (task.endDate && compareISO(task.endDate, now.date) >= 0) return false;
        if (!task.endDate && compareISO(task.date, now.date) <= 0 && task.repeat.type !== 'none') return false;
      } else if (timeFilter === 'upcoming') {
        if (task.endDate && compareISO(task.endDate, now.date) < 0) return false;
      } else if (timeFilter === 'range') {
        if (rangeFrom && compareISO(task.date, rangeFrom) < 0) return false;
        if (rangeTo && task.endDate && compareISO(task.endDate, rangeTo) > 0) return false;
        if (rangeTo && !task.endDate && compareISO(task.date, rangeTo) > 0) return false;
      }
      return true;
    });
  }, [tasks, status, query, category, priority, recurringOnly, timeFilter, rangeFrom, rangeTo, now.date]);

  const activeFilters =
    (query ? 1 : 0) +
    (category !== 'all' ? 1 : 0) +
    (priority !== 'all' ? 1 : 0) +
    (recurringOnly ? 1 : 0) +
    (timeFilter !== 'all' ? 1 : 0);

  if (!tasks.length) {
    return (
      <Card>
        <EmptyState
          icon={<ListTodo className="h-6 w-6" />}
          title="هیچ تسکی ثبت نشده"
          description="تسک اول خود را بسازید؛ می‌توانید زمان شروع و پایان، تکرار، یادآور و دسته‌بندی را مشخص کنید."
          action={
            <Button onClick={() => openEditor(undefined, now.date)}>
              <Plus className="h-4 w-4" />
              تسک جدید
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="جست‌وجو در نام تسک…"
                aria-label="جست‌وجو"
                className="pe-9"
              />
            </div>
            <Button onClick={() => openEditor(undefined, now.date)}>
              <Plus className="h-4 w-4" />
              تسک جدید
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-auto min-w-[130px] text-xs" aria-label="دسته‌بندی">
              <option value="all">همه دسته‌ها</option>
              {settings.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 w-auto min-w-[110px] text-xs" aria-label="اولویت">
              <option value="all">همه اولویت‌ها</option>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as TimeFilter)} className="h-9 w-auto min-w-[130px] text-xs" aria-label="بازه زمانی">
              <option value="all">همه زمان‌ها</option>
              <option value="today">امروز</option>
              <option value="week">این هفته</option>
              <option value="upcoming">در جریان</option>
              <option value="past">پایان‌یافته</option>
              <option value="range">بازه دلخواه</option>
            </Select>
            <Chip active={recurringOnly} onClick={() => setRecurringOnly((v) => !v)}>
              فقط تکرارشونده
            </Chip>
            <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="h-9 w-auto min-w-[100px] text-xs" aria-label="وضعیت">
              <option value="active">فعال</option>
              <option value="archived">بایگانی</option>
              <option value="all">همه</option>
            </Select>
            {activeFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                  setPriority('all');
                  setRecurringOnly(false);
                  setTimeFilter('all');
                  setRangeFrom('');
                  setRangeTo('');
                }}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <X className="h-3.5 w-3.5" />
                پاک‌کردن فیلترها ({toPersianDigits(activeFilters)})
              </button>
            ) : null}
          </div>

          {timeFilter === 'range' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="h-9 w-auto text-xs" aria-label="از تاریخ" />
              <span className="text-xs text-subtle">تا</span>
              <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="h-9 w-auto text-xs" aria-label="تا تاریخ" />
            </div>
          ) : null}
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.length ? (
          filtered.map((task) => {
            const next = nextOccurrenceDate(task, now.date, 30);
            const doneCount = completionsByTask.get(task.id) ?? 0;
            return (
              <Card key={task.id} className={cn('p-3', task.archived && 'opacity-60', `task-color-${task.color}`)}>
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-9 w-1 rounded-full" style={{ backgroundColor: 'var(--task)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskIcon name={task.icon} className="h-4 w-4 text-muted" />
                      <p className="truncate text-sm font-semibold">{task.name}</p>
                      <Badge tone={task.priority === 'critical' ? 'danger' : task.priority === 'high' ? 'warning' : 'neutral'}>
                        {PRIORITY_LABELS[task.priority]}
                      </Badge>
                      {task.repeat.type !== 'none' ? <Badge tone="accent">تکرارشونده</Badge> : <Badge tone="muted">یک‌بار</Badge>}
                      {task.archived ? <Badge tone="muted">بایگانی</Badge> : null}
                    </div>
                    <p className="numeral mt-1 text-[0.7rem] text-muted">
                      {task.start} تا {task.end} • {formatDuration(
                        (Number(task.end.split(':')[0]) * 60 + Number(task.end.split(':')[1]) -
                          (Number(task.start.split(':')[0]) * 60 + Number(task.start.split(':')[1])) + 1440) %
                          1440 || 60,
                      )}
                    </p>
                    <p className="mt-1 text-[0.7rem] text-subtle">
                      {describeRecurrence(task.repeat, (day) => day)} • شروع{' '}
                      {formatJalaliDate(task.date, { persianDigits: settings.persianDigits, style: 'medium' })}
                      {task.endDate
                        ? ` • پایان ${formatJalaliDate(task.endDate, { persianDigits: settings.persianDigits, style: 'medium' })}`
                        : ''}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone="neutral">
                        {settings.categories.find((c) => c.id === task.category)?.name ?? task.category}
                      </Badge>
                      {next ? (
                        <Badge tone="success">نوبت بعد: {formatJalaliDate(next, { persianDigits: settings.persianDigits, style: 'short' })}</Badge>
                      ) : (
                        <Badge tone="muted">بدون نوبت بعد</Badge>
                      )}
                      {doneCount ? <Badge tone="accent">{toPersianDigits(doneCount)} جلسه انجام‌شده</Badge> : null}
                      {task.reminder.enabled ? (
                        <Badge tone="neutral">
                          یادآور {task.reminder.minutesBefore === 0 ? 'سر ساعت' : `${task.reminder.minutesBefore} دقیقه قبل`}
                        </Badge>
                      ) : null}
                    </div>
                    {task.notes ? <p className="mt-2 text-[0.7rem] leading-5 text-muted">{task.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditor(task)} aria-label={`ویرایش ${task.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void archiveTask(task.id, !task.archived)}
                      aria-label={task.archived ? 'بازگردانی از بایگانی' : `بایگانی ${task.name}`}
                      title={task.archived ? 'بازگردانی' : 'بایگانی'}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setPendingDelete(task)} aria-label={`حذف ${task.name}`}>
                      <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <Card>
            <EmptyState title="نتیجه‌ای پیدا نشد" description="فیلترها را تغییر دهید یا عبارت دیگری جست‌وجو کنید." />
          </Card>
        )}
      </div>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="حذف تسک"
        description="این کار قابل بازگشت نیست و تاریخچه‌ی انجام‌شده‌های آن هم حذف می‌شود."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!pendingDelete) return;
                await deleteTask(pendingDelete.id);
                push('تسک حذف شد.', 'info');
                setPendingDelete(null);
              }}
            >
              حذف کن
            </Button>
          </div>
        }
      >
        <p className="text-sm">{pendingDelete?.name}</p>
      </Modal>
    </div>
  );
}
