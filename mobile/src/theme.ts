export const colors = {
  green: '#2E7D32',
  greenLight: '#4CAF50',
  yellow: '#FFD54F',
  yellowDeep: '#FFB300',
  white: '#FFFFFF',
  cream: '#F9FBF7',
  ink: '#1B2A1C',
  muted: '#6B7A6C',
  line: '#E3EBE0',
  wood: '#B07A3E',
  woodDark: '#8A5A26',
  bulk: '#009688',
  bulkLight: '#E0F2F1',
};

export type OrderStatus = 'pending' | 'packing' | 'en_route' | 'delivered' | 'cancelled';

export const statusColor: Record<OrderStatus, string> = {
  pending: '#FFB300', // 🟡
  packing: '#0288D1', // 🔵
  en_route: '#7B1FA2', // 🟣
  delivered: '#2E7D32', // 🟢
  cancelled: '#D32F2F', // 🔴
};

export const statusLabel: Record<OrderStatus, string> = {
  pending: 'Order received',
  packing: 'Packing your fresh items',
  en_route: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const radius = { sm: 10, md: 16, lg: 24, xl: 32 };

export const shadow = {
  shadowColor: '#1B5E20',
  shadowOpacity: 0.12,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 5,
};

export const formatTZS = (n: number) => 'TSh ' + Math.round(n).toLocaleString('en-US');
