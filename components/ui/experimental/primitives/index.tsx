'use client';

import React from 'react';
import { cn } from '@/lib/ui/cn';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'exp-btn',
        `exp-btn--${variant}`,
        size === 'sm' && 'exp-btn--sm',
        size === 'icon' && 'exp-btn--icon',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('exp-input', className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('exp-input exp-textarea', className)} {...props} />;
}

export function Badge({
  children,
  color,
  className,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn('exp-badge', className)}
      style={
        color
          ? {
              background: `${color}18`,
              color,
              borderColor: `${color}30`,
            }
          : {
              background: 'var(--exp-surface-2)',
              color: 'var(--exp-ink-muted)',
              borderColor: 'var(--exp-hairline)',
            }
      }
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div className={cn('exp-card', className)} onClick={onClick} role={onClick ? 'button' : undefined}>
      {children}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('exp-skeleton', className)} style={style} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="exp-empty">
      <div className="exp-empty__title">{title}</div>
      {description && <div className="exp-empty__desc">{description}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="exp-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cn('exp-tab', active === tab.id && 'exp-tab--active')}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;

  const maxWidth =
    size === 'sm' ? 400 : size === 'lg' ? 800 : size === 'xl' ? 960 : 560;

  return (
    <div className="exp-overlay" onClick={onClose}>
      <div
        className="exp-dialog"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="exp-dialog__header">
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              ✕
            </Button>
          </div>
        )}
        <div className="exp-dialog__body">{children}</div>
        {footer && <div className="exp-dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({
  message,
  type = 'info',
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
}) {
  return (
    <div className={cn('exp-toast', type !== 'info' && `exp-toast--${type}`)}>
      {message}
    </div>
  );
}
