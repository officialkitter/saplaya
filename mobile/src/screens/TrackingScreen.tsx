import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { CustomerOrder, fetchOrderHistory, OrderItem } from '../lib/api';
import { getCustomerDataContext } from '../lib/customer-auth';
import RouteMap from '../components/RouteMap';
import StatusPipeline from '../components/StatusPipeline';
import { useAccount } from '../store/AccountContext';
import { formatTanzaniaDate, formatTanzaniaDateTime } from '../lib/date-time';
import { useStore } from '../store/StoreContext';
import { colors, formatTZS, OrderStatus, radius, statusColor, statusLabel } from '../theme';

const ONGOING_STATUSES = new Set<OrderStatus>(['pending', 'packing', 'en_route']);

function mergeOrders(remoteOrders: CustomerOrder[], previousOrders: CustomerOrder[]) {
  const remoteIds = new Set(remoteOrders.map((order) => order.id));
  return [...remoteOrders, ...previousOrders.filter((order) => !remoteIds.has(order.id))]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function TrackingScreen({ route }: any) {
  const { width } = useWindowDimensions();
  const { isSignedIn } = useAccount();
  const { lastOrderId } = useStore();
  const routeOrder: CustomerOrder | undefined = route?.params?.order;
  const routeOrderId: string | null = route?.params?.orderId ?? routeOrder?.id ?? lastOrderId;
  const [orders, setOrders] = useState<CustomerOrder[]>(routeOrder ? [routeOrder] : []);
  const [selectedId, setSelectedId] = useState<string | null>(routeOrderId);
  const [orderView, setOrderView] = useState<'ongoing' | 'history'>('ongoing');
  const [status, setStatus] = useState<OrderStatus>(routeOrder?.status ?? 'pending');
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!routeOrder) return;
    setOrders((previous) => mergeOrders([routeOrder], previous));
    setSelectedId(routeOrder.id);
    setStatus(routeOrder.status);
  }, [routeOrder]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!isSignedIn) {
      setOrders(routeOrder ? [routeOrder] : []);
      setSelectedId(routeOrder?.id ?? routeOrderId);
      setHistoryError(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    void (async () => {
      try {
        const remoteOrders = await fetchOrderHistory();
        if (!active) return;
        setOrders((previous) => mergeOrders(remoteOrders, previous));
        setHistoryError(null);
        setSelectedId((current) => (
          current && (remoteOrders.some((order) => order.id === current) || current === routeOrder?.id)
            ? current
            : remoteOrders.find((order) => ONGOING_STATUSES.has(order.status))?.id
              ?? remoteOrders[0]?.id
              ?? null
        ));
      } catch (error) {
        if (active) setHistoryError(error instanceof Error ? error.message : 'Could not load order history.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isSignedIn, routeOrder?.customer_email, routeOrder?.id, routeOrderId]));

  const ongoingOrders = orders.filter((order) => ONGOING_STATUSES.has(order.status));
  const historyOrders = orders.filter((order) => !ONGOING_STATUSES.has(order.status));
  const visibleOrders = orderView === 'ongoing' ? ongoingOrders : historyOrders;
  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;

  useEffect(() => {
    if (visibleOrders.some((order) => order.id === selectedId)) return;
    const nextOrder = visibleOrders[0];
    setSelectedId(nextOrder?.id ?? null);
    setStatus(nextOrder?.status ?? 'pending');
  }, [orderView, orders, selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    let active = true;
    let removeChannel: (() => Promise<unknown>) | undefined;
    void getCustomerDataContext().then(({ client }) => {
      if (!active) return;

      void client.from('orders').select('status').eq('id', selectedId).maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error('Could not load order status:', error.message);
            return;
          }
          if (active && data) {
            const nextStatus = data.status as OrderStatus;
            setStatus(nextStatus);
            setOrders((previous) => previous.map((order) => (
              order.id === selectedId ? { ...order, status: nextStatus } : order
            )));
          }
        }, (error: unknown) => {
          if (active) console.error('Could not load order status:', error);
        });

      const channel = client
        .channel(`order-${selectedId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${selectedId}` },
          (payload) => {
            const nextStatus = (payload.new as { status: OrderStatus }).status;
            setStatus(nextStatus);
            setOrders((previous) => previous.map((order) => (
              order.id === selectedId ? { ...order, status: nextStatus } : order
            )));
          },
        )
        .subscribe();
      removeChannel = () => client.removeChannel(channel);
    }).catch((error: unknown) => {
      if (active) console.error('Could not initialize order status tracking:', error);
    });

    return () => {
      active = false;
      if (removeChannel) void removeChannel();
    };
  }, [selectedId]);

  const selectOrder = (order: CustomerOrder) => {
    setSelectedId(order.id);
    setStatus(order.status);
  };

  const selectOrderView = (view: 'ongoing' | 'history') => {
    setOrderView(view);
    const nextOrder = view === 'ongoing' ? ongoingOrders[0] : historyOrders[0];
    setSelectedId(nextOrder?.id ?? null);
    setStatus(nextOrder?.status ?? 'pending');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Track order</Text>

        {selectedOrder ? (
          <>
            <Text style={styles.activeOrder}>Order #{selectedOrder.id.slice(0, 8)}</Text>
            <RouteMap status={status} />
            <MotiView
              key={`${selectedOrder.id}-${status}`}
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 220 }}
              style={[styles.pill, { backgroundColor: statusColor[status] }]}
            >
              <Text style={styles.pillText}>{statusLabel[status]}</Text>
            </MotiView>
            <View style={styles.pipelineCard}>
              <StatusPipeline status={status} />
            </View>
            {selectedOrder && !isSignedIn && (
              <View style={styles.detailsCard}>
                <Text style={styles.detailsTitle}>This delivery</Text>
                <Text style={styles.detailsDate}>
                  {selectedOrder.delivery_window === 'afternoon' ? 'Afternoon · 15:00–18:00' : 'Morning · 07:00–10:00'}
                </Text>
                <Text style={styles.emptyText}>
                  {selectedOrder.payment_method === 'cash_on_delivery'
                    ? 'Cash on delivery · pay when your order arrives'
                    : 'Payment completed securely'}
                </Text>
                {selectedOrder.order_items?.map((item, index) => (
                  <OrderLine key={`${selectedOrder.id}-guest-item-${index}`} item={item} />
                ))}
                <View style={[styles.amountRow, styles.grandTotal]}>
                  <Text style={styles.grandTotalLabel}>Order total</Text>
                  <Text style={styles.grandTotalValue}>
                    {formatTZS(Number(selectedOrder.subtotal) + Number(selectedOrder.delivery_fee))}
                  </Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.trackEmpty}>
            {loading
              ? <ActivityIndicator size="large" color={colors.green} />
              : <Ionicons name="receipt-outline" size={64} color={colors.greenLight} />}
            <Text style={styles.emptyTitle}>{loading ? 'Loading your orders…' : 'No active order'}</Text>
            {!loading && <Text style={styles.emptyText}>Your delivery progress will appear here after you place an order.</Text>}
          </View>
        )}

        {isSignedIn && (
          <>
            <View style={styles.sectionDivider} />
            <View style={styles.ordersHeading}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>My orders</Text>
                <Text style={styles.sectionSubtitle}>Switch between active deliveries and past orders.</Text>
              </View>
              {loading && <ActivityIndicator size="small" color={colors.green} />}
            </View>

            <OrderViewToggle
              value={orderView}
              ongoingCount={ongoingOrders.length}
              historyCount={historyOrders.length}
              onChange={selectOrderView}
            />

            {historyError && <Text style={styles.error}>{historyError}</Text>}
            {visibleOrders.length === 0 ? (
              <View style={styles.ordersEmpty}>
                <Ionicons name={orderView === 'ongoing' ? 'bicycle-outline' : 'time-outline'} size={40} color={colors.greenLight} />
                <Text style={styles.emptyTitle}>
                  {orderView === 'ongoing' ? 'No ongoing orders' : 'Your order history is empty'}
                </Text>
                <Text style={styles.emptyText}>
                  {orderView === 'ongoing'
                    ? 'New deliveries will appear here while they are being prepared or brought to you.'
                    : 'Completed and cancelled orders will be saved here for you to revisit.'}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.swipeHint}>
                  Swipe sideways to browse {visibleOrders.length === 1 ? 'your order' : `${visibleOrders.length} orders`}
                </Text>
                <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orderCarousel}>
                  {visibleOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      selected={order.id === selectedId}
                      width={Math.min(width - 72, 330)}
                      onPress={() => selectOrder(order)}
                    />
                  ))}
                </ScrollView>
                {selectedOrder && (
                  <MotiView
                    key={`details-${selectedOrder.id}`}
                    from={{ opacity: 0, translateY: 10 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: 'timing', duration: 220 }}
                    style={styles.detailsCard}
                  >
                    <View style={styles.detailsHeading}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailsTitle}>Order details</Text>
                        <Text style={styles.detailsDate}>{formatTanzaniaDateTime(selectedOrder.created_at)}</Text>
                      </View>
                      <View style={styles.modeBadge}>
                        <Text style={styles.modeText}>{selectedOrder.mode}</Text>
                      </View>
                    </View>
                    {selectedOrder.order_items?.length ? (
                      selectedOrder.order_items.map((item, index) => (
                        <OrderLine key={`${selectedOrder.id}-item-${index}`} item={item} />
                      ))
                    ) : (
                      <Text style={styles.emptyText}>Item details are not available for this order.</Text>
                    )}
                    <View style={styles.amountRow}>
                      <Text style={styles.amountLabel}>Items subtotal</Text>
                      <Text style={styles.amountValue}>{formatTZS(Number(selectedOrder.subtotal))}</Text>
                    </View>
                    <View style={styles.amountRow}>
                      <Text style={styles.amountLabel}>Delivery</Text>
                      <Text style={styles.amountValue}>{Number(selectedOrder.delivery_fee) === 0 ? 'FREE' : formatTZS(Number(selectedOrder.delivery_fee))}</Text>
                    </View>
                    <View style={[styles.amountRow, styles.grandTotal]}>
                      <Text style={styles.grandTotalLabel}>Order total</Text>
                      <Text style={styles.grandTotalValue}>
                        {formatTZS(Number(selectedOrder.subtotal) + Number(selectedOrder.delivery_fee))}
                      </Text>
                    </View>
                  </MotiView>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OrderCard({
  order,
  selected,
  width,
  onPress,
}: Readonly<{
  order: CustomerOrder;
  selected: boolean;
  width: number;
  onPress: () => void;
}>) {
  const previewImage = order.order_items?.find((item) => item.products?.image_url)?.products?.image_url;
  const status = order.status;

  return (
    <Pressable
      style={[styles.orderCard, { width }, selected && styles.orderCardSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.id.slice(0, 8)}, ${statusLabel[status]}, ${order.order_items?.length ?? 0} items`}
      accessibilityState={{ selected }}
    >
      <View style={styles.preview}>
        {previewImage
          ? <Image source={{ uri: previewImage }} style={styles.previewImage} resizeMode="cover" />
          : <View style={styles.previewFallback}><Ionicons name="basket-outline" size={34} color={colors.green} /></View>}
        <View style={[styles.statusBadge, { backgroundColor: statusColor[status] }]}>
          <Text style={styles.statusBadgeText}>{statusLabel[status]}</Text>
        </View>
      </View>
      <View style={styles.orderCardBody}>
        <View style={styles.orderCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderCardTitle}>Order #{order.id.slice(0, 8)}</Text>
            <Text style={styles.orderCardDate}>{formatTanzaniaDate(order.created_at)}</Text>
          </View>
          <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward-circle-outline'} size={24} color={colors.green} />
        </View>
        <Text style={styles.orderCardMeta}>{order.order_items?.length ?? 0} items · {order.mode}</Text>
        <Text style={styles.orderCardTotal}>{formatTZS(Number(order.subtotal) + Number(order.delivery_fee))}</Text>
      </View>
    </Pressable>
  );
}

function OrderViewToggle({
  value,
  ongoingCount,
  historyCount,
  onChange,
}: Readonly<{
  value: 'ongoing' | 'history';
  ongoingCount: number;
  historyCount: number;
  onChange: (view: 'ongoing' | 'history') => void;
}>) {
  const [width, setWidth] = useState(0);
  const segmentWidth = width / 2;

  return (
    <View
      style={styles.orderViewToggle}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      <MotiView
        style={[styles.orderViewThumb, { width: Math.max(0, segmentWidth - 6) }]}
        animate={{ translateX: value === 'history' ? segmentWidth : 0 }}
        transition={{ type: 'spring', damping: 14, stiffness: 160 }}
      />
      <Pressable
        style={styles.orderViewOption}
        onPress={() => onChange('ongoing')}
        accessibilityRole="tab"
        accessibilityState={{ selected: value === 'ongoing' }}
      >
        <Text style={[styles.orderViewText, value === 'ongoing' && styles.orderViewTextSelected]}>
          Ongoing
        </Text>
        <Text style={[styles.orderViewCount, value === 'ongoing' && styles.orderViewCountSelected]}>
          {ongoingCount}
        </Text>
      </Pressable>
      <Pressable
        style={styles.orderViewOption}
        onPress={() => onChange('history')}
        accessibilityRole="tab"
        accessibilityState={{ selected: value === 'history' }}
      >
        <Text style={[styles.orderViewText, value === 'history' && styles.orderViewTextSelected]}>
          Order history
        </Text>
        <Text style={[styles.orderViewCount, value === 'history' && styles.orderViewCountSelected]}>
          {historyCount}
        </Text>
      </Pressable>
    </View>
  );
}

function OrderLine({ item }: Readonly<{ item: OrderItem }>) {
  return (
    <View style={styles.itemRow}>
      {item.products?.image_url
        ? <Image source={{ uri: item.products.image_url }} style={styles.itemImage} resizeMode="cover" />
        : <View style={[styles.itemImage, styles.itemImageFallback]}><Ionicons name="basket-outline" size={20} color={colors.green} /></View>}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.products?.name ?? 'Fresh item'}</Text>
        <Text style={styles.itemMeta}>
          {item.qty} × {item.products?.unit ?? 'item'} at {formatTZS(Number(item.unit_price))}
        </Text>
      </View>
      <Text style={styles.itemTotal}>{formatTZS(Number(item.unit_price) * Number(item.qty))}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingTop: 8, paddingBottom: 36 },
  h1: { color: colors.green, fontSize: 30, fontWeight: '900', marginHorizontal: 20, marginVertical: 12 },
  activeOrder: { color: colors.muted, fontSize: 13, fontWeight: '800', marginHorizontal: 22, marginBottom: 8 },
  pill: { alignSelf: 'center', marginTop: 16, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 10 },
  pillText: { color: colors.white, fontSize: 18, fontWeight: '900' },
  pipelineCard: { marginHorizontal: 20, marginTop: 20, paddingVertical: 24, backgroundColor: colors.white, borderRadius: radius.lg },
  trackEmpty: { minHeight: 250, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 5 },
  sectionDivider: { height: 1, backgroundColor: colors.line, marginHorizontal: 20, marginTop: 24, marginBottom: 22 },
  ordersHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20 },
  sectionTitle: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  sectionSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  orderViewToggle: {
    height: 54,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
  },
  orderViewThumb: {
    position: 'absolute',
    left: 3,
    top: 3,
    height: 44,
    borderRadius: radius.xl - 4,
    backgroundColor: colors.green,
  },
  orderViewOption: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  orderViewText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  orderViewTextSelected: { color: colors.white },
  orderViewCount: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  orderViewCountSelected: { color: colors.white },
  error: { color: '#C62828', fontSize: 13, marginHorizontal: 20, marginTop: 12 },
  ordersEmpty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  swipeHint: { color: colors.muted, fontSize: 12, marginHorizontal: 20, marginTop: 16, marginBottom: 9 },
  orderCarousel: { gap: 12, paddingHorizontal: 20, paddingBottom: 3 },
  orderCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.white },
  orderCardSelected: { borderColor: colors.green, borderWidth: 2 },
  preview: { height: 148, backgroundColor: '#EFF7EC' },
  previewImage: { width: '100%', height: '100%' },
  previewFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20 },
  statusBadgeText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  orderCardBody: { padding: 13 },
  orderCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderCardTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  orderCardDate: { color: colors.muted, fontSize: 12, marginTop: 3 },
  orderCardMeta: { color: colors.muted, fontSize: 12, textTransform: 'capitalize', marginTop: 10 },
  orderCardTotal: { color: colors.green, fontSize: 19, fontWeight: '900', marginTop: 4 },
  detailsCard: { marginHorizontal: 20, marginTop: 18, padding: 16, borderRadius: radius.lg, backgroundColor: colors.white },
  detailsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  detailsTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  detailsDate: { color: colors.muted, fontSize: 12, marginTop: 4 },
  modeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#EFF7EC' },
  modeText: { color: colors.green, fontSize: 11, fontWeight: '900', textTransform: 'capitalize' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.line },
  itemImage: { width: 58, height: 58, borderRadius: radius.sm, backgroundColor: colors.line },
  itemImageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF7EC' },
  itemInfo: { flex: 1 },
  itemName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  itemMeta: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  itemTotal: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  amountLabel: { color: colors.muted, fontSize: 13 },
  amountValue: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  grandTotal: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 5, paddingTop: 12 },
  grandTotalLabel: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  grandTotalValue: { color: colors.green, fontSize: 17, fontWeight: '900' },
});
