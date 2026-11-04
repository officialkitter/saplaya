export type Role =
  | 'platform_owner'
  | 'platform_manager'
  | 'supplier_owner'
  | 'supplier_staff'
  | 'driver';

export type OrderStatus = 'pending' | 'packing' | 'en_route' | 'delivered' | 'cancelled';
export type Mode = 'retail' | 'wholesale';
export type SupplierStatus = 'pending' | 'active' | 'suspended';
export type MemberStatus = 'invited' | 'active' | 'suspended';
export type MovementKind = 'sale' | 'restock' | 'adjustment' | 'cancel_return';
export type DeliveryEta = '12h' | '24h' | '48h' | '72h' | '7d' | '10d' | '14d';
export const DELIVERY_ETAS: { value: DeliveryEta; title: string }[] = [
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
  latitude: number | null;
  longitude: number | null;
  commissionPct: number;
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
  status: MemberStatus;
}

export interface Application {
  id: string;
  farmName: string;
  contactName: string;
  email: string;
  phone: string;
  region: string;
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
  deliveryOptionFees: Record<DeliveryEta, number | null>;
}
