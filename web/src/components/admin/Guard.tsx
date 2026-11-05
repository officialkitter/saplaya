'use client';

import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { can, PERM_ROWS, PERMS, ROLE_INFO, ROLE_ORDER, roleInfo } from '@/lib/roles';
import { useMe } from '@/lib/store';
import type { Perm } from '@/lib/types';

/** Wrap a page: people without the permission see a friendly explanation instead of the page. */
export function Guarded({ perm, children }: { perm: Perm; children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  if (!me) return null;
  if (can(me.role, perm, me.permissions)) return <>{children}</>;

  const who = ROLE_ORDER.filter((r) => PERMS[r].includes(perm)).map((r) => ROLE_INFO[r].label);
  const what = PERM_ROWS.find((p) => p.perm === perm)?.label ?? 'open this page';
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-10 max-w-lg rounded-[2rem] bg-white p-8 text-center shadow-soft">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-sun-soft text-sun-deep"><Lock size={36} /></span>
      <h1 className="mt-5 font-display text-2xl font-extrabold">This page is not part of your role</h1>
      <p className="mt-2 text-ink-soft">
        Your role ({roleInfo(me.role, me.roleLabel, me.roleScope).label}) cannot {what.charAt(0).toLowerCase() + what.slice(1)}.
      </p>
      <p className="mt-2 text-ink-soft">Who can: <b className="text-ink">{who.join(', ')}</b>.</p>
      <Button className="mt-6" onClick={() => router.replace(me.role === 'driver' ? '/admin/orders' : '/admin')}>Go back to my work</Button>
    </motion.div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-lg text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, subtitle, children, className, action }: { title?: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-[1.75rem] border border-line bg-white p-5 shadow-soft sm:p-6 ${className ?? ''}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-xl font-extrabold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[15px] text-ink-mute">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
