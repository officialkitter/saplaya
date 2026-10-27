import { create, type StateCreator } from 'zustand';
import { useMemo } from 'react';
import { fetchAdmin } from './supabase';
import type {
  Application, Movement, OrderStatus, Product, Settings, Supplier,
  SupplierOrder, TeamMember, MemberStatus, SupplierStatus, Role,
} from './types';

interface Actions {
  logout: () => void;
  saveProfileName: (fullName: string) => Promise<void>;
  stockCatalogProduct: (catalogProductId: string, supplierId: string, qty: number) => Promise<{ already_stocked: boolean; stock: number }>;
  publishCatalogProduct: (catalogProductId: string, supplierId: string) => Promise<void>;
  setOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  restock: (productId: string, qty: number, by: string) => Promise<void>;
  addProduct: (p: Omit<Product, 'id' | 'stock' | 'harvestedHoursAgo'>, openingStock: number, by: string) => Promise<void>;
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id' | 'stock' | 'supplierId'>>) => Promise<void>;
  decideApplication: (id: string, decision: 'approved' | 'rejected') => Promise<string | null>;
  addSupplier: (s: { name: string; region: string; contactName: string; contactEmail: string; contactPhone: string }) => Promise<void>;
  setSupplierStatus: (id: string, status: SupplierStatus) => Promise<void>;
  inviteMember: (m: { name: string; email: string; role: Role; supplierId: string | null }) => Promise<string | null>;
  setMemberStatus: (id: string, status: MemberStatus) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
}

export type DB = {
  suppliers: Supplier[];
  products: Product[];
  orders: SupplierOrder[];
  movements: Movement[];
  team: TeamMember[];
  applications: Application[];
  settings: Settings;
  sessionId: string | null;
} & Actions;

const createAdminStore: StateCreator<DB> = (set) => {
  const reload = async () => {
    const { loadAdminData } = await import('./admin-data');
    set(await loadAdminData());
  };

  return {
    suppliers: [],
    products: [],
    orders: [],
    movements: [],
    team: [],
    applications: [],
    settings: {
      hubName: 'Dodoma Central Hub',
      freeRadiusKm: 5,
      midRadiusKm: 10,
      midFee: 2000,
      farFee: 4000,
      commissionPct: 8,
      wholesaleMinDefault: 10,
    },
    sessionId: null,

    logout: () => set({ sessionId: null }),

    saveProfileName: async (fullName) => {
      await fetchAdmin('/admin/me', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: fullName }),
      });
      await reload();
    },

    stockCatalogProduct: async (catalogProductId, supplierId, qty) => {
      const result = await fetchAdmin<{ already_stocked: boolean; stock: number }>(
        `/admin/catalog/${encodeURIComponent(catalogProductId)}/stock`,
        {
          method: 'POST',
          body: JSON.stringify({ supplier_id: supplierId, qty }),
        },
      );
      await reload();
      return result;
    },

    publishCatalogProduct: async (catalogProductId, supplierId) => {
      await fetchAdmin(`/admin/catalog/${encodeURIComponent(catalogProductId)}/publish`, {
        method: 'POST',
        body: JSON.stringify({ supplier_id: supplierId }),
      });
      await reload();
    },

    setOrderStatus: async (orderId, status) => {
      await fetchAdmin(`/admin/supplier-orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await reload();
    },

    restock: async (productId, qty, _by) => {
      await fetchAdmin('/admin/restock', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, qty }),
      });
      await reload();
    },

    addProduct: async (product, openingStock, _by) => {
      await fetchAdmin('/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          name: product.name,
          category: product.category,
          unit: product.unit,
          retail_price: product.retailPrice,
          wholesale_price: product.wholesalePrice,
          wholesale_min_qty: product.wholesaleMinQty,
          low_stock_at: product.lowStockAt,
          stock: openingStock,
          image_url: product.image || undefined,
          active: product.active,
        }),
      });
      await reload();
    },

    updateProduct: async (id, patch) => {
      await fetchAdmin(`/admin/products/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.category !== undefined ? { category: patch.category } : {}),
          ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
          ...(patch.retailPrice !== undefined ? { retail_price: patch.retailPrice } : {}),
          ...(patch.wholesalePrice !== undefined ? { wholesale_price: patch.wholesalePrice } : {}),
          ...(patch.wholesaleMinQty !== undefined ? { wholesale_min_qty: patch.wholesaleMinQty } : {}),
          ...(patch.lowStockAt !== undefined ? { low_stock_at: patch.lowStockAt } : {}),
          ...(patch.image !== undefined ? { image_url: patch.image || null } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        }),
      });
      await reload();
    },

    decideApplication: async (id, decision) => {
      const application = useDB.getState().applications.find((item) => item.id === id);
      await fetchAdmin(`/admin/applications/${encodeURIComponent(id)}/${decision === 'approved' ? 'approve' : 'reject'}`, {
        method: 'POST',
      });
      await reload();
      return decision === 'approved' ? application?.email ?? null : null;
    },

    addSupplier: async (supplier) => {
      await fetchAdmin('/admin/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: supplier.name,
          region: supplier.region,
          contact_name: supplier.contactName,
          contact_email: supplier.contactEmail,
          contact_phone: supplier.contactPhone,
        }),
      });
      await reload();
    },

    setSupplierStatus: async (id, status) => {
      await fetchAdmin(`/admin/suppliers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await reload();
    },

    inviteMember: async (member) => {
      try {
        await fetchAdmin('/admin/team', {
          method: 'POST',
          body: JSON.stringify({
            full_name: member.name,
            email: member.email,
            role: member.role,
            ...(member.supplierId ? { supplier_id: member.supplierId } : {}),
          }),
        });
        await reload();
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'Could not invite this team member.';
      }
    },

    setMemberStatus: async (id, status) => {
      await fetchAdmin(`/admin/team/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await reload();
    },

    saveSettings: async (settings) => {
      await fetchAdmin('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          hub_name: settings.hubName,
          free_radius_km: settings.freeRadiusKm,
          mid_radius_km: settings.midRadiusKm,
          mid_fee: settings.midFee,
          far_fee: settings.farFee,
          commission_pct: settings.commissionPct,
          wholesale_min_default: settings.wholesaleMinDefault,
        }),
      });
      await reload();
    },
  };
};

