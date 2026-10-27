import type { Role } from './types';

export type Perm =
  | 'dashboard.view'
  | 'orders.view'
  | 'orders.update_status'
  | 'products.view'
  | 'products.edit'
  | 'catalog.manage'
  | 'stock.adjust'
  | 'inventory.view'
  | 'suppliers.view_all'
  | 'suppliers.manage'
  | 'team.view'
  | 'team.manage'
  | 'settings.manage';

/** Keep this table identical to PERMISSIONS in backend/src/index.ts. The backend is the real gatekeeper. */
export const PERMS: Record<Role, Perm[]> = {
  platform_owner: [
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view',
    'catalog.manage', 'stock.adjust',
    'inventory.view', 'suppliers.view_all', 'suppliers.manage', 'team.view',
    'team.manage', 'settings.manage',
  ],
  platform_manager: [
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view',
    'catalog.manage', 'inventory.view', 'suppliers.view_all', 'suppliers.manage', 'team.view',
  ],
  supplier_owner: [
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view',
    'products.edit', 'stock.adjust', 'inventory.view', 'team.view', 'team.manage',
  ],
  supplier_staff: [
    'dashboard.view', 'orders.view', 'orders.update_status', 'products.view',
    'stock.adjust', 'inventory.view',
  ],
  driver: ['orders.view', 'orders.update_status'],
};

export const can = (role: Role | undefined | null, perm: Perm): boolean =>
  !!role && PERMS[role].includes(perm);

export const isFarmRole = (role: Role) => role === 'supplier_owner' || role === 'supplier_staff';
export const isPlatformRole = (role: Role) => !isFarmRole(role);

export interface RoleInfo {
  label: string;
  scope: 'Saplaya team' | 'Farm team';
  blurb: string;
  badge: string; // tailwind classes
  cannot: string[];
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  platform_owner: {
    label: 'Owner',
    scope: 'Saplaya team',
    blurb: 'Runs Saplaya. Sees every farm and decides who can do what.',
    badge: 'bg-leaf text-white',
    cannot: ["Change a farm's stock (farm teams control their inventory)"],
  },
  platform_manager: {
    label: 'Operations manager',
    scope: 'Saplaya team',
    blurb: 'Approves new farms and keeps every order moving.',
    badge: 'bg-sprout text-white',
    cannot: ['Change delivery fees and settings', 'Invite or pause team members', 'Approve central catalog prices'],
  },
  supplier_owner: {
    label: 'Farm owner',
    scope: 'Farm team',
    blurb: 'Runs one farm: listings, stock, orders, farm staff and requests for shared-price changes.',
    badge: 'bg-sun text-ink',
    cannot: ['Set shared customer prices directly', 'See other farms', 'See customer phone numbers or full names', 'Add anyone except farm staff'],
  },
  supplier_staff: {
    label: 'Farm packer',
    scope: 'Farm team',
    blurb: "Packs the farm's orders and adds stock when a harvest arrives.",
    badge: 'bg-sun-soft text-ink ring-1 ring-sun-deep/40',
    cannot: ['Change prices or add products', 'Invite team members', 'See other farms', 'See customer phone numbers'],
  },
  driver: {
    label: 'Driver',
    scope: 'Saplaya team',
    blurb: 'Takes packed orders to customers and marks them delivered.',
    badge: 'bg-[#F3E5F5] text-[#7B1FA2]',
    cannot: ['Pack or cancel orders', 'See products, stock or money', 'See the team'],
  },
};

export const ROLE_ORDER: Role[] = [
  'platform_owner',
  'platform_manager',
  'supplier_owner',
  'supplier_staff',
  'driver',
];

export const PERM_ROWS: { perm: Perm; label: string }[] = [
  { perm: 'dashboard.view', label: 'See the home summary' },
  { perm: 'orders.view', label: 'See orders' },
  { perm: 'orders.update_status', label: 'Move orders forward or cancel them' },
  { perm: 'products.view', label: 'See products' },
  { perm: 'products.edit', label: 'Manage farm listings and request price updates' },
  { perm: 'catalog.manage', label: 'Approve and set shared catalog prices' },
  { perm: 'stock.adjust', label: 'Add stock when a harvest arrives' },
  { perm: 'inventory.view', label: 'See stock history' },
  { perm: 'suppliers.view_all', label: 'See every farm' },
  { perm: 'suppliers.manage', label: 'Approve, add or pause farms' },
  { perm: 'team.view', label: 'See team members' },
  { perm: 'team.manage', label: 'Invite or pause team members' },
  { perm: 'settings.manage', label: 'Change delivery fees and settings' },
];

/** Which roles a person is allowed to hand out. Nobody can create a role above their own. */
export const ASSIGNABLE: Record<Role, Role[]> = {
  platform_owner: ['platform_manager', 'driver', 'supplier_owner', 'supplier_staff'],
  platform_manager: [],
  supplier_owner: ['supplier_staff'],
  supplier_staff: [],
  driver: [],
};
