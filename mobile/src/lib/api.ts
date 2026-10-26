import { API_URL, supabase } from './supabase';
import { getCustomerApiToken } from './customer-auth';
import { Mode, Product, Promo } from '../types';

const PAGE = 20;

export async function fetchProducts(page: number): Promise<{ items: Product[]; hasMore: boolean }> {
  const response = await fetch(`${API_URL}/products?page=${page}&size=${PAGE}`);
  if (!response.ok) throw new Error('Could not load items');
  return response.json();
}

export async function fetchPromos(): Promise<Promo[]> {
  const response = await fetch(`${API_URL}/promos`);
  if (!response.ok) throw new Error('Could not load promotions.');
  return response.json();
}

type AuthenticatedOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
};

async function authenticatedRequest<T>(path: string, options: AuthenticatedOptions = {}): Promise<T> {
  const token = await getCustomerApiToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const result = await response.json() as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
        ? result.error
        : 'The request could not be completed.',
    );
  }
  return result as T;
}

export type CheckoutInput = {
  mode: Mode;
  delivery_window: 'morning' | 'afternoon';
  items: { product_id: string; qty: number }[];
  lat: number;
  lng: number;
  customer: { name: string; email: string; phone: string };
  payment_phone?: string;
};

export type SavedPaymentMethod = {
  id: string;
  label: string;
  phone_e164: string;
  is_default: boolean;
  created_at: string;
};

export type OrderItem = {
  qty: number;
  unit_price: number;
  products: { name: string; unit: string; image_url: string | null } | null;
};

export type CustomerOrder = {
  id: string;
  mode: Mode;
  status: import('../theme').OrderStatus;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  delivery_window?: 'morning' | 'afternoon';
  payment_method?: 'pesapal' | 'cash_on_delivery';
  customer_email?: string;
  order_items: OrderItem[];
};

export function initializePayment(input: CheckoutInput) {
  return authenticatedRequest<{
    payment_url: string;
    tx_ref: string;
    order_tracking_id: string;
    amount: number;
    currency: string;
    delivery_fee: number;
    distance_km: number;
    subtotal: number;
    items: { product_id: string; qty: number; unit_price: number }[];
  }>('/payments/initialize', { method: 'POST', body: input });
}

export function placeCashOrder(input: CheckoutInput & { request_key: string }) {
  return authenticatedRequest<{
    order_id: string;
    subtotal: number;
    delivery_fee: number;
    amount: number;
    delivery_window: 'morning' | 'afternoon';
    created_at: string;
    items: { product_id: string; qty: number; unit_price: number }[];
  }>('/orders/cash', { method: 'POST', body: input });
}

export function fetchPaymentMethods() {
  return authenticatedRequest<SavedPaymentMethod[]>('/payment-methods');
}

export function savePaymentMethod(input: { label: string; phone: string }) {
  return authenticatedRequest<SavedPaymentMethod>('/payment-methods', { method: 'POST', body: input });
}

export async function deletePaymentMethod(id: string) {
  const token = await getCustomerApiToken();
  const response = await fetch(`${API_URL}/payment-methods/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token },
  });
  if (response.status === 204) return;
  const result = await response.json() as { error?: string };
  throw new Error(result.error ?? 'Could not remove this payment method.');
}

export async function registerPushToken(token: string, platform: 'android' | 'ios') {
  await authenticatedRequest<{ registered: boolean }>('/devices/push-token', {
    method: 'POST',
    body: { token, platform },
  });
}

export function confirmPayment(txRef: string, orderTrackingId: string) {
  return authenticatedRequest<{ order_id: string }>('/payments/confirm', {
    method: 'POST',
    body: { tx_ref: txRef, order_tracking_id: orderTrackingId },
  });
}

export function fetchOrderHistory() {
  return authenticatedRequest<CustomerOrder[]>('/orders');
}

export function submitSupplierApplication(input: {
  farmName: string;
  contactName: string;
  email: string;
  phone: string;
  location: string;
  products: string;
}) {
  return authenticatedRequest<{ id: string; status: string; created_at: string }>('/supplier-applications', {
    method: 'POST',
    body: input,
  });
}

export { supabase };
