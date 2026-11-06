import type { DB } from '@/lib/store';
import { fetchAdmin } from '@/lib/supabase';
import type { Perm, Role } from '@/lib/types';

type MemberResponse = {
  id: string;
  supplier_id: string | null;
  full_name: string;
  email: string;
  role: Role;
  role_label: string;
  role_scope: 'platform' | 'farm';
  permissions: Perm[];
  department_id: string;
  department: string;
  department_theme: string;
  status: 'active' | 'invited' | 'suspended';
  phone?: string | null;
  age?: number | null;
  job_title?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  operation_scope_mode?: 'global' | 'restricted';
  operation_scopes?: {
    country_code: string;
    country_name: string;
    region_code: string;
    region_name: string;
    district_code: string | null;
    district_name: string | null;
  }[];
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

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
  const enqueue = (permission: Perm, key: string, path: string) => {
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
      roleLabel: member.role_label,
      roleScope: member.role_scope,
      permissions: member.permissions,
      departmentId: member.department_id,
      department: member.department,
      departmentTheme: member.department_theme,
      status: member.status,
      phone: member.phone ?? null,
      age: member.age ?? null,
      jobTitle: member.job_title ?? null,
      bio: member.bio ?? null,
      avatarUrl: member.avatar_url ?? null,
      avatarPath: member.avatar_path ?? null,
      operationScopeMode: member.operation_scope_mode ?? 'global',
      operationScopes: (member.operation_scopes ?? []).map((scope) => ({
        countryCode: scope.country_code,
        countryName: scope.country_name,
        regionCode: scope.region_code,
        regionName: scope.region_name,
        districtCode: scope.district_code,
        districtName: scope.district_name,
      })),
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
      mergedIntoSupplierId: typeof supplier.merged_into_supplier_id === 'string' ? supplier.merged_into_supplier_id : null,
      latitude: numberOrNull(supplier.latitude),
      longitude: numberOrNull(supplier.longitude),
      commissionPct: number(supplier.commission_pct, 8),
      countryCode: text(supplier.country_code) || null,
      countryName: text(supplier.country_name) || null,
      regionCode: text(supplier.region_code) || null,
      regionName: text(supplier.region_name) || null,
      districtCode: text(supplier.district_code) || null,
      districtName: text(supplier.district_name) || null,
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
      bulkPrice: numberOrNull(product.bulk_price),
      megaBulkPrice: numberOrNull(product.mega_bulk_price),
      stock: number(product.stock),
      lowStockAt: number(product.low_stock_at, 10),
      image: text(product.image_url),
      emoji: '🌿',
      harvestedHoursAgo: Math.max(0, (Date.now() - timestamp(product.harvested_at)) / 3_600_000),
      active: product.active !== false,
      approvalStatus: product.approval_status === 'approved'
        ? 'approved'
        : product.approval_status === 'pending' ? 'pending' : 'unlinked',
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
        deliveryWindow: ['morning', 'evening', '12h', '24h', '48h', '72h', '7d', '10d', '14d'].includes(String(relatedOrder?.delivery_window))
          ? relatedOrder?.delivery_window as import('./types').DeliveryEta
          : 'morning',
        paymentMethod: relatedOrder?.payment_method === 'cash_on_delivery' ? 'cash_on_delivery' : 'pesapal',
        area: text(order.area, 'Delivery location'),
        mode: text(relatedOrder?.mode, 'retail') as 'retail' | 'wholesale',
        items: items.map((item) => ({
          productId: text(item.product_id),
          qty: number(item.qty),
          unitPrice: number(item.unit_price),
        })),
        assigneeId: typeof order.assignee_id === 'string' ? order.assignee_id : null,
        assigneeName: typeof order.assignee_name === 'string' ? order.assignee_name : null,
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
      roleLabel: text(person.role_label, text(person.role)),
      roleScope: text(person.role_scope, person.supplier_id ? 'farm' : 'platform') as 'platform' | 'farm',
      permissions: Array.isArray(person.permissions) ? person.permissions as Perm[] : [],
      departmentId: text(person.department_id),
      department: text(person.department, 'Unassigned'),
      departmentTheme: text(person.department_theme, '#6B7A6C'),
      status: text(person.status, 'invited') as 'active' | 'invited' | 'suspended',
      phone: typeof person.phone === 'string' ? person.phone : null,
      age: typeof person.age === 'number' ? person.age : null,
      jobTitle: typeof person.job_title === 'string' ? person.job_title : null,
      bio: typeof person.bio === 'string' ? person.bio : null,
      avatarUrl: typeof person.avatar_url === 'string' ? person.avatar_url : null,
      operationScopeMode: person.operation_scope_mode === 'restricted' ? 'restricted' : 'global',
      operationScopes: Array.isArray(person.operation_scopes)
        ? person.operation_scopes.map((scope) => ({
          countryCode: text(scope.country_code),
          countryName: text(scope.country_name),
          regionCode: text(scope.region_code),
          regionName: text(scope.region_name),
          districtCode: typeof scope.district_code === 'string' ? scope.district_code : null,
          districtName: typeof scope.district_name === 'string' ? scope.district_name : null,
        }))
        : [],
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
      countryName: text(application.country_name) || undefined,
      regionName: text(application.region_name) || undefined,
      districtName: typeof application.district_name === 'string' ? application.district_name : null,
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
      hubName: text(settings.hub_name, 'Saplaya Operations Hub'),
      freeRadiusKm: number(settings.free_radius_km, 5),
      midRadiusKm: number(settings.mid_radius_km, 10),
      midFee: number(settings.mid_fee, 2000),
      farFee: number(settings.far_fee, 4000),
      commissionPct: number(settings.commission_pct, 8),
      wholesaleMinDefault: number(settings.wholesale_min_default, 10),
      tierPricePercentages: {
        wholesale: number((settings.tier_price_percentages as Row | null)?.wholesale, 70),
        bulk: number((settings.tier_price_percentages as Row | null)?.bulk, 65),
        mega_bulk: number((settings.tier_price_percentages as Row | null)?.mega_bulk, 55),
      },
      deliveryOptionFees: {
        morning: 0,
        evening: 0,
        '12h': numberOrNull((settings.delivery_option_fees as Row | null)?.['12h']),
        '24h': numberOrNull((settings.delivery_option_fees as Row | null)?.['24h']),
        '48h': numberOrNull((settings.delivery_option_fees as Row | null)?.['48h']),
        '72h': numberOrNull((settings.delivery_option_fees as Row | null)?.['72h']),
        '7d': numberOrNull((settings.delivery_option_fees as Row | null)?.['7d']),
        '10d': numberOrNull((settings.delivery_option_fees as Row | null)?.['10d']),
        '14d': numberOrNull((settings.delivery_option_fees as Row | null)?.['14d']),
      },
    };
  }

  return mapped;
}