export const useDB = create<DB>()(createAdminStore);

interface BootState { ready: boolean; setReady: () => void }
export const useBoot = create<BootState>((set) => ({ ready: false, setReady: () => set({ ready: true }) }));

export function useMe(): TeamMember | null {
  const sessionId = useDB((s) => s.sessionId);
  const team = useDB((s) => s.team);
  return useMemo(() => team.find((member) => member.id === sessionId) ?? null, [team, sessionId]);
}

export function useScope() {
  const me = useMe();
  const suppliers = useDB((s) => s.suppliers);
  const products = useDB((s) => s.products);
  const orders = useDB((s) => s.orders);
  const movements = useDB((s) => s.movements);
  const team = useDB((s) => s.team);

  return useMemo(() => {
    const farmId = me?.supplierId ?? null;
    const isDriver = me?.role === 'driver';
    return {
      me,
      farmId,
      suppliers: farmId ? suppliers.filter((supplier) => supplier.id === farmId) : suppliers,
      products: farmId ? products.filter((product) => product.supplierId === farmId) : products,
      orders: (farmId ? orders.filter((order) => order.supplierId === farmId) : orders).filter(
        (order) => !isDriver || order.status === 'packing' || order.status === 'en_route' || order.status === 'delivered'
      ),
      movements: farmId ? movements.filter((movement) => movement.supplierId === farmId) : movements,
      team: farmId ? team.filter((person) => person.supplierId === farmId) : team,
    };
  }, [me, suppliers, products, orders, movements, team]);
}

export type { SupplierOrder };

export interface Toast { id: number; text: string; tone: 'good' | 'bad' | 'info' }
interface ToastState { toasts: Toast[]; push: (text: string, tone?: Toast['tone']) => void; dismiss: (id: number) => void }
let toastId = 1;
export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, tone = 'good') => {
    const id = toastId++;
    set((state) => ({ toasts: [...state.toasts, { id, text, tone }] }));
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
