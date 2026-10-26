import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { MotiView } from 'moti';
import ScreenHeader from '../components/ScreenHeader';
import { confirmPayment, fetchPaymentMethods, initializePayment, placeCashOrder, SavedPaymentMethod } from '../lib/api';
import { Place, useDeliveryActions, useDeliveryPlace } from '../lib/location';
import { STORE, deliveryTier, distanceKm } from '../lib/delivery';
import { useAccount } from '../store/AccountContext';
import { useStore } from '../store/StoreContext';
import { colors, formatTZS, radius, shadow } from '../theme';

WebBrowser.maybeCompleteAuthSession();

type PaymentSession = Awaited<ReturnType<typeof initializePayment>>;
type DeliveryWindow = 'morning' | 'afternoon';
type CheckoutPayment = 'online' | 'cash_on_delivery';

export default function CheckoutScreen({ navigation }: any) {
  const { lines, mode, subtotal, priceOf, clear, setLastOrderId } = useStore();
  const { profile, user, addresses, isSignedIn, selectAddress } = useAccount();
  const place = useDeliveryPlace();
  const { setPlace } = useDeliveryActions();
  const [name, setName] = useState(profile.fullName);
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(profile.phone);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(addresses.find((address) => address.isDefault)?.id ?? null);
  const [payment, setPayment] = useState<PaymentSession | null>(null);
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryWindow>('morning');
  const [checkoutPayment, setCheckoutPayment] = useState<CheckoutPayment>('online');
  const [cashRequestKey, setCashRequestKey] = useState('');
  const [pendingVerification, setPendingVerification] = useState<{ txRef: string; orderTrackingId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const km = distanceKm(STORE.lat, STORE.lng, place.lat, place.lng);
  const tier = deliveryTier(km);
  const estimate = subtotal + tier.fee;
  const basketKey = useMemo(
    () => JSON.stringify({ mode, lines: lines.map(({ product, qty }) => [product.id, qty]), lat: place.lat, lng: place.lng, name, email, phone, deliveryWindow, checkoutPayment }),
    [mode, lines, place.lat, place.lng, name, email, phone, deliveryWindow, checkoutPayment],
  );

  useEffect(() => {
    if (pendingVerification) return;
    setPayment(null);
    setCashRequestKey('');
  }, [basketKey, pendingVerification]);

  useEffect(() => {
    if (!name && profile.fullName) setName(profile.fullName);
    if (!email && user?.email) setEmail(user.email);
    if (!phone && profile.phone) setPhone(profile.phone);
  }, [profile.fullName, profile.phone, user?.email, name, email, phone]);

  useEffect(() => {
    if (!isSignedIn) {
      setSavedPaymentMethods([]);
      return;
    }
    let active = true;
    void fetchPaymentMethods().then((methods) => {
      if (!active) return;
      setSavedPaymentMethods(methods);
      const preferred = methods.find((method) => method.is_default) ?? methods[0];
      if (preferred) setPaymentPhone((current) => current || preferred.phone_e164);
    }).catch((error: unknown) => {
      console.error('Could not load saved payment methods:', error);
    });
    return () => {
      active = false;
    };
  }, [isSignedIn]);

  const chooseAddress = async (id: string) => {
    const saved = addresses.find((address) => address.id === id);
    if (!saved) return;
    try {
      await selectAddress(id);
      await setPlace({ lat: saved.lat, lng: saved.lng, label: saved.address, approximate: false });
      setSelectedAddressId(id);
    } catch (error) {
      Alert.alert('Could not select address', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const validate = () => {
    if (!lines.length) {
      Alert.alert('Your basket is empty', 'Add an item before starting checkout.');
      return false;
    }
    const unavailable = lines.find((line) => line.qty > line.product.stock);
    if (unavailable) {
      Alert.alert('Stock changed', `${unavailable.product.name} no longer has enough stock. Update your basket before checkout.`);
      return false;
    }
    if (!name.trim() || !email.trim() || !phone.trim()) {
      Alert.alert('Complete your contact details', 'Add your name, email and phone number for the delivery and payment receipt.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Check your email address', 'Enter a valid email address for the payment receipt.');
      return false;
    }
    if (phone.trim().length < 5) {
      Alert.alert('Check your phone number', 'Enter a phone number where the delivery team can reach you.');
      return false;
    }
    if (mode === 'wholesale') {
      const belowMinimum = lines.find((line) => line.qty < line.product.wholesale_min_qty);
      if (belowMinimum) {
        Alert.alert('Wholesale minimum', `${belowMinimum.product.name} needs at least ${belowMinimum.product.wholesale_min_qty} ${belowMinimum.product.unit}.`);
        return false;
      }
    }
    return true;
  };

  const completeOrder = async (txRef: string, orderTrackingId: string) => {
    setPendingVerification({ txRef, orderTrackingId });
    try {
      const result = await confirmPayment(txRef, orderTrackingId);
      const order = {
        id: result.order_id,
        mode,
        status: 'pending' as const,
        subtotal: payment?.subtotal ?? subtotal,
        delivery_fee: payment?.delivery_fee ?? tier.fee,
        created_at: new Date().toISOString(),
        delivery_window: deliveryWindow,
        payment_method: 'pesapal' as const,
        order_items: lines.map((line) => ({
          qty: line.qty,
          unit_price: payment?.items.find((item) => item.product_id === line.product.id)?.unit_price ?? priceOf(line.product),
          products: { name: line.product.name, unit: line.product.unit, image_url: line.product.image_url },
        })),
      };
      clear();
      setLastOrderId(result.order_id);
      setPayment(null);
      setPendingVerification(null);
      navigation.navigate('Tabs', { screen: 'Tracking', params: { orderId: result.order_id, order } });
    } catch (error) {
      Alert.alert(
        'Payment verification pending',
        `${error instanceof Error ? error.message : 'The payment could not be verified right now.'} Your basket is still here. Retry verification before starting another payment.`,
      );
    }
  };

  const startCheckout = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      if (checkoutPayment === 'cash_on_delivery') {
        const requestKey = cashRequestKey || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        if (!cashRequestKey) setCashRequestKey(requestKey);
        const result = await placeCashOrder({
          mode,
          delivery_window: deliveryWindow,
          request_key: requestKey,
          items: lines.map((line) => ({ product_id: line.product.id, qty: line.qty })),
          lat: place.lat,
          lng: place.lng,
          customer: { name: name.trim(), email: email.trim(), phone: phone.trim() },
        });
        const order = {
          id: result.order_id,
          mode,
          status: 'pending' as const,
          subtotal: result.subtotal,
          delivery_fee: result.delivery_fee,
          created_at: result.created_at,
          delivery_window: result.delivery_window,
          payment_method: 'cash_on_delivery' as const,
          order_items: lines.map((line) => ({
            qty: line.qty,
            unit_price: result.items.find((item) => item.product_id === line.product.id)?.unit_price ?? priceOf(line.product),
            products: { name: line.product.name, unit: line.product.unit, image_url: line.product.image_url },
          })),
        };
        clear();
        setLastOrderId(result.order_id);
        navigation.navigate('Tabs', { screen: 'Tracking', params: { orderId: result.order_id, order } });
        return;
      }

      if (!payment) {
        const initialized = await initializePayment({
          mode,
          delivery_window: deliveryWindow,
          items: lines.map((line) => ({ product_id: line.product.id, qty: line.qty })),
          lat: place.lat,
          lng: place.lng,
          customer: { name: name.trim(), email: email.trim(), phone: phone.trim() },
          payment_phone: paymentPhone.trim() || phone.trim(),
        });
        setPayment(initialized);
        return;
      }

      const callbackUrl = Linking.createURL('payment-callback');
      const result = await WebBrowser.openAuthSessionAsync(payment.payment_url, callbackUrl, { preferEphemeralSession: true });
      if (result.type !== 'success' || !result.url) return;
      const callback = Linking.parse(result.url);
      const query = callback.queryParams ?? {};
      const txRef = query.tx_ref;
      const orderTrackingId = query.order_tracking_id;
      if (typeof txRef !== 'string' || typeof orderTrackingId !== 'string') {
        Alert.alert('Payment not completed', 'No order was placed. You can try checkout again when you’re ready.');
        setPayment(null);
        return;
      }
      await completeOrder(txRef, orderTrackingId);
    } catch (error) {
      Alert.alert('Could not start checkout', error instanceof Error ? error.message : 'Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const retryVerification = async () => {
    if (!pendingVerification) return;
    setBusy(true);
    try {
      await completeOrder(pendingVerification.txRef, pendingVerification.orderTrackingId);
    } finally {
      setBusy(false);
    }
  };

  if (!lines.length) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScreenHeader title="Checkout" onBack={() => navigation.goBack()} />
        <View style={styles.empty}>
          <Ionicons name="basket-outline" size={74} color={colors.greenLight} />
          <Text style={styles.heading}>Your basket is empty</Text>
          <Text style={styles.subheading}>Add something fresh before checkout.</Text>
          <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}>
            <Text style={styles.primaryText}>Back to shop</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Checkout" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 230 }}>
          <Text style={styles.heading}>Delivery details</Text>
          <Text style={styles.subheading}>Who should we contact about this order?</Text>
          <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />
          <Field label="Email for payment receipt" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />

          <View style={styles.deliveryCard}>
            <View style={styles.deliveryTop}>
              <View style={styles.pin}><Ionicons name="location" size={20} color={colors.green} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Delivering to</Text>
                <Text style={styles.address}>{place.label}</Text>
                <Text style={styles.helper}>{km.toFixed(1)} km from our hub{place.approximate ? ' · approximate location' : ''}</Text>
              </View>
              <Pressable onPress={() => navigation.navigate('LocationPicker')} accessibilityLabel="Change delivery location">
                <Text style={styles.change}>Change</Text>
              </Pressable>
            </View>
            {addresses.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedAddresses}>
                {addresses.map((address) => (
                  <Pressable
                    key={address.id}
                    style={[styles.addressChip, selectedAddressId === address.id && styles.addressChipSelected]}
                    onPress={() => chooseAddress(address.id)}
                  >
                    <Text style={[styles.addressChipText, selectedAddressId === address.id && styles.addressChipTextSelected]}>{address.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          <Text style={styles.heading}>Choose a delivery window</Text>
          <Text style={styles.subheading}>Your order will arrive in the selected time slot.</Text>
          <View style={styles.choiceRow}>
            {([
              { value: 'morning', title: 'Morning', time: '07:00–10:00', icon: 'sunny-outline' },
              { value: 'afternoon', title: 'Afternoon', time: '15:00–18:00', icon: 'partly-sunny-outline' },
            ] as const).map((option) => (
              <Pressable
                key={option.value}
                style={[styles.choiceCard, deliveryWindow === option.value && styles.choiceSelected]}
                onPress={() => {
                  setDeliveryWindow(option.value);
                  setPayment(null);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: deliveryWindow === option.value }}
              >
                <Ionicons name={option.icon} size={20} color={deliveryWindow === option.value ? colors.green : colors.muted} />
                <Text style={styles.choiceTitle}>{option.title}</Text>
                <Text style={styles.choiceHint}>{option.time}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.heading}>Your order</Text>
          {lines.map((line) => {
            const unitPrice = payment?.items.find((item) => item.product_id === line.product.id)?.unit_price ?? priceOf(line.product);
            return (
              <View key={line.product.id} style={styles.orderLine}>
                <Text style={styles.orderName}>{line.qty} × {line.product.name}</Text>
                <Text style={styles.orderPrice}>{formatTZS(unitPrice * line.qty)}</Text>
              </View>
            );
          })}
          <View style={styles.totalCard}>
            <SummaryRow label="Items" value={formatTZS(payment?.subtotal ?? subtotal)} />
            <SummaryRow label={tier.label} value={payment ? (payment.delivery_fee === 0 ? 'FREE' : formatTZS(payment.delivery_fee)) : (tier.free ? 'FREE' : formatTZS(tier.fee))} />
            <View style={styles.divider} />
            <SummaryRow label="Estimated total" value={formatTZS(payment?.amount ?? estimate)} bold />
            {payment && <Text style={styles.confirmText}>Server-confirmed total · {payment.currency}</Text>}
          </View>

          <Text style={styles.heading}>Payment method</Text>
          <View style={styles.choiceRow}>
            <Pressable
              style={[styles.choiceCard, checkoutPayment === 'online' && styles.choiceSelected]}
              onPress={() => {
                setCheckoutPayment('online');
                setPayment(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: checkoutPayment === 'online' }}
            >
              <Ionicons name="phone-portrait-outline" size={21} color={checkoutPayment === 'online' ? colors.green : colors.muted} />
              <Text style={styles.choiceTitle}>Pay online</Text>
              <Text style={styles.choiceHint}>Mobile money or card</Text>
            </Pressable>
            <Pressable
              style={[styles.choiceCard, checkoutPayment === 'cash_on_delivery' && styles.choiceSelected]}
              onPress={() => {
                setCheckoutPayment('cash_on_delivery');
                setPayment(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: checkoutPayment === 'cash_on_delivery' }}
            >
              <Ionicons name="cash-outline" size={21} color={checkoutPayment === 'cash_on_delivery' ? colors.green : colors.muted} />
              <Text style={styles.choiceTitle}>Cash on delivery</Text>
              <Text style={styles.choiceHint}>Pay when it arrives</Text>
            </Pressable>
          </View>

          {checkoutPayment === 'online' && (
            <>
              {savedPaymentMethods.length > 0 && (
                <View style={styles.savedMethods}>
                  <Text style={styles.label}>Saved mobile money numbers</Text>
                  {savedPaymentMethods.map((method) => (
                    <Pressable
                      key={method.id}
                      style={[styles.savedMethod, paymentPhone === method.phone_e164 && styles.savedMethodSelected]}
                      onPress={() => setPaymentPhone(method.phone_e164)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: paymentPhone === method.phone_e164 }}
                    >
                      <Ionicons name="phone-portrait-outline" size={20} color={colors.green} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.choiceTitle}>{method.label}</Text>
                        <Text style={styles.choiceHint}>{method.phone_e164}</Text>
                      </View>
                      {paymentPhone === method.phone_e164 && <Ionicons name="checkmark-circle" size={21} color={colors.green} />}
                    </Pressable>
                  ))}
                </View>
              )}
              <Field
                label="Mobile money number for this payment"
                value={paymentPhone}
                onChangeText={setPaymentPhone}
                keyboardType="phone-pad"
                placeholder={phone || '+255 7XX XXX XXX'}
              />
            </>
          )}

          {checkoutPayment === 'online' && (
            <View style={styles.secureCard}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.green} />
              <Text style={styles.secureText}>Complete payment securely using the available mobile money or card options.</Text>
            </View>
          )}

          {pendingVerification ? (
            <Pressable style={styles.primaryButton} onPress={retryVerification} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Retry payment verification</Text>}
            </Pressable>
          ) : (
            <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={startCheckout} disabled={busy}>
              {busy
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.primaryText}>
                  {checkoutPayment === 'cash_on_delivery'
                    ? `Place order · ${formatTZS(estimate)}`
                    : payment ? `Continue to payment · ${formatTZS(payment.amount)}` : 'Review secure payment'}
                </Text>}
            </Pressable>
          )}
          <Text style={styles.disclaimer}>
            {checkoutPayment === 'cash_on_delivery'
              ? 'Your order, stock and total are confirmed before it is placed. Pay when your delivery arrives.'
              : payment
                ? 'Review the confirmed total above, then continue to the secure payment page.'
                : 'Your final total is checked against live prices and delivery distance before payment.'}
          </Text>
        </MotiView>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} style={styles.input} placeholderTextColor={colors.muted} />
    </View>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && styles.summaryBold]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.summaryBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40 },
  heading: { marginTop: 8, marginBottom: 5, color: colors.ink, fontSize: 22, fontWeight: '900' },
  subheading: { marginBottom: 16, color: colors.muted, fontSize: 14, lineHeight: 20 },
  field: { marginBottom: 13 },
  label: { marginBottom: 6, color: colors.ink, fontSize: 13, fontWeight: '800' },
  input: { minHeight: 51, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, color: colors.ink, fontSize: 15 },
  deliveryCard: { marginVertical: 10, padding: 15, borderRadius: radius.md, backgroundColor: colors.white, ...shadow },
  choiceRow: { flexDirection: 'row', gap: 10, marginBottom: 13 },
  choiceCard: { flex: 1, minHeight: 102, padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'flex-start', justifyContent: 'center', gap: 5 },
  choiceSelected: { borderColor: colors.green, backgroundColor: '#EFF7EC' },
  choiceTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  choiceHint: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  savedMethods: { marginBottom: 10, padding: 13, borderRadius: radius.md, backgroundColor: colors.white },
  savedMethod: { minHeight: 54, marginTop: 8, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', gap: 10 },
  savedMethodSelected: { borderColor: colors.green, backgroundColor: '#EFF7EC' },
  deliveryTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  pin: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EFF7EC', alignItems: 'center', justifyContent: 'center' },
  address: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  helper: { color: colors.muted, fontSize: 12, marginTop: 4 },
  change: { color: colors.green, fontSize: 14, fontWeight: '900', padding: 8 },
  savedAddresses: { gap: 8, paddingTop: 13 },
  addressChip: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream, paddingHorizontal: 13, paddingVertical: 8 },
  addressChipSelected: { backgroundColor: '#E8F5E9', borderColor: colors.green },
  addressChipText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  addressChipTextSelected: { color: colors.green },
  orderLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  orderName: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' },
  orderPrice: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  totalCard: { marginTop: 14, padding: 16, borderRadius: radius.md, backgroundColor: colors.white },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { color: colors.muted, fontSize: 14 },
  summaryValue: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  summaryBold: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  divider: { height: 1, marginVertical: 7, backgroundColor: colors.line },
  confirmText: { marginTop: 8, textAlign: 'right', color: colors.green, fontSize: 12, fontWeight: '800' },
  secureCard: { flexDirection: 'row', gap: 10, marginTop: 15, padding: 13, borderRadius: radius.md, backgroundColor: '#EFF7EC' },
  secureText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 56, marginTop: 18, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.65 },
  disclaimer: { marginTop: 9, textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 17 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25 },
});
