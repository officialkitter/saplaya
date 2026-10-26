'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ClipboardList, LayoutDashboard, LogOut, Menu, Package, Settings as SettingsIcon,
  Tractor, Users, Warehouse, X, Tags,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { cn, initials } from '@/lib/format';
import { can, isFarmRole, ROLE_INFO, type Perm } from '@/lib/roles';
import { getSupabase } from '@/lib/supabase';
import { useBoot, useDB, useMe, useScope, useToast } from '@/lib/store';

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

  const info = ROLE_INFO[me.role];
  const farm = farmId ? suppliers.find((s) => s.id === farmId) : null;
  const items = navFor(isFarmRole(me.role)).filter((i) => can(me.role, i.perm));
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
      push(error.message, 'bad');
      return;
    }
    logout();
    router.replace('/login');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <Link href="/admin" onClick={onNavigate} aria-label="Saplaya home"><Logo /></Link>
        <p className="mt-4 rounded-2xl bg-leaf-soft px-3.5 py-2 text-sm font-bold text-leaf-deep">
          {farm ? farm.name : 'Saplaya team'}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Admin">
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
      </nav>

      <div className="m-3 rounded-3xl border border-line bg-milk p-4">
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

function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-milk">
      <div className="flex flex-col items-center gap-4">
        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>
          <LogoMark size={64} />
        </motion.div>
        <p className="font-semibold text-ink-soft">Getting your farm ready</p>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ready = useBoot((s) => s.ready);
  const me = useMe();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (ready && !me) router.replace('/login');
  }, [ready, me, router]);

  if (!ready || !me) return <BootScreen />;

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

      <main className="lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
