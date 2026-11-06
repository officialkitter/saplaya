export type BuiltinRole =
  | 'platform_owner'
  | 'platform_manager'
  | 'supplier_owner'
  | 'supplier_staff'
  | 'driver';
export type Role = BuiltinRole | (string & {});
export type DepartmentScope = 'platform' | 'farm';
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
  | 'settings.manage'
  | 'finance.view'
  | 'marketing.view'
  | 'stores.view'
  | 'system.view'
  | 'team.roles.manage'
  | 'management.view'
  | 'management.manage';

export type OrderStatus = 'pending' | 'packing' | 'en_route' | 'delivered' | 'cancelled';
export type Mode = 'retail' | 'wholesale' | 'bulk' | 'mega_bulk';
export type SupplierStatus = 'pending' | 'active' | 'suspended';
export type MemberStatus = 'invited' | 'active' | 'suspended';
export type MovementKind = 'sale' | 'restock' | 'adjustment' | 'cancel_return';
export type DeliveryEta = 'morning' | 'evening' | '12h' | '24h' | '48h' | '72h' | '7d' | '10d' | '14d';
export const DELIVERY_ETAS: { value: DeliveryEta; title: string }[] = [
  { value: 'morning', title: 'Morning delivery window' },
  { value: 'evening', title: 'Evening delivery window' },
  { value: '12h', title: '12 hours' },
  { value: '24h', title: '24 hours' },
  { value: '48h', title: '48 hours' },
  { value: '72h', title: '72 hours' },
  { value: '7d', title: '7 days' },
  { value: '10d', title: '10 days' },
  { value: '14d', title: '14 days' },
];

export interface Supplier {
  id: string;
  name: string;
  region: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: SupplierStatus;
  mergedIntoSupplierId?: string | null;
  latitude: number | null;
  longitude: number | null;
  commissionPct: number;
  countryCode?: string | null;
  countryName?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  joinedAt: number;
  emoji: string;
}

export interface Product {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  unit: string;
  retailPrice: number;
  wholesalePrice: number;
  wholesaleMinQty: number;
  bulkPrice: number | null;
  megaBulkPrice: number | null;
  stock: number;
  lowStockAt: number;
  image: string;
  emoji: string;
  harvestedHoursAgo: number;
  active: boolean;
  approvalStatus?: 'approved' | 'pending' | 'unlinked';
}

export interface OrderItem {
  productId: string;
  qty: number;
  unitPrice: number;
}

/** One farm's share of a customer order. This is what a supplier works on. */
export interface SupplierOrder {
  id: string;
  code: string;
  supplierId: string;
  status: OrderStatus;
  placedAt: number;
  updatedAt: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryFee?: number;
  deliveryWindow?: DeliveryEta;
  paymentMethod?: 'pesapal' | 'cash_on_delivery';
  area: string;
  mode: Mode;
  items: OrderItem[];
  assigneeId?: string | null;
  assigneeName?: string | null;
}

export interface Movement {
  id: string;
  supplierId: string;
  productId: string;
  kind: MovementKind;
  qtyChange: number;
  stockAfter: number;
  at: number;
  orderCode?: string;
  by?: string;
}

export interface TeamMember {
  id: string;
  supplierId: string | null;
  name: string;
  email: string;
  role: Role;
  roleLabel?: string;
  roleScope?: DepartmentScope;
  permissions?: Perm[];
  departmentId?: string;
  department?: string;
  departmentTheme?: string;
  status: MemberStatus;
  phone?: string | null;
  age?: number | null;
  jobTitle?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  avatarPath?: string | null;
  operationScopeMode?: 'global' | 'restricted';
  operationScopes?: {
    countryCode: string;
    countryName: string;
    regionCode: string;
    regionName: string;
    districtCode: string | null;
    districtName: string | null;
  }[];
}

export interface Application {
  id: string;
  farmName: string;
  contactName: string;
  email: string;
  phone: string;
  region: string;
  countryName?: string;
  regionName?: string;
  districtName?: string | null;
  produce: string;
  farmSize: string;
  status: 'new' | 'approved' | 'rejected';
  at: number;
}

export interface Settings {
  hubName: string;
  freeRadiusKm: number;
  midRadiusKm: number;
  midFee: number;
  farFee: number;
  commissionPct: number;
  wholesaleMinDefault: number;
  tierPricePercentages: { wholesale: number; bulk: number; mega_bulk: number };
  deliveryOptionFees: Record<DeliveryEta, number | null>;
}
