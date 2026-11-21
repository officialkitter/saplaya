// ============================================
// SAPLAYA MOBILE APP - API CLIENT SDK
// ============================================
// Location: mobile/src/services/saplaya-api.ts
// This is a complete integration layer for the mobile app

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import { safeHttpErrorMessage, UserFacingError } from '../lib/user-facing-error';
import { API_URL } from '../lib/supabase';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface Agent {
  id: string;
  user_id: string;
  phone_number: string;
  vehicle_type: 'bike' | 'motorcycle' | 'car' | 'van';
  vehicle_plate?: string;
  current_latitude?: number;
  current_longitude?: number;
  is_active: boolean;
  is_verified: boolean;
  total_deliveries: number;
  total_earnings: number;
  average_rating: number;
  status: 'online' | 'offline' | 'on_delivery';
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  agent_id?: string;
  status: 'pending' | 'accepted' | 'picked_up' | 'delivered' | 'cancelled';
  pickup_address: string;
  pickup_latitude: number;
  pickup_longitude: number;
  delivery_address: string;
  delivery_latitude: number;
  delivery_longitude: number;
  estimated_distance_km?: number;
  estimated_delivery_time_minutes?: number;
  order_subtotal: number;
  delivery_fee?: number;
  total_amount: number;
  payment_method: 'card' | 'mpesa' | 'wallet';
  payment_status: 'pending' | 'completed' | 'failed';
  special_instructions?: string;
  pickup_proof_image_url?: string;
  delivery_proof_image_url?: string;
  claimed_at?: string;
  picked_up_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderRecipient {
  id: string;
  order_id: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_email?: string;
  is_recipient_notified: boolean;
}

export interface Commission {
  id: string;
  agent_id: string;
  order_id: string;
  amount: number;
  percentage: number;
  status: 'pending' | 'approved' | 'withdrawn';
  created_at: string;
}

export interface Withdrawal {
  id: string;
  agent_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  payment_method: 'mpesa' | 'bank' | 'wallet';
  reference_number?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  order_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================
// API CLIENT CLASS
// ============================================

export class SaplayaApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseURL: string = API_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth token
    this.client.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );
  }

  // ============================================
  // AUTH METHODS
  // ============================================

  async setToken(token: string): Promise<void> {
    this.token = token;
    await SecureStore.setItemAsync('auth_token', token);
  }

  async getToken(): Promise<string | null> {
    if (this.token) return this.token;
    return await SecureStore.getItemAsync('auth_token');
  }

  async clearToken(): Promise<void> {
    this.token = null;
    await SecureStore.deleteItemAsync('auth_token');
  }

  // ============================================
  // AGENT ENDPOINTS
  // ============================================

  async registerAgent(data: {
    phone_number: string;
    vehicle_type: 'bike' | 'motorcycle' | 'car' | 'van';
    vehicle_plate?: string;
  }): Promise<ApiResponse<Agent>> {
    const response = await this.client.post<ApiResponse<Agent>>('/agents/register', data);
    return response.data;
  }

  async getAgentProfile(): Promise<ApiResponse<Agent>> {
    const response = await this.client.get<ApiResponse<Agent>>('/agents/profile');
    return response.data;
  }

  async updateAgentProfile(data: Partial<Agent>): Promise<ApiResponse<Agent>> {
    const response = await this.client.put<ApiResponse<Agent>>('/agents/profile', data);
    return response.data;
  }

  async updateAgentLocation(latitude: number, longitude: number): Promise<ApiResponse<Agent>> {
    const response = await this.client.post<ApiResponse<Agent>>('/agents/update-location', {
      latitude,
      longitude,
    });
    return response.data;
  }

  async updateAgentStatus(status: 'online' | 'offline'): Promise<ApiResponse<Agent>> {
    const response = await this.client.post<ApiResponse<Agent>>('/agents/update-status', { status });
    return response.data;
  }

  async getAgentStats(): Promise<ApiResponse<any>> {
    const response = await this.client.get<ApiResponse<any>>('/agents/stats');
    return response.data;
  }

  // ============================================
  // ORDER ENDPOINTS (CUSTOMER)
  // ============================================

  async placeOrder(data: {
    pickup_address: string;
    pickup_latitude: number;
    pickup_longitude: number;
    delivery_address: string;
    delivery_latitude: number;
    delivery_longitude: number;
    order_subtotal: number;
    payment_method: 'card' | 'mpesa' | 'wallet';
    special_instructions?: string;
  }): Promise<ApiResponse<Order>> {
    const response = await this.client.post<ApiResponse<Order>>('/orders/place', data);
    return response.data;
  }

  async placeOrderForOthers(data: {
    pickup_address: string;
    pickup_latitude: number;
    pickup_longitude: number;
    delivery_address: string;
    delivery_latitude: number;
    delivery_longitude: number;
    recipient_name: string;
    recipient_phone: string;
    recipient_email?: string;
    order_subtotal: number;
    payment_method: 'card' | 'mpesa' | 'wallet';
    special_instructions?: string;
  }): Promise<ApiResponse<Order>> {
    const response = await this.client.post<ApiResponse<Order>>('/orders/place-for-others', data);
    return response.data;
  }

  async getCustomerOrders(): Promise<ApiResponse<Order[]>> {
    const response = await this.client.get<ApiResponse<Order[]>>('/orders/my-orders');
    return response.data;
  }

  async getOrderDetails(orderId: string): Promise<ApiResponse<Order>> {
    const response = await this.client.get<ApiResponse<Order>>(`/orders/${orderId}`);
    return response.data;
  }

  async cancelOrder(orderId: string): Promise<ApiResponse<Order>> {
    const response = await this.client.post<ApiResponse<Order>>(`/orders/${orderId}/cancel`);
    return response.data;
  }

  // ============================================
  // ORDER ENDPOINTS (AGENT - CLAIM & DELIVER)
  // ============================================

  async getNearbyOrders(latitude: number, longitude: number, radiusKm: number = 5): Promise<ApiResponse<Order[]>> {
    const response = await this.client.get<ApiResponse<Order[]>>('/orders/available-nearby', {
      params: { latitude, longitude, radiusKm },
    });
    return response.data;
  }

  async claimOrder(orderId: string): Promise<ApiResponse<Order>> {
    const response = await this.client.post<ApiResponse<Order>>('/orders/claim', { order_id: orderId });
    return response.data;
  }

  async getClaimedOrders(): Promise<ApiResponse<Order[]>> {
    const response = await this.client.get<ApiResponse<Order[]>>('/orders/my-claimed-orders');
    return response.data;
  }

  async updateOrderStatus(orderId: string, status: 'picked_up' | 'delivered', proofImageUri?: string): Promise<ApiResponse<Order>> {
    const formData = new FormData();
    formData.append('order_id', orderId);
    formData.append('status', status);

    if (proofImageUri) {
      const filename = proofImageUri.split('/').pop() || 'proof.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('proof_image', {
        uri: proofImageUri,
        name: filename,
        type,
      } as any);
    }

    const response = await this.client.post<ApiResponse<Order>>('/orders/update-status', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  // ============================================
  // COMMISSION & EARNINGS ENDPOINTS
  // ============================================

  async getPendingCommissions(): Promise<ApiResponse<Commission[]>> {
    const response = await this.client.get<ApiResponse<Commission[]>>('/commissions/pending');
    return response.data;
  }

  async getCommissionHistory(): Promise<ApiResponse<Commission[]>> {
    const response = await this.client.get<ApiResponse<Commission[]>>('/commissions/history');
    return response.data;
  }

  async getEarningsSummary(): Promise<ApiResponse<any>> {
    const response = await this.client.get<ApiResponse<any>>('/commissions/summary');
    return response.data;
  }

  // ============================================
  // WITHDRAWAL ENDPOINTS
  // ============================================

  async requestWithdrawal(data: {
    amount: number;
    payment_method: 'mpesa' | 'bank' | 'wallet';
    mpesa_phone?: string;
    bank_account?: string;
    bank_name?: string;
  }): Promise<ApiResponse<Withdrawal>> {
    const response = await this.client.post<ApiResponse<Withdrawal>>('/withdrawals/request', data);
    return response.data;
  }

  async getWithdrawalHistory(): Promise<ApiResponse<Withdrawal[]>> {
    const response = await this.client.get<ApiResponse<Withdrawal[]>>('/withdrawals/history');
    return response.data;
  }

  async getWithdrawalStatus(withdrawalId: string): Promise<ApiResponse<Withdrawal>> {
    const response = await this.client.get<ApiResponse<Withdrawal>>(`/withdrawals/${withdrawalId}`);
    return response.data;
  }

  // ============================================
  // NOTIFICATION ENDPOINTS
  // ============================================

  async getNotifications(limit: number = 20): Promise<ApiResponse<Notification[]>> {
    const response = await this.client.get<ApiResponse<Notification[]>>('/notifications', {
      params: { limit },
    });
    return response.data;
  }

  async markNotificationAsRead(notificationId: string): Promise<ApiResponse<Notification>> {
    const response = await this.client.put<ApiResponse<Notification>>(`/notifications/${notificationId}/read`);
    return response.data;
  }

  async markAllNotificationsAsRead(): Promise<ApiResponse<any>> {
    const response = await this.client.put<ApiResponse<any>>('/notifications/read-all');
    return response.data;
  }

  // ============================================
  // RATINGS & REVIEWS
  // ============================================

  async rateOrder(orderId: string, rating: number, review?: string): Promise<ApiResponse<any>> {
    const response = await this.client.post<ApiResponse<any>>(`/orders/${orderId}/rate`, {
      rating,
      review,
    });
    return response.data;
  }

  // ============================================
  // ERROR HANDLING
  // ============================================

  private handleError(error: AxiosError<unknown>): Promise<never> {
    const status = error.response?.status;
    console.error('Saplaya API request failed.', { status, name: error.name });
    return Promise.reject(new UserFacingError(typeof status === 'number'
      ? safeHttpErrorMessage(status)
      : 'We could not reach Saplaya. Check your connection and try again.'));
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let apiClient: SaplayaApiClient | null = null;

export function initApiClient(baseURL?: string): SaplayaApiClient {
  if (!apiClient) {
    apiClient = new SaplayaApiClient(baseURL);
  }
  return apiClient;
}

export function getApiClient(): SaplayaApiClient {
  if (!apiClient) {
    apiClient = new SaplayaApiClient();
  }
  return apiClient;
}
