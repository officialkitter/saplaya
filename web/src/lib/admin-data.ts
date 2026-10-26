import type { DB } from '@/lib/store';
import { fetchAdmin } from '@/lib/supabase';
import type { Role } from '@/lib/types';

type MemberResponse = {
  id: string;
  supplier_id: string | null;
  full_name: string;
  email: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  permissions: string[];
};

type Row = Record<string, unknown>;

function rows(value: unknown, endpoint: string): Row[] {
  if (!Array.isArray(value)) throw new Error(`Unexpected response from ${endpoint}.`);
  return value as Row[];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function loadAdminData(): Promise<Partial<DB>> {
  const member = await fetchAdmin<MemberResponse>('/admin/me');
  const permissions = new Set(member.permissions);
  const jobs: Promise<unknown>[] = [];
  const keys: string[] = [];
  const enqueue = (permission: string, key: string, path: string) => {
    if (permissions.has(permission)) {
      keys.push(key);
      jobs.push(fetchAdmin<unknown>(path));
    }
  };

  enqueue('suppliers.view_all', 'suppliers', '/admin/suppliers');
  enqueue('products.view', 'products', '/admin/products');
  enqueue('orders.view', 'orders', '/admin/orders');
  enqueue('inventory.view', 'movements', '/admin/inventory-movements');
  enqueue('team.view', 'team', '/admin/team');
  enqueue('suppliers.manage', 'applications', '/admin/applications');
  const settingsRequest = permissions.has('settings.manage')
    ? fetchAdmin<Row>('/admin/settings')
    : Promise.resolve(null);

  const [responses, settings] = await Promise.all([Promise.all(jobs), settingsRequest]);
  const raw = Object.fromEntries(keys.map((key, index) => [key, rows(responses[index], `/admin/${key}`)]));
  const mapped: Partial<DB> = {
    team: [{
      id: member.id,
      supplierId: member.supplier_id,
      name: member.full_name,
      email: member.email,
      role: member.role,
      status: member.status,
    }],
    sessionId: member.id,
  };

  if (raw.suppliers) {
    mapped.suppliers = raw.suppliers.map((supplier) => ({
      id: text(supplier.id),
      name: text(supplier.name),
      region: text(supplier.region),
      contactName: text(supplier.contact_name),
      contactEmail: text(supplier.contact_email),
      contactPhone: text(supplier.contact_phone),
      status: text(supplier.status, 'pending') as 'pending' | 'active' | 'suspended',
      commissionPct: number(supplier.commission_pct, 8),
      joinedAt: timestamp(supplier.created_at),
      emoji: '🌱',
    }));
  }

  if (raw.products) {
    mapped.products = raw.products.map((product) => ({
      id: text(product.id),
      supplierId: text(product.supplier_id),
      name: text(product.name),
      category: text(product.category),
      unit: text(product.unit, 'kg'),
      retailPrice: number(product.retail_price),
      wholesalePrice: number(product.wholesale_price),
      wholesaleMinQty: number(product.wholesale_min_qty, 10),
      stock: number(product.stock),
      lowStockAt: number(product.low_stock_at, 10),
      image: text(product.image_url),
      emoji: '🌿',
      harvestedHoursAgo: Math.max(0, (Date.now() - timestamp(product.harvested_at)) / 3_600_000),
      active: product.active !== false,
    }));
  }

  if (raw.orders) {
    mapped.orders = raw.orders.map((order) => {
      const relatedOrder = order.order as Row | null;
      const items = Array.isArray(order.items) ? order.items as Row[] : [];
      return {
        id: text(order.id),
        code: text(order.code, text(order.order_id).slice(0, 8).toUpperCase()),
        supplierId: text(order.supplier_id),
        status: text(order.status, 'pending') as DB['orders'][number]['status'],
        placedAt: timestamp(relatedOrder?.created_at),
        updatedAt: timestamp(order.updated_at),
        customerName: text(order.customer_name, 'Customer'),
        customerPhone: text(order.customer_phone),
        deliveryFee: number(relatedOrder?.delivery_fee),
        deliveryWindow: relatedOrder?.delivery_window === 'afternoon' ? 'afternoon' : 'morning',
        paymentMethod: relatedOrder?.payment_method === 'cash_on_delivery' ? 'cash_on_delivery' : 'pesapal',
        area: text(order.area, 'Delivery location'),
        mode: text(relatedOrder?.mode, 'retail') as 'retail' | 'wholesale',
        items: items.map((item) => ({
          productId: text(item.product_id),
          qty: number(item.qty),
          unitPrice: number(item.unit_price),
        })),
      };
    });
  }

  if (raw.movements) {
    mapped.movements = raw.movements.map((movement) => ({
      id: text(movement.id),
      supplierId: text(movement.supplier_id),
      productId: text(movement.product_id),
      kind: text(movement.kind, 'adjustment') as DB['movements'][number]['kind'],
      qtyChange: number(movement.qty_change),
      stockAfter: number(movement.stock_after),
      at: timestamp(movement.created_at),
      orderCode: text(movement.order_id).slice(0, 8).toUpperCase() || undefined,
    }));
  }

  if (raw.team) {
    mapped.team = raw.team.map((person) => ({
      id: text(person.id),
      supplierId: typeof person.supplier_id === 'string' ? person.supplier_id : null,
      name: text(person.full_name),
      email: text(person.email),
      role: text(person.role) as Role,
      status: text(person.status, 'invited') as 'active' | 'invited' | 'suspended',
    }));
    mapped.sessionId = member.id;
  }

  if (raw.applications) {
    mapped.applications = raw.applications.map((application) => ({
      id: text(application.id),
      farmName: text(application.farm_name),
      contactName: text(application.contact_name),
      email: text(application.email),
      phone: text(application.phone),
      region: text(application.region, text(application.location)),
      produce: text(application.produce, text(application.products)),
      farmSize: text(application.farm_size),
      status: ['approved'].includes(text(application.status))
        ? 'approved'
        : ['rejected', 'declined'].includes(text(application.status))
          ? 'rejected'
          : 'new',
      at: timestamp(application.created_at),
    }));
  }

  if (settings) {
    mapped.settings = {
      hubName: text(settings.hub_name, 'Dodoma Central Hub'),
      freeRadiusKm: number(settings.free_radius_km, 5),
      midRadiusKm: number(settings.mid_radius_km, 10),
      midFee: number(settings.mid_fee, 2000),
      farFee: number(settings.far_fee, 4000),
      commissionPct: number(settings.commission_pct, 8),
      wholesaleMinDefault: number(settings.wholesale_min_default, 10),
    };
  }

  return mapped;
}
