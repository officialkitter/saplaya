import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { View as MotiView } from 'moti/build/components/view';
import ScreenHeader from '../components/ScreenHeader';
import { CheckoutQuote, confirmPayment, DeliveryEta, DeliveryOption, fetchCheckoutQuote, fetchDeliveryOptions, fetchPaymentMethods, initializePayment, placeCashOrder, SavedPaymentMethod } from '../lib/api';
import { useDeliveryActions, useDeliveryPlace } from '../lib/location';
import { useAccount } from '../store/AccountContext';
import { useStore } from '../store/StoreContext';
import { colors, radius, shadow } from '../theme';
import { useCurrency } from '../lib/currency';

WebBrowser.maybeCompleteAuthSession();

type PaymentSession = Awaited<ReturnType<typeof initializePayment>>;
type CheckoutPayment = 'online' | 'cash_on_delivery';

export default function CheckoutScreen({ navigation }: any) {
  const { lines, mode, subtotal, priceOf, clear, setLastOrderId } = useStore();
  const { currency, formatPrice, ratesUpdatedAt, ratesUnavailable } = useCurrency();
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
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryEta>('24h');
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteRefreshVersion, setQuoteRefreshVersion] = useState(0);
  const [acceptedDeliveryFee, setAcceptedDeliveryFee] = useState(false);
  const [checkoutPayment, setCheckoutPayment] = useState<CheckoutPayment>('online');
  const [cashRequestKey, setCashRequestKey] = useState('');
  const [pendingVerification, setPendingVerification] = useState<{ txRef: string; orderTrackingId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const km = quote?.distance_km;
  const speedFee = quote?.speed_fee;
  const estimate = quote?.amount ?? 0;
  const unpricedLines = lines.filter((line) => priceOf(line.product, line.qty) === null);
  const paidDelivery = (quote?.delivery_fee ?? 0) > 0;
  const quoteKey = useMemo(
    () => JSON.stringify({
      mode,
      lines: lines.map(({ product, qty }) => [product.id, qty]),
      lat: place.lat,
      lng: place.lng,
      approximate: place.approximate,
      deliveryWindow,
    }),
    [mode, lines, place.lat, place.lng, place.approximate, deliveryWindow],
  );
  const basketKey = useMemo(
    () => JSON.stringify({ mode, lines: lines.map(({ product, qty }) => [product.id, qty]), lat: place.lat, lng: place.lng, approximate: place.approximate, name, email, phone, deliveryWindow, checkoutPayment }),
    [mode, lines, place.lat, place.lng, place.approximate, name, email, phone, deliveryWindow, checkoutPayment],
  );

  useEffect(() => {
    if (pendingVerification) return;
    setPayment(null);
    setCashRequestKey('');
  }, [basketKey, pendingVerification]);

  useEffect(() => {
    let active = true;
    setQuote(null);
    setQuoteError('');
    setAcceptedDeliveryFee(false);
    if (place.approximate) {
      setQuoteError('Choose a saved address or enable precise GPS before checkout.');
      setQuoteLoading(false);
      return () => {
        active = false;
      };
    }
    if (!lines.length || !deliveryOptions.some((option) => option.value === deliveryWindow)) {
      setQuoteLoading(false);
      return () => {
        active = false;
      };
    }
    setQuoteLoading(true);
    void fetchCheckoutQuote({
      mode,
      delivery_window: deliveryWindow,
      items: lines.map((line) => ({ product_id: line.product.id, qty: line.qty })),
      lat: place.lat,
      lng: place.lng,
    }).then((result) => {
      if (active) setQuote(result);
    }).catch((error: unknown) => {
      if (active) setQuoteError(error instanceof Error ? error.message : 'Could not prepare your delivery quote.');
    }).finally(() => {
      if (active) setQuoteLoading(false);
    });
    return () => {
      active = false;
    };
  }, [quoteKey, quoteRefreshVersion, deliveryOptions, lines, mode, deliveryWindow, place.lat, place.lng, place.approximate]);

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

  useEffect(() => {
    let active = true;
    void fetchDeliveryOptions().then((options) => {
      if (!active) return;
      setDeliveryOptions(options);
      if (options.length && !options.some((option) => option.value === deliveryWindow)) {
        setDeliveryWindow(options[0].value);
      }
    }).catch((error: unknown) => {
      console.error('Could not load delivery options:', error);
    });
    return () => {
      active = false;
    };
  }, []);

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
    if (place.approximate) {
      Alert.alert('Precise delivery location required', 'Choose a saved address or enable GPS before checkout so we can locate the closest stocked farms.');
      return false;
    }
    if (!deliveryOptions.length || speedFee === undefined) {
      Alert.alert('Delivery options unavailable', 'No delivery times have a configured price yet. Please try again later.');
      return false;
    }
    if (!quote || quoteLoading) {
      Alert.alert('Delivery quote unavailable', quoteError || 'Wait for the latest farm stock and delivery price to load, then try again.');
      return false;
    }
    if (paidDelivery && !acceptedDeliveryFee) {
      Alert.alert('Confirm delivery charge', 'Accept the server-quoted delivery charge to continue, or change the delivery address.');
      return false;
    }
    if (unpricedLines.length) {
      Alert.alert('Volume price unavailable', 'A bulk or mega-bulk price is not configured for every item. Reduce the quantities or contact Saplaya.');
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
        subtotal: payment?.subtotal ?? quote?.subtotal ?? subtotal,
        delivery_fee: payment?.delivery_fee ?? quote?.delivery_fee ?? 0,
        created_at: new Date().toISOString(),
        delivery_window: deliveryWindow,
        payment_method: 'pesapal' as const,
        order_items: lines.map((line) => ({
          qty: line.qty,
          unit_price: payment?.items.find((item) =>
            item.product_id === quote?.items.find((quoted) => quoted.requested_product_id === line.product.id)?.product_id,
          )?.unit_price ?? quote?.items.find((item) => item.requested_product_id === line.product.id)?.unit_price ?? priceOf(line.product, line.qty) ?? 0,
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
          delivery_fee_accepted: acceptedDeliveryFee,
          quoted_delivery_fee: quote!.delivery_fee,
          request_key: requestKey,
          items: quote!.items.map((item) => ({ product_id: item.product_id, qty: item.qty })),
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
            unit_price: result.items.find((item) =>
              item.product_id === quote?.items.find((quoted) => quoted.requested_product_id === line.product.id)?.product_id,
            )?.unit_price ?? quote?.items.find((item) => item.requested_product_id === line.product.id)?.unit_price ?? priceOf(line.product, line.qty) ?? 0,
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
          delivery_fee_accepted: acceptedDeliveryFee,
          quoted_delivery_fee: quote!.delivery_fee,
          items: quote!.items.map((item) => ({ product_id: item.product_id, qty: item.qty })),
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
      const message = error instanceof Error ? error.message : 'Please check your connection and try again.';
      if (/delivery charge changed|stock|price .* changed|not enough stock/i.test(message)) {
        setQuote(null);
        setAcceptedDeliveryFee(false);
        setQuoteRefreshVersion((version) => version + 1);
      }
      Alert.alert('Could not start checkout', message);
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
                <Text style={styles.helper}>
                  {km === undefined
                    ? (quoteLoading ? 'Checking available farms and delivery distance…' : 'Farm distance is unavailable')
                    : `${km.toFixed(1)} km to the furthest selected farm`}
                  {place.approximate ? ' · approximate delivery address' : ''}
                </Text>
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

          <Text style={styles.heading}>Choose a delivery timeframe</Text>
          <Text style={styles.subheading}>Delivery options are shown only after their price has been configured.</Text>
          <View style={styles.choiceRow}>
            {deliveryOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.choiceCard, deliveryWindow === option.value && styles.choiceSelected]}
                onPress={() => {
                  setDeliveryWindow(option.value);
                  setPayment(null);
                  setAcceptedDeliveryFee(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: deliveryWindow === option.value }}
              >
                <Ionicons name="time-outline" size={20} color={deliveryWindow === option.value ? colors.green : colors.muted} />
                <Text style={styles.choiceTitle}>{option.title}</Text>
                <Text style={styles.choiceHint}>{option.fee === 0 ? 'No timeframe surcharge' : `+${formatPrice(option.fee)}`}</Text>
              </Pressable>
            ))}
          </View>
          {deliveryOptions.length === 0 && (
            <Text style={styles.warning}>Delivery timeframes are temporarily unavailable because no delivery prices are configured.</Text>
          )}
          {quoteError.length > 0 && <Text style={styles.warning}>{quoteError}</Text>}
          {quoteLoading && <Text style={styles.helper}>Refreshing stock, farm distance and delivery price…</Text>}
          {paidDelivery && (
            <Pressable
              style={styles.acceptDelivery}
              onPress={() => setAcceptedDeliveryFee((accepted) => !accepted)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedDeliveryFee }}
            >
              <Ionicons name={acceptedDeliveryFee ? 'checkbox' : 'square-outline'} size={22} color={acceptedDeliveryFee ? colors.green : colors.muted} />
              <Text style={styles.choiceHint}>I accept the delivery and selected-timeframe charges.</Text>
            </Pressable>
          )}

          <Text style={styles.heading}>Your order</Text>
          {lines.map((line) => {
            const quotedItem = quote?.items.find((item) => item.requested_product_id === line.product.id);
            const unitPrice = payment?.items.find((item) => item.product_id === quotedItem?.product_id)?.unit_price
              ?? quotedItem?.unit_price
              ?? priceOf(line.product, line.qty);
            return (
              <View key={line.product.id} style={styles.orderLine}>
                <Text style={styles.orderName}>{line.qty} × {line.product.name}</Text>
                <Text style={styles.orderPrice}>{unitPrice === null ? 'Price not set' : formatPrice(unitPrice * line.qty)}</Text>
              </View>
            );
          })}
          <View style={styles.totalCard}>
            <SummaryRow label="Items" value={formatPrice(payment?.subtotal ?? quote?.subtotal ?? 0)} />
            <SummaryRow
              label={`Distance-based delivery · ${km === undefined ? 'pending' : `${km.toFixed(1)} km`}`}
              value={quote ? quote.distance_fee === 0 ? 'FREE' : formatPrice(quote.distance_fee) : 'Unavailable'}
            />
            <SummaryRow label={`${deliveryWindow} delivery surcharge`} value={speedFee === undefined ? 'Unavailable' : speedFee === 0 ? 'FREE' : formatPrice(speedFee)} />
            {payment && <SummaryRow label="Confirmed delivery fee" value={payment.delivery_fee === 0 ? 'FREE' : formatPrice(payment.delivery_fee)} />}
            <View style={styles.divider} />
            <SummaryRow
              label="Estimated total"
              value={payment ? formatPrice(payment.amount) : quote ? formatPrice(estimate) : quoteLoading ? 'Calculating…' : 'Unavailable'}
              bold
            />
            <Text style={styles.confirmText}>
              {ratesUnavailable
                ? 'Exchange rate unavailable · values shown in TZS.'
                : currency === 'TZS'
                  ? 'Order and payment currency · TZS'
                  : `Approximate ${currency} display · exchange rate dated ${ratesUpdatedAt}`}
              {' · '}Charged and settled in TZS.
            </Text>
            {payment && <Text style={styles.confirmText}>Server-confirmed amount · {payment.currency}</Text>}
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
            <Pressable
              style={[styles.primaryButton, (busy || quoteLoading || !quote || unpricedLines.length > 0) && styles.disabled]}
              onPress={startCheckout}
              disabled={busy || quoteLoading || !quote || unpricedLines.length > 0}
            >
              {busy
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.primaryText}>
                  {checkoutPayment === 'cash_on_delivery'
                    ? `Place order · ${formatPrice(estimate)}`
                    : payment ? `Continue to payment · ${formatPrice(payment.amount)}` : 'Review secure payment'}
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
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 13 },
  choiceCard: { flexGrow: 1, flexBasis: '42%', minWidth: 130, minHeight: 102, padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'flex-start', justifyContent: 'center', gap: 5 },
  choiceSelected: { borderColor: colors.green, backgroundColor: '#EFF7EC' },
  choiceTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  choiceHint: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  warning: { color: '#A15C00', fontWeight: '700', marginBottom: 12 },
  acceptDelivery: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 8 },
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
