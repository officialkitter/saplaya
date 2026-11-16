'use client';

import { userFacingMessage } from '@/lib/user-facing-error';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ClipboardList, LayoutDashboard, LogOut, Menu, Package, Settings as SettingsIcon, UserRound,
  Tractor, Users, Warehouse, X, Tags, BriefcaseBusiness,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { cn, initials } from '@/lib/format';
import { can, isFarmRole, roleInfo } from '@/lib/roles';
import { getSupabase } from '@/lib/supabase';
import { useBoot, useDB, useMe, useScope, useToast } from '@/lib/store';
import type { Perm } from '@/lib/types';

interface NavItem { href: string; label: string; icon: typeof Package; perm: Perm; exact?: boolean }

function navFor(farm: boolean): NavItem[] {
  return [
    { href: '/admin', label: 'Home', icon: LayoutDashboard, perm: 'dashboard.view', exact: true },
    { href: '/admin/orders', label: 'Orders', icon: ClipboardList, perm: 'orders.view' },
    { href: '/admin/products', label: farm ? 'My products' : 'Products', icon: Package, perm: 'products.view' },
    { href: '/admin/catalog', label: 'Shared catalog', icon: Tags, perm: 'catalog.manage' },
    { href: '/admin/inventory', label: 'Stock history', icon: Warehouse, perm: 'inventory.view' },
    { href: '/admin/suppliers', label: 'Farms', icon: Tractor, perm: 'suppliers.view_all' },
    { href: '/admin/team', label: 'Team and roles', icon: Users, perm: 'team.view' },
    { href: '/admin/management', label: 'Management', icon: BriefcaseBusiness, perm: 'management.view' },
    { href: '/admin/settings', label: 'Settings', icon: SettingsIcon, perm: 'settings.manage' },
  ];
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, farmId, suppliers, orders } = useScope();
  const logout = useDB((s) => s.logout);
  const applications = useDB((s) => s.applications);
  const push = useToast((s) => s.push);
  if (!me) return null;

  const info = roleInfo(me.role, me.roleLabel, me.roleScope);
  const farm = farmId ? suppliers.find((s) => s.id === farmId) : null;
  const items = navFor(isFarmRole(me.role, me.roleScope)).filter((i) => can(me.role, i.perm, me.permissions));
  const newOrders = orders.filter((o) => o.status === 'pending').length;
  const newApps = applications.filter((a) => a.status === 'new').length;

  const badgeFor = (href: string) => {
    if (href === '/admin/orders') return me.role === 'driver' ? 0 : newOrders;
    if (href === '/admin/suppliers') return newApps;
    return 0;
  };

  async function signOut() {
    const { error } = await getSupabase().auth.signOut();
    if (error) {
      push(userFacingMessage(error, 'Could not load this page. Please try again.'), 'bad');
      return;
    }
    logout();
    router.replace('/login');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <Link href="/admin" onClick={onNavigate} aria-label="Saplaya home"><Logo /></Link>
        <p className="mt-4 rounded-2xl px-3.5 py-2 text-sm font-bold text-white" style={{ backgroundColor: me.departmentTheme ?? '#2E7D32' }}>
          {farm ? farm.name : 'Saplaya team'}
        </p>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3" aria-label="Admin">
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          const Icon = it.icon;
          const badge = badgeFor(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn('relative flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-[17px] font-bold transition-colors', active ? 'text-white' : 'text-ink-soft hover:bg-leaf-soft')}
            >
              {active && (
                <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-leaf shadow-soft" transition={{ type: 'spring', damping: 26, stiffness: 340 }} />
              )}
              <Icon size={23} className="relative" />
              <span className="relative flex-1">{it.label}</span>
              {badge > 0 && (
                <span className={cn('relative grid min-w-[26px] place-items-center rounded-full px-2 py-0.5 text-sm font-extrabold', active ? 'bg-sun text-ink' : 'bg-sun-deep text-ink')}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
        <Link
          href="/admin/account"
          onClick={onNavigate}
          aria-current={pathname === '/admin/account' ? 'page' : undefined}
          className={cn('flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-[17px] font-bold transition-colors', pathname === '/admin/account' ? 'bg-leaf text-white shadow-soft' : 'text-ink-soft hover:bg-leaf-soft')}
        >
          <UserRound size={23} />
          <span>My account</span>
        </Link>
      </nav>

      <div className="m-3 shrink-0 rounded-3xl border border-line bg-milk p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf font-extrabold text-white">{initials(me.name)}</span>
          <div className="min-w-0">
            <p className="truncate font-bold">{me.name}</p>
            <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-bold', info.badge)}>{info.label}</span>
          </div>
        </div>
        <button
          onClick={() => { void signOut(); }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-bold text-ink-soft transition hover:bg-white"
        >
          <LogOut size={18} /> Sign out
        </button>
      </div>
    </div>
  );
}

function BootScreen({ error, retry }: { error: string | null; retry: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-milk px-5">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>
          <LogoMark size={64} />
        </motion.div>
        <p role={error ? 'alert' : 'status'} className="font-semibold text-ink-soft">{error ?? 'Getting your farm ready'}</p>
        {error && (
          <button type="button" onClick={retry} className="rounded-xl bg-leaf px-5 py-3 font-bold text-white">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ready = useBoot((s) => s.ready);
  const bootError = useBoot((s) => s.error);
  const retry = useBoot((s) => s.retry);
  const me = useMe();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (ready && !me && !bootError) router.replace('/login');
  }, [ready, me, bootError, router]);

  if (!ready || !me || bootError) return <BootScreen error={bootError} retry={retry} />;

  return (
    <div className="min-h-screen bg-milk">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-line bg-white lg:block">
        <SidebarBody />
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setMenu(true)} aria-label="Open menu" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-leaf-soft">
          <Menu size={26} />
        </button>
      </header>

      <AnimatePresence>
        {menu && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-ink/40" onClick={() => setMenu(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              className="absolute inset-y-0 left-0 w-[300px] max-w-[88vw] bg-white shadow-lift"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            >
              <button onClick={() => setMenu(false)} aria-label="Close menu" className="absolute right-3 top-4 z-10 grid h-10 w-10 place-items-center rounded-xl hover:bg-leaf-soft">
                <X size={22} />
              </button>
              <SidebarBody onNavigate={() => setMenu(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="min-w-0 lg:pl-72">
        <div className="mx-auto min-w-0 max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
