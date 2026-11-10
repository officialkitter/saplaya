import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { View as MotiView } from 'moti/build/components/view';
import ScreenHeader from '../components/ScreenHeader';
import PaymentFrame from '../components/PaymentFrame';
import { ApiRequestError, CheckoutQuote, confirmPayment, CustomerOrder, DeliveryEta, DeliveryOption, deliveryWindowLabel, fetchCheckoutQuote, fetchDeliveryOptions, fetchPaymentMethods, initializePayment, placeCashOrder, SavedPaymentMethod } from '../lib/api';
import { useDeliveryActions, useDeliveryPlace } from '../lib/location';
import { useAccount } from '../store/AccountContext';
import { useStore } from '../store/StoreContext';
import { colors, radius, shadow, volumeTheme } from '../theme';
import { useCurrency } from '../lib/currency';
import { verifyAfterPaymentBrowser } from '../lib/payment-confirmation';
import { API_URL } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type PaymentSession = Awaited<ReturnType<typeof initializePayment>>;
type CheckoutPayment = 'online' | 'cash_on_delivery';

export default function CheckoutScreen({ navigation }: any) {
  const { lines, mode, priceOf, clear, setLastOrderId } = useStore();
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
  const [paymentBasketKey, setPaymentBasketKey] = useState<string | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<Omit<CustomerOrder, 'id' | 'created_at'> | null>(null);
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryEta>('morning');
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
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [paymentOrigin, setPaymentOrigin] = useState('');
  const finishingPayment = useRef(false);
  const dailyDelivery = mode === 'retail' || mode === 'wholesale';
  const availableDeliveryOptions = useMemo(() => deliveryOptions.filter((option) =>
    dailyDelivery ? option.value === 'morning' || option.value === 'evening'
      : option.value !== 'morning' && option.value !== 'evening',
  ), [deliveryOptions, dailyDelivery]);
  const tierTheme = volumeTheme(mode);

  const km = quote?.distance_km;
  const speedFee = quote?.speed_fee;
  const estimate = quote?.amount ?? 0;
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
    () => JSON.stringify({ mode, lines: lines.map(({ product, qty }) => [product.id, qty]), lat: place.lat, lng: place.lng, approximate: place.approximate, name, email, phone, paymentPhone, deliveryWindow, checkoutPayment }),
    [mode, lines, place.lat, place.lng, place.approximate, name, email, phone, paymentPhone, deliveryWindow, checkoutPayment],
  );
  const currentBasketKey = useRef(basketKey);
  currentBasketKey.current = basketKey;

  useEffect(() => {
    if (pendingVerification) return;
    setPayment(null);
    setPaymentBasketKey(null);
    setPaymentSummary(null);
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
    if (!lines.length || !availableDeliveryOptions.some((option) => option.value === deliveryWindow)) {
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
  }, [quoteKey, quoteRefreshVersion, availableDeliveryOptions, lines, mode, deliveryWindow, place.lat, place.lng, place.approximate]);

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
    }).catch((error: unknown) => {
      console.error('Could not load delivery options:', error);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (availableDeliveryOptions.some((option) => option.value === deliveryWindow)) return;
    setDeliveryWindow(dailyDelivery ? 'morning' : '24h');
  }, [availableDeliveryOptions, dailyDelivery, deliveryWindow]);

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
    if (!availableDeliveryOptions.length || speedFee === undefined) {
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
      const order = paymentSummary
        ? { ...paymentSummary, id: result.order_id, created_at: new Date().toISOString() }
        : undefined;
      if (paymentBasketKey === currentBasketKey.current) clear();
      setLastOrderId(result.order_id);
      setPayment(null);
      setPaymentBasketKey(null);
      setPaymentSummary(null);
      setPendingVerification(null);
      navigation.navigate('Tabs', { screen: 'Tracking', params: { orderId: result.order_id, order, newlyPlaced: true } });
      if (!order) Alert.alert('Order confirmed', 'The checkout summary is unavailable. Check order tracking or contact Saplaya with your order ID.');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 402) {
        setPayment(null);
        setPaymentBasketKey(null);
        setPaymentSummary(null);
        setPendingVerification(null);
        Alert.alert('Payment not completed', `${error.message} Your basket is still available.`);
        return;
      }
      Alert.alert(
        'Payment not yet verified',
        `${error instanceof Error ? error.message : 'The payment could not be verified right now.'} Your basket is still here. Retry verification before starting another payment.`,
      );
    }
  };

  const openPayment = (session: PaymentSession) => {
    const references = { txRef: session.tx_ref, orderTrackingId: session.order_tracking_id };
    setPendingVerification(references);
    setPaymentOrigin(new URL(session.payment_url).hostname);
    setPaymentVisible(true);
  };

  const finishEmbeddedPayment = async () => {
    if (!pendingVerification || finishingPayment.current) return;
    finishingPayment.current = true;
    setPaymentVisible(false);
    setBusy(true);
    try {
      await completeOrder(pendingVerification.txRef, pendingVerification.orderTrackingId);
    } finally {
      finishingPayment.current = false;
      setBusy(false);
    }
  };

  const openBrowserFallback = async () => {
    if (!payment || !pendingVerification || finishingPayment.current) return;
    finishingPayment.current = true;
    setPaymentVisible(false);
    setBusy(true);
    try {
      const callbackUrl = Linking.createURL('payment-callback');
      await verifyAfterPaymentBrowser(
        pendingVerification,
        () => WebBrowser.openAuthSessionAsync(payment.payment_url, callbackUrl, { preferEphemeralSession: true }),
        completeOrder,
      );
    } catch (error) {
      Alert.alert(
        'Could not open payment',
        `${error instanceof Error ? error.message : 'Please try again.'} Check payment status before starting another payment.`,
      );
    } finally {
      finishingPayment.current = false;
      setBusy(false);
    }
  };

  const buildOrderItems = (pricedItems: { product_id: string; unit_price: number }[], currentQuote: CheckoutQuote): CustomerOrder['order_items'] | null => {
    const items: CustomerOrder['order_items'] = [];
    for (const line of lines) {
      const quoted = currentQuote.items.find((item) => item.requested_product_id === line.product.id);
      const priced = pricedItems.find((item) => item.product_id === quoted?.product_id);
      if (!priced || !Number.isFinite(priced.unit_price)) return null;
      items.push({
        qty: line.qty,
        unit_price: priced.unit_price,
        products: { name: line.product.name, unit: line.product.unit, image_url: line.product.image_url },
      });
    }
    return items;
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
        const orderItems = quote ? buildOrderItems(result.items, quote) : null;
        const order = orderItems ? {
          id: result.order_id,
          mode,
          status: 'pending' as const,
          subtotal: result.subtotal,
          delivery_fee: result.delivery_fee,
          created_at: result.created_at,
          delivery_window: result.delivery_window,
          payment_method: 'cash_on_delivery' as const,
          order_items: orderItems,
        } : undefined;
        clear();
        setLastOrderId(result.order_id);
        navigation.navigate('Tabs', { screen: 'Tracking', params: { orderId: result.order_id, order, newlyPlaced: true } });
        if (!order) Alert.alert('Order confirmed', 'The checkout summary is unavailable. Check order tracking or contact Saplaya with your order ID.');
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
        const orderItems = buildOrderItems(initialized.items, quote!);
        setPayment(initialized);
        setPaymentBasketKey(basketKey);
        setPaymentSummary(orderItems ? {
          mode,
          status: 'pending',
          subtotal: initialized.subtotal,
          delivery_fee: initialized.delivery_fee,
          delivery_window: deliveryWindow,
          payment_method: 'pesapal',
          order_items: orderItems,
        } : null);
        return;
      }

      openPayment(payment);
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

  const resumePayment = () => {
    if (!payment) return;
    openPayment(payment);
  };

  if (!lines.length) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: tierTheme.background }]} edges={['top']}>
        <ScreenHeader title="Checkout" onBack={() => navigation.goBack()} />
        <View style={styles.empty}>
          <Ionicons name="basket-outline" size={74} color={tierTheme.accent} />
          <Text style={styles.heading}>Your basket is empty</Text>
          <Text style={styles.subheading}>Add something fresh before checkout.</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: tierTheme.button }]} onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}>
            <Text style={[styles.primaryText, { color: tierTheme.buttonText }]}>Back to shop</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tierTheme.background }]} edges={['top']}>
      <ScreenHeader title="Checkout" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 230 }}>
          <Text style={styles.heading}>Delivery details</Text>
          <Text style={styles.subheading}>Who should we contact about this order?</Text>
          <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" editable={!pendingVerification} />
          <Field label="Email for payment receipt" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!pendingVerification} />
          <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" editable={!pendingVerification} />

          <View style={styles.deliveryCard}>
            <View style={styles.deliveryTop}>
              <View style={[styles.pin, { backgroundColor: tierTheme.soft }]}><Ionicons name="location" size={20} color={tierTheme.accent} /></View>
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
              <Pressable onPress={() => navigation.navigate('LocationPicker')} accessibilityLabel="Change delivery location" disabled={!!pendingVerification}>
                <Text style={[styles.change, { color: tierTheme.accent }]}>Change</Text>
              </Pressable>
            </View>
            {addresses.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedAddresses}>
                {addresses.map((address) => (
                  <Pressable
                    key={address.id}
                    disabled={!!pendingVerification}
                    style={[styles.addressChip, selectedAddressId === address.id && [styles.addressChipSelected, { borderColor: tierTheme.button, backgroundColor: tierTheme.soft }]]}
                    onPress={() => chooseAddress(address.id)}
                  >
                    <Text style={[styles.addressChipText, selectedAddressId === address.id && [styles.addressChipTextSelected, { color: tierTheme.accent }]]}>{address.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          <Text style={[styles.heading, { color: tierTheme.accent }]}>{dailyDelivery ? 'Choose a delivery window' : 'Choose a bulk delivery timeframe'}</Text>
          <Text style={styles.subheading}>{dailyDelivery
            ? 'Choose morning 07:00–10:00 or evening 15:00–18:00 local time.'
            : 'Bulk orders use a scheduled delivery timeframe configured by the owner.'}</Text>
          <View style={styles.choiceRow}>
            {availableDeliveryOptions.map((option) => (
              <Pressable
                key={option.value}
                disabled={!!pendingVerification}
                style={[styles.choiceCard, deliveryWindow === option.value && [styles.choiceSelected, { borderColor: tierTheme.button, backgroundColor: tierTheme.soft }]]}
                onPress={() => {
                  setDeliveryWindow(option.value);
                  setPayment(null);
                  setAcceptedDeliveryFee(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: deliveryWindow === option.value }}
              >
                <Ionicons name="time-outline" size={20} color={deliveryWindow === option.value ? tierTheme.accent : colors.muted} />
                <Text style={styles.choiceTitle}>{option.value === 'morning' || option.value === 'evening' ? deliveryWindowLabel(option.value) : option.title}</Text>
                <Text style={styles.choiceHint}>{option.fee === 0 ? 'No timeframe surcharge' : `+${formatPrice(option.fee)}`}</Text>
              </Pressable>
            ))}
          </View>
          {availableDeliveryOptions.length === 0 && (
            <Text style={styles.warning}>{dailyDelivery ? 'Daily delivery windows are temporarily unavailable.' : 'Bulk delivery timeframes are unavailable until an owner configures their prices.'}</Text>
          )}
          {quoteError.length > 0 && <Text style={styles.warning}>{quoteError}</Text>}
          {quoteLoading && <Text style={styles.helper}>Refreshing stock, farm distance and delivery price…</Text>}
          {paidDelivery && (
            <Pressable
              style={styles.acceptDelivery}
              disabled={!!pendingVerification}
              onPress={() => setAcceptedDeliveryFee((accepted) => !accepted)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedDeliveryFee }}
            >
              <Ionicons name={acceptedDeliveryFee ? 'checkbox' : 'square-outline'} size={22} color={acceptedDeliveryFee ? tierTheme.accent : colors.muted} />
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
                <Text style={[styles.orderPrice, { color: tierTheme.accent }]}>{unitPrice === null ? 'Confirmed at checkout' : formatPrice(unitPrice * line.qty)}</Text>
              </View>
            );
          })}
          <View style={styles.totalCard}>
            <SummaryRow label="Items" value={payment ? formatPrice(payment.subtotal) : quote ? formatPrice(quote.subtotal) : 'Awaiting quote'} />
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
            <Text style={[styles.confirmText, { color: tierTheme.accent }]}>
              {ratesUnavailable
                ? 'Exchange rate unavailable · values shown in TZS.'
                : currency === 'TZS'
                  ? 'Order and payment currency · TZS'
                  : `Approximate ${currency} display · exchange rate dated ${ratesUpdatedAt}`}
              {' · '}Charged and settled in TZS.
            </Text>
            {payment && <Text style={[styles.confirmText, { color: tierTheme.accent }]}>Server-confirmed amount · {payment.currency}</Text>}
          </View>

          <Text style={styles.heading}>Payment method</Text>
          <View style={styles.choiceRow}>
            <Pressable
              style={[styles.choiceCard, checkoutPayment === 'online' && [styles.choiceSelected, { borderColor: tierTheme.button, backgroundColor: tierTheme.soft }]]}
              disabled={!!pendingVerification}
              onPress={() => {
                setCheckoutPayment('online');
                setPayment(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: checkoutPayment === 'online' }}
            >
              <Ionicons name="phone-portrait-outline" size={21} color={checkoutPayment === 'online' ? tierTheme.accent : colors.muted} />
              <Text style={styles.choiceTitle}>Pay online</Text>
              <Text style={styles.choiceHint}>Mobile money or card</Text>
            </Pressable>
            <Pressable
              style={[styles.choiceCard, checkoutPayment === 'cash_on_delivery' && [styles.choiceSelected, { borderColor: tierTheme.button, backgroundColor: tierTheme.soft }]]}
              disabled={!!pendingVerification}
              onPress={() => {
                setCheckoutPayment('cash_on_delivery');
                setPayment(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: checkoutPayment === 'cash_on_delivery' }}
            >
              <Ionicons name="cash-outline" size={21} color={checkoutPayment === 'cash_on_delivery' ? tierTheme.accent : colors.muted} />
              <Text style={styles.choiceTitle}>Payment on delivery</Text>
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
                      disabled={!!pendingVerification}
                      style={[styles.savedMethod, paymentPhone === method.phone_e164 && [styles.savedMethodSelected, { borderColor: tierTheme.button, backgroundColor: tierTheme.soft }]]}
                      onPress={() => setPaymentPhone(method.phone_e164)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: paymentPhone === method.phone_e164 }}
                    >
                      <Ionicons name="phone-portrait-outline" size={20} color={tierTheme.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.choiceTitle}>{method.label}</Text>
                        <Text style={styles.choiceHint}>{method.phone_e164}</Text>
                      </View>
                      {paymentPhone === method.phone_e164 && <Ionicons name="checkmark-circle" size={21} color={tierTheme.accent} />}
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
                editable={!pendingVerification}
              />
            </>
          )}

          {checkoutPayment === 'online' && (
            <View style={[styles.secureCard, { backgroundColor: tierTheme.soft }]}>
              <Ionicons name="shield-checkmark-outline" size={22} color={tierTheme.accent} />
              <Text style={styles.secureText}>Complete payment securely using the available mobile money or card options.</Text>
            </View>
          )}

          {pendingVerification ? (
            <>
              <Pressable style={[styles.primaryButton, { backgroundColor: tierTheme.button }]} onPress={retryVerification} disabled={busy}>
                {busy ? <ActivityIndicator color={tierTheme.buttonText} /> : <Text style={[styles.primaryText, { color: tierTheme.buttonText }]}>Check payment status</Text>}
              </Pressable>
              {payment && (
                <Pressable style={[styles.secondaryButton, { backgroundColor: tierTheme.soft }]} onPress={resumePayment} disabled={busy}>
                  <Text style={[styles.change, { color: tierTheme.accent }]}>Return to secure payment</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Pressable
              style={[styles.primaryButton, { backgroundColor: tierTheme.button }, (busy || quoteLoading || !quote) && styles.disabled]}
              onPress={startCheckout}
              disabled={busy || quoteLoading || !quote}
            >
              {busy
                ? <ActivityIndicator color={tierTheme.buttonText} />
                : <Text style={[styles.primaryText, { color: tierTheme.buttonText }]}>
                  {checkoutPayment === 'cash_on_delivery'
                    ? 'Place order'
                    : payment ? 'Continue to payment' : 'Review secure payment'}
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
      <Modal visible={paymentVisible} animationType="slide" onRequestClose={() => void finishEmbeddedPayment()}>
        <SafeAreaView style={styles.paymentModal} edges={['top', 'bottom']}>
          <View style={styles.paymentHeader}>
            <Pressable onPress={() => void finishEmbeddedPayment()} accessibilityRole="button" accessibilityLabel="Close secure payment">
              <Ionicons name="close" size={26} color={colors.ink} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentTitle}>Secure payment</Text>
              <Text style={styles.helper} numberOfLines={1}>{paymentOrigin || 'Connecting securely…'}</Text>
            </View>
            <Pressable onPress={() => void openBrowserFallback()} accessibilityRole="button" accessibilityLabel="Open payment in secure browser">
              <Ionicons name="open-outline" size={23} color={tierTheme.accent} />
            </Pressable>
          </View>
          {payment && (
            <PaymentFrame
              paymentUrl={payment.payment_url}
              apiUrl={API_URL}
              onCallback={() => void finishEmbeddedPayment()}
              onOriginChange={setPaymentOrigin}
              onBrowserFallback={() => void openBrowserFallback()}
              buttonColor={tierTheme.button}
              buttonTextColor={tierTheme.buttonText}
            />
          )}
        </SafeAreaView>
      </Modal>
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
  paymentModal: { flex: 1, backgroundColor: colors.white },
  paymentHeader: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  paymentTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
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
  orderPrice: { flexShrink: 1, maxWidth: '48%', color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  totalCard: { marginTop: 14, padding: 16, borderRadius: radius.md, backgroundColor: colors.white },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingVertical: 5 },
  summaryLabel: { flex: 1, color: colors.muted, fontSize: 14 },
  summaryValue: { flexShrink: 1, color: colors.ink, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  summaryBold: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  divider: { height: 1, marginVertical: 7, backgroundColor: colors.line },
  confirmText: { marginTop: 8, textAlign: 'right', color: colors.green, fontSize: 12, fontWeight: '800' },
  secureCard: { flexDirection: 'row', gap: 10, marginTop: 15, padding: 13, borderRadius: radius.md, backgroundColor: '#EFF7EC' },
  secureText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 56, marginTop: 18, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { minHeight: 48, marginTop: 10, paddingHorizontal: 12, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { flexShrink: 1, color: colors.white, fontSize: 16, lineHeight: 21, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.65 },
  disclaimer: { marginTop: 9, textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 17 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25 },
});
