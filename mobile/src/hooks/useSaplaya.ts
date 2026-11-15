// ============================================
// SAPLAYA MOBILE APP - REACT HOOKS
// ============================================
// Location: mobile/src/hooks/useSaplaya.ts
// Custom hooks for easy API integration in React components

import { useState, useCallback } from 'react';
import { getApiClient, type Agent, type Order, type Commission, type Withdrawal, type Notification } from '../services/saplaya-api';

// ============================================
// AGENT HOOKS
// ============================================

export function useAgentProfile() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getAgentProfile();
      if (response.success && response.data) {
        setAgent(response.data);
      } else {
        setError(response.error || 'Failed to fetch profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (data: Partial<Agent>) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.updateAgentProfile(data);
      if (response.success && response.data) {
        setAgent(response.data);
        return response.data;
      } else {
        setError(response.error || 'Failed to update profile');
        throw new Error(response.error || 'Failed to update profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateLocation = useCallback(async (latitude: number, longitude: number) => {
    try {
      const api = getApiClient();
      const response = await api.updateAgentLocation(latitude, longitude);
      if (response.success && response.data) {
        setAgent(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to update location');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      console.error('Location update error:', errorMsg);
      throw err;
    }
  }, []);

  const updateStatus = useCallback(async (status: 'online' | 'offline') => {
    try {
      const api = getApiClient();
      const response = await api.updateAgentStatus(status);
      if (response.success && response.data) {
        setAgent(response.data);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to update status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  }, []);

  return { agent, loading, error, fetchProfile, updateProfile, updateLocation, updateStatus };
}

// ============================================
// ORDER HOOKS (CUSTOMER)
// ============================================

export function useCustomerOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getCustomerOrders();
      if (response.success && response.data) {
        setOrders(response.data);
      } else {
        setError(response.error || 'Failed to fetch orders');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const placeOrder = useCallback(async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.placeOrder(data);
      if (response.success && response.data) {
        setOrders([...orders, response.data]);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to place order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [orders]);

  const placeOrderForOthers = useCallback(async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.placeOrderForOthers(data);
      if (response.success && response.data) {
        setOrders([...orders, response.data]);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to place order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [orders]);

  const cancelOrder = useCallback(async (orderId: string) => {
    try {
      const api = getApiClient();
      const response = await api.cancelOrder(orderId);
      if (response.success && response.data) {
        setOrders(orders.map(o => o.id === orderId ? response.data : o));
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to cancel order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  }, [orders]);

  return { orders, loading, error, fetchOrders, placeOrder, placeOrderForOthers, cancelOrder };
}

// ============================================
// ORDER HOOKS (AGENT - CLAIMING)
// ============================================

export function useAvailableOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNearbyOrders = useCallback(async (latitude: number, longitude: number, radiusKm: number = 5) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getNearbyOrders(latitude, longitude, radiusKm);
      if (response.success && response.data) {
        setOrders(response.data);
      } else {
        setError(response.error || 'Failed to fetch nearby orders');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const claimOrder = useCallback(async (orderId: string) => {
    try {
      const api = getApiClient();
      const response = await api.claimOrder(orderId);
      if (response.success && response.data) {
        setOrders(orders.filter(o => o.id !== orderId)); // Remove from available
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to claim order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  }, [orders]);

  return { orders, loading, error, fetchNearbyOrders, claimOrder };
}

export function useClaimedOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClaimedOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getClaimedOrders();
      if (response.success && response.data) {
        setOrders(response.data);
      } else {
        setError(response.error || 'Failed to fetch claimed orders');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStatus = useCallback(async (orderId: string, status: 'picked_up' | 'delivered', proofImageUri?: string) => {
    try {
      const api = getApiClient();
      const response = await api.updateOrderStatus(orderId, status, proofImageUri);
      if (response.success && response.data) {
        setOrders(orders.map(o => o.id === orderId ? response.data : o));
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to update order status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  }, [orders]);

  return { orders, loading, error, fetchClaimedOrders, updateStatus };
}

// ============================================
// COMMISSION & EARNINGS HOOKS
// ============================================

export function useCommissions() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getPendingCommissions();
      if (response.success && response.data) {
        setCommissions(response.data);
      } else {
        setError(response.error || 'Failed to fetch commissions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getCommissionHistory();
      if (response.success && response.data) {
        setCommissions(response.data);
      } else {
        setError(response.error || 'Failed to fetch history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getEarningsSummary();
      if (response.success && response.data) {
        setSummary(response.data);
      } else {
        setError(response.error || 'Failed to fetch summary');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  return { commissions, summary, loading, error, fetchPending, fetchHistory, fetchSummary };
}

// ============================================
// WITHDRAWAL HOOKS
// ============================================

export function useWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getWithdrawalHistory();
      if (response.success && response.data) {
        setWithdrawals(response.data);
      } else {
        setError(response.error || 'Failed to fetch withdrawals');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const requestWithdrawal = useCallback(async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.requestWithdrawal(data);
      if (response.success && response.data) {
        setWithdrawals([...withdrawals, response.data]);
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to request withdrawal');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [withdrawals]);

  return { withdrawals, loading, error, fetchHistory, requestWithdrawal };
}

// ============================================
// NOTIFICATION HOOKS
// ============================================

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (limit: number = 20) => {
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const response = await api.getNotifications(limit);
      if (response.success && response.data) {
        setNotifications(response.data);
      } else {
        setError(response.error || 'Failed to fetch notifications');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const api = getApiClient();
      const response = await api.markNotificationAsRead(notificationId);
      if (response.success && response.data) {
        setNotifications(notifications.map(n => n.id === notificationId ? response.data : n));
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to mark as read');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  }, [notifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      const api = getApiClient();
      const response = await api.markAllNotificationsAsRead();
      if (response.success) {
        setNotifications(notifications.map(n => ({ ...n, is_read: true })));
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to mark all as read');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  }, [notifications]);

  return { notifications, loading, error, fetchNotifications, markAsRead, markAllAsRead };
}
