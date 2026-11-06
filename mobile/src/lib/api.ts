import { API_URL, supabase } from './supabase';
import { getCustomerApiToken } from './customer-auth';
import { Mode, Product, Promo } from '../types';

const PAGE = 20;

export async function fetchProducts(page: number, location?: { lat: number; lng: number }): Promise<{ items: Product[]; hasMore: boolean }> {
  const query = new URLSearchParams({ page: String(page), size: String(PAGE) });
  if (location) {
    query.set('lat', String(location.lat));
    query.set('lng', String(location.lng));
  }
  const response = await fetch(`${API_URL}/products?${query.toString()}`);
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
  client_platform?: 'mobile' | 'web';
  mode: Mode;
  delivery_window: DeliveryEta;
  delivery_fee_accepted: boolean;
  quoted_delivery_fee: number;
  items: { product_id: string; qty: number }[];
  lat: number;
  lng: number;
  customer: { name: string; email: string; phone: string };
  payment_phone?: string;
};

export type DeliveryEta = 'morning' | 'evening' | '12h' | '24h' | '48h' | '72h' | '7d' | '10d' | '14d';
export type DeliveryOption = { value: DeliveryEta; title: string; fee: number };
export type CheckoutQuote = {
  items: {
    requested_product_id: string;
    product_id: string;
    qty: number;
    unit_price: number;
    distance_km: number;
  }[];
  subtotal: number;
  distance_km: number;
  distance_fee: number;
  speed_fee: number;
  delivery_fee: number;
  amount: number;
};

export async function fetchCheckoutQuote(input: {
  mode: Mode;
  delivery_window: DeliveryEta;
  items: { product_id: string; qty: number }[];
  lat: number;
  lng: number;
}): Promise<CheckoutQuote> {
  return authenticatedRequest<CheckoutQuote>('/checkout/quote', { method: 'POST', body: input });
}

export async function fetchDeliveryOptions(): Promise<DeliveryOption[]> {
  const response = await fetch(`${API_URL}/delivery-options`);
  if (!response.ok) throw new Error('Could not load delivery options.');
  return response.json();
}

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
  delivery_window?: DeliveryEta;
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
    delivery_window: DeliveryEta;
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

export type LocationOption = { code: string; name: string };

async function fetchLocationOptions(path: string): Promise<LocationOption[]> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error('Could not load country and region options.');
  return response.json();
}

export function fetchLocationCountries() {
  return fetchLocationOptions('/locations/countries');
}

export function fetchLocationRegions(countryCode: string) {
  return fetchLocationOptions(`/locations/countries/${encodeURIComponent(countryCode)}/regions`);
}

export function fetchLocationDistricts(countryCode: string, regionCode: string) {
  return fetchLocationOptions(`/locations/countries/${encodeURIComponent(countryCode)}/regions/${encodeURIComponent(regionCode)}/districts`);
}

export function submitSupplierApplication(input: {
  farmName: string;
  contactName: string;
  email: string;
  phone: string;
  location: string;
  countryCode: string;
  countryName: string;
  regionCode: string;
  regionName: string;
  districtCode: string | null;
  districtName: string | null;
  products: string;
}) {
  return authenticatedRequest<{ id: string; status: string; created_at: string }>('/supplier-applications', {
    method: 'POST',
    body: {
      farmName: input.farmName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      location: input.location,
      country_code: input.countryCode,
      country_name: input.countryName,
      region_code: input.regionCode,
      region_name: input.regionName,
      district_code: input.districtCode,
      district_name: input.districtName,
      products: input.products,
    },
  });
}

export { supabase };
