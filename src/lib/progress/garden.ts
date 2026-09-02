/**
 * Virtual garden («باغچه پیشرفت»).
 * Deterministic: everything is derived from recorded activity, never random.
 * Weeds are a gentle visual reminder of missed academic work — never a punishment.
 */

import type { BadgeAward, CompletionRecord, Task } from '@/types';

export interface GardenPlant {
  /** stable id so React keys stay stable across renders */
  id: string;
  /** 1..3 — grows with consecutive completion of that task */
  stage: 1 | 2 | 3;
  /** flower plants appear on milestones */
  kind: 'sprout' | 'plant' | 'flower';
  color: string;
  label: string;
}

export interface GardenState {
  plants: GardenPlant[];
  weeds: number;
  level: number;
  totalPlants: number;
  milestoneFlowers: number;
  message: string;
}

const PLANT_COLORS = ['emerald', 'teal', 'lime', 'cyan', 'violet', 'rose', 'amber', 'blue'];

export interface GardenInput {
  tasks: Task[];
  completions: CompletionRecord[];
  badges: BadgeAward[];
  /** today's ISO date — used to scope the "current" garden */
  today: string;
  /** how many recent days the garden represents */
  windowDays?: number;
}

/**
 * A plant exists for every academic/general task that was completed at least
 * once in the window. Stage grows with the number of completions (deterministic),
 * and every 10 plants produce one milestone flower.
 */
export function buildGarden(input: GardenInput): GardenState {
  const windowDays = input.windowDays ?? 7;
  const cutoff = shiftISO(input.today, -(windowDays - 1));
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));

  const counts = new Map<string, { count: number; label: string; color: string }>();
  for (const record of input.completions) {
    if (record.status !== 'completed') continue;
    if (record.date < cutoff || record.date > input.today) continue;
    const task = taskById.get(record.taskId);
    if (!task) continue;
    const kind = categoryKind(task);
    if (kind === 'rest' || kind === 'personal') continue; // garden grows from *work*
    const entry = counts.get(record.taskId) ?? {
      count: 0,
      label: task.name,
      color: PLANT_COLORS[Math.abs(hash(record.taskId)) % PLANT_COLORS.length],
    };
    entry.count += 1;
    counts.set(record.taskId, entry);
  }

  const plants: GardenPlant[] = Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([taskId, value]) => {
      const stage: GardenPlant['stage'] = value.count >= 3 ? 3 : value.count >= 2 ? 2 : 1;
      return {
        id: taskId,
        stage,
        kind: value.count >= 3 ? 'flower' : value.count >= 2 ? 'plant' : 'sprout',
        color: value.color,
        label: value.label,
      };
    });

  // weeds: missed academic occurrences in the window (capped so it never feels bleak)
  const missed = input.completions.filter((record) => record.status === 'skipped' && record.date >= cutoff);
  const weeds = Math.min(5, missed.length);

  const totalPlants = plants.length;
  const milestoneFlowers = Math.floor(totalPlants / 10);
  const level = Math.max(1, Math.floor(totalPlants / 5) + 1);

  let message: string;
  if (!totalPlants) {
    message = 'باغچه هنوز خالی است؛ با اولین کار درسی اولین جوانه می‌روید.';
  } else if (milestoneFlowers > 0) {
    message = `${totalPlants} گیاه در باغچه رشد کرده و ${milestoneFlowers} شکوفه‌ی ویژه دارد.`;
  } else if (weeds > 0) {
    message = `${totalPlants} گیاه سالم داری و ${weeds} علف هرز قابل清理 نیست — فقط یادآوری است.`;
  } else {
    message = `${totalPlants} گیاه سالم در باغچه داری.`;
  }
  message = message.replace('可清理', 'پاک‌کردن');

  return { plants, weeds, level, totalPlants, milestoneFlowers, message };
}

/** Deterministic plant layout so the garden looks the same on every render. */
export function layoutGarden(plants: GardenPlant[], perRow = 6): GardenPlant[][] {
  const rows: GardenPlant[][] = [];
  for (let index = 0; index < plants.length; index += perRow) {
    rows.push(plants.slice(index, index + perRow));
  }
  return rows;
}

function categoryKind(task: Task): 'academic' | 'rest' | 'personal' | 'general' {
  if (['study', 'homework', 'class'].includes(task.category)) return 'academic';
  if (['rest', 'fun', 'social', 'health'].includes(task.category)) return 'rest';
  if (task.category === 'personal') return 'personal';
  return 'general';
}

function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) % 100000;
  }
  return total;
}

function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
