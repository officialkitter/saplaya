'use client';

import Link from 'next/link';
import { useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/format';

type Variant = 'primary' | 'sun' | 'soft' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'sm';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-leaf text-white hover:bg-leaf-deep shadow-soft',
  sun: 'bg-sun text-ink hover:bg-sun-deep shadow-soft',
  soft: 'bg-leaf-soft text-leaf-deep hover:bg-[#d7ecd9]',
  ghost: 'bg-transparent text-ink-soft hover:bg-leaf-soft',
  danger: 'bg-[#FFEBEE] text-[#B71C1C] hover:bg-[#ffd9de]',
};
const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-xl',
  md: 'h-11 px-5 text-[15px] rounded-2xl',
  lg: 'h-14 px-7 text-lg rounded-2xl',
};

const base =
  'inline-flex select-none items-center justify-center gap-2 font-bold transition active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50';

export function Button({
  variant = 'primary', size = 'md', className, icon, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const originalOnClick = rest.onClick;
  const guardedOnClick = originalOnClick
    ? (event: MouseEvent<HTMLButtonElement>) => {
        if (lock.current || rest.disabled || busy) return;
        lock.current = true;
        setBusy(true);
        try {
          const result = originalOnClick(event);
          Promise.resolve(result).then(
            () => { lock.current = false; setBusy(false); },
            () => { lock.current = false; setBusy(false); },
          );
        } catch {
          lock.current = false;
          setBusy(false);
        }
      }
    : undefined;
  return (
    <button
      {...rest}
      onClick={guardedOnClick}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={cn(base, variant !== 'ghost' && 'tactile-control', VARIANT[variant], SIZE[size], className)}
    >
      {icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href, variant = 'primary', size = 'md', className, icon, children,
}: { href: string; variant?: Variant; size?: Size; className?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className={cn(base, variant !== 'ghost' && 'tactile-control', VARIANT[variant], SIZE[size], className)}>
      {icon}
      {children}
    </Link>
  );
}
