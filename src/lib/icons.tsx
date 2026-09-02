'use client';

/** Maps persisted icon ids to Lucide components (kept out of the data model). */

import { createElement } from 'react';
import {
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Bus,
  Calculator,
  Camera,
  Car,
  CheckCircle2,
  Clock,
  Coffee,
  Cpu,
  Dna,
  Dumbbell,
  FlaskConical,
  Gamepad2,
  GraduationCap,
  Heart,
  Image,
  Laptop,
  MessageCircle,
  Moon,
  Music,
  Pencil,
  Phone,
  Presentation,
  Sparkles,
  Star,
  Sun,
  Target,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  book: BookOpen,
  pencil: Pencil,
  presentation: Presentation,
  calculator: Calculator,
  atom: Atom,
  flask: FlaskConical,
  dna: Dna,
  code: Laptop,
  cpu: Cpu,
  image: Image,
  message: MessageCircle,
  youtube: Video,
  gamepad: Gamepad2,
  dumbbell: Dumbbell,
  heart: Heart,
  moon: Moon,
  sun: Sun,
  coffee: Coffee,
  clock: Clock,
  check: CheckCircle2,
  user: Heart,
  brain: Brain,
  globe: Target,
  music: Music,
  camera: Camera,
  target: Target,
  star: Star,
  sparkles: Sparkles,
  zap: Zap,
  briefcase: Briefcase,
  graduation: GraduationCap,
  laptop: Laptop,
  phone: Phone,
  bus: Bus,
  car: Car,
  food: Coffee,
  water: Coffee,
  study: BookOpen,
};

export function resolveIcon(name?: string | null): LucideIcon {
  return (name && ICON_REGISTRY[name]) || BookOpen;
}

export function TaskIcon({ name, className }: { name?: string | null; className?: string }) {
  // createElement keeps the icon lookup dynamic without re-creating a component
  // on every render, which would reset its internal state.
  return createElement(resolveIcon(name), { className, 'aria-hidden': true });
}
