'use client';

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/* ---------------------------------- Card ---------------------------------- */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, icon, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3.5', className)}>
      <div className="flex items-start gap-3">
        {icon ? <div className="mt-0.5 text-accent">{icon}</div> : null}
        <div>
          <h2 className="text-[0.95rem] font-semibold leading-6">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 shadow-sm',
  secondary: 'bg-surface2 text-fg hover:bg-surface3 border border-line',
  ghost: 'text-muted hover:bg-surface2 hover:text-fg',
  outline: 'border border-line text-fg hover:bg-surface2',
  danger: 'bg-[var(--danger)] text-white hover:brightness-110',
  soft: 'bg-accent-soft text-accent hover:bg-accent/20',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
  icon: 'h-9 w-9',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-control font-medium transition-[filter,background-color,transform] duration-150',
        'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    />
  );
});

/* ---------------------------------- Badge --------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface2 text-muted border-line',
    accent: 'bg-accent-soft text-accent border-transparent',
    success: 'bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)] border-transparent',
    warning: 'bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[var(--warning)] border-transparent',
    danger: 'bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)] border-transparent',
    muted: 'bg-transparent text-subtle border-line',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] font-medium leading-4',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------- Inputs --------------------------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-fg placeholder:text-subtle',
          'transition-colors focus:border-accent focus:outline-none focus-visible:outline-none',
          'disabled:opacity-60',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        dir="auto"
        className={cn(
          'min-h-[80px] w-full rounded-control border border-line bg-surface p-3 text-sm leading-6 text-fg placeholder:text-subtle',
          'focus:border-accent focus:outline-none',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-fg',
          'focus:border-accent focus:outline-none',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[0.7rem] text-[var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="text-[0.7rem] text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------- Switch --------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 rounded-control py-1.5',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {(label || description) && (
        <span className="flex flex-col gap-0.5">
          {label ? <span className="text-sm font-medium">{label}</span> : null}
          {description ? <span className="text-xs text-muted">{description}</span> : null}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : 'کلید تنظیم'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-transparent bg-accent' : 'border-line bg-surface2',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </button>
    </label>
  );
}

/* -------------------------------- Progress -------------------------------- */

export function Progress({ value, className, tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'task' }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface2', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', tone === 'accent' ? 'bg-accent' : 'bg-[var(--task)]')}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ------------------------------- Segmented -------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-1 rounded-control border border-line bg-surface2 p-1', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[calc(var(--radius-base)-0.25rem)] font-medium transition-all',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[0.8rem]',
            value === option.value
              ? 'bg-surface text-fg shadow-sm'
              : 'text-muted hover:text-fg',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- EmptyState -------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface2 text-muted">{icon}</div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mx-auto max-w-sm text-xs leading-6 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-control bg-surface2', className)} />;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-[0.95rem] font-semibold">{children}</h2>
      {hint ? <span className="text-xs text-subtle">{hint}</span> : null}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
  title,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-transparent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}
