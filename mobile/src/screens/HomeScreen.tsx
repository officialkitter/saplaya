import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { View as MotiView } from 'moti/build/components/view';
import { fetchProducts, fetchPromos } from '../lib/api';
import { getStartupData } from '../lib/startup';
import { useDeliveryPlace } from '../lib/location';
import { ModeBackdrop, ModeToggle } from '../components/ModeToggle';
import PromoSlider from '../components/PromoSlider';
import ProductCard from '../components/ProductCard';
import { useStore } from '../store/StoreContext';
import { colors } from '../theme';
import { Product, Promo } from '../types';
import { useCurrency } from '../lib/currency';

type CatalogRow =
  | { kind: 'heading'; key: string; title: string; count: number; expanded: boolean }
  | { kind: 'products'; key: string; products: Product[] };

function categoryGroup(category = ''): 'fresh' | 'grains' | 'essentials' {
  const value = category.toLocaleLowerCase();
  if (/grain|pulse|legume|bean|rice|maize|millet|cereal/.test(value)) return 'grains';
  if (/oil|sauce|cheese|dairy|cooking|spice|condiment/.test(value)) return 'essentials';
  if (/fruit|veget|produce|leaf|herb|flower/.test(value)) return 'fresh';
  return 'essentials';
}

export default function HomeScreen({ navigation }: any) {
  const startupData = getStartupData();
  const { mode } = useStore();
  const { currency, currencies, setCurrency, ratesLoading, ratesUnavailable, ratesUpdatedAt } = useCurrency();
  const place = useDeliveryPlace();
  const productLocation = useMemo(
    () => place.approximate ? undefined : { lat: place.lat, lng: place.lng },
    [place.approximate, place.lat, place.lng],
  );
  const [promos, setPromos] = useState<Promo[]>(startupData?.promos ?? []);
  const [items, setItems] = useState<Product[]>(startupData?.products.items ?? []);
  const [page, setPage] = useState(startupData ? 1 : 0);
  const [hasMore, setHasMore] = useState(startupData?.products.hasMore ?? true);
  const [loading, setLoading] = useState(!startupData);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const catalogRows = useMemo<CatalogRow[]>(() => {
    const groups: { key: 'fresh' | 'grains' | 'essentials'; title: string }[] = [
      { key: 'fresh', title: 'Fresh produce' },
      { key: 'grains', title: 'Grains & pulses' },
      { key: 'essentials', title: 'Cooking essentials' },
    ];
    return groups.flatMap(({ key, title }) => {
      const products = items.filter((product) => categoryGroup(product.category) === key);
      if (!products.length) return [];
      const expanded = expandedSections[key] ?? false;
      const visibleProducts = expanded ? products : products.slice(0, 6);
      return [
        { kind: 'heading' as const, key: `heading-${key}`, title, count: products.length, expanded },
        ...Array.from({ length: Math.ceil(visibleProducts.length / 2) }, (_, index) => ({
          kind: 'products' as const,
          key: `${key}-${index}`,
          products: visibleProducts.slice(index * 2, index * 2 + 2),
        })),
      ];
    });
  }, [items, expandedSections]);

  const navigateToRoot = (screen: 'Account' | 'LocationPicker') => {
    const rootNavigation = navigation.getParent('RootStack');
    if (!rootNavigation) {
      console.error(`Could not find the root navigator to open ${screen}.`);
      return;
    }
    rootNavigation.navigate(screen);
  };

  const cycleCurrency = () => {
    const index = currencies.indexOf(currency);
    setCurrency(currencies[(index + 1 + currencies.length) % currencies.length] ?? 'TZS');
  };

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetchProducts(page, productLocation);
      setItems((prev) => [...prev, ...res.items]);
      setHasMore(res.hasMore);
      setPage((p) => p + 1);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load items.');
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, productLocation]);

  const refreshProducts = useCallback(async (isActive: () => boolean = () => true) => {
    setLoading(true);
    try {
      const res = await fetchProducts(0, productLocation);
      if (!isActive()) return;
      setItems(res.items);
      setPage(1);
      setHasMore(res.hasMore);
      setError(null);
    } catch (e: unknown) {
      if (!isActive()) return;
      const message = e instanceof Error ? e.message : 'Could not load items.';
      setError(message);
      console.error('Could not refresh customer products:', e);
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [productLocation]);

  useEffect(() => {
    if (startupData) return;
    fetchPromos().then(setPromos).catch((promoError: unknown) => {
      console.error('Could not load promotions:', promoError);
    });
  }, [startupData]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void refreshProducts(() => active);
    return () => {
      active = false;
    };
  }, [refreshProducts]));

  const header = (
    <View>
      {/* Delivery location with van icon */}
      <View style={styles.topBar}>
        <Pressable style={styles.loc} onPress={() => navigateToRoot('LocationPicker')} accessibilityRole="button" accessibilityLabel={`Change delivery location, currently ${place.label}`}>
          <MotiView
            from={{ translateX: -8 }}
            animate={{ translateX: 0 }}
            transition={{ type: 'timing', duration: 900, loop: true, repeatReverse: true }}
            style={styles.van}
          >
            <MaterialCommunityIcons name="van-utility" size={24} color={colors.white} />
          </MotiView>
          <View style={{ flex: 1 }}>
            <Text style={styles.locSmall}>Delivering to · Tap to change</Text>
            <Text style={styles.locBig} numberOfLines={1}>
              {place.label} <Ionicons name="chevron-down" size={14} color={colors.green} />
            </Text>
          </View>
        </Pressable>
        <Pressable style={styles.accountButton} onPress={() => navigateToRoot('Account')} accessibilityRole="button" accessibilityLabel="Open your account">
          <Ionicons name="person-outline" size={23} color={colors.green} />
        </Pressable>
        <Pressable
          style={styles.currencyButton}
          onPress={cycleCurrency}
          accessibilityRole="button"
          accessibilityLabel={`Display currency ${currency}, initially detected from device region. Tap to change currency.`}
        >
          <Text style={styles.currencyText}>{currency}</Text>
        </Pressable>
      </View>
      {ratesLoading && currency !== 'TZS'
        ? <Text style={styles.marketNote}>Loading approximate {currency} display rate · orders are charged in TZS.</Text>
        : ratesUnavailable
          ? <Text style={styles.marketNote}>Exchange rates unavailable · showing TZS. Orders are charged in TZS.</Text>
          : currency !== 'TZS'
            ? <Text style={styles.marketNote}>Approximate {currency} display · orders are charged in TZS · rate dated {ratesUpdatedAt}</Text>
            : null}

      <PromoSlider promos={promos} />

      <Text style={styles.q}>How are you shopping today?</Text>
      <ModeToggle />

      <Text style={styles.section}>Shop by category</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ModeBackdrop />
      <FlatList<CatalogRow>
        data={catalogRows}
        keyExtractor={(row) => row.key}
        renderItem={({ item, index }) => item.kind === 'heading' ? (
          <View style={styles.categoryHeading}>
            <Text style={styles.categoryTitle}>{item.title}</Text>
            {item.count > 6 && (
              <Pressable
                onPress={() => setExpandedSections((sections) => ({ ...sections, [item.key.replace('heading-', '')]: !item.expanded }))}
                accessibilityRole="button"
              >
                <Text style={styles.seeMore}>{item.expanded ? 'See less' : 'See more'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.productRow}>
            {item.products.map((product, productIndex) => (
              <ProductCard key={product.id} product={product} index={index + productIndex} onPress={() => navigation.navigate('Product', { product })} />
            ))}
            {item.products.length === 1 && <View style={styles.productSpacer} />}
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.green} style={{ margin: 32 }} />
          ) : error ? (
            <Text style={styles.err} onPress={() => void refreshProducts()}>{error} — tap to retry</Text>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="basket-outline" size={40} color={colors.green} />
              <Text style={styles.emptyTitle}>No items in stock right now</Text>
              <Text style={styles.emptyText}>New products will appear here as local farms add approved prices and available stock.</Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && items.length > 0 ? (
            <ActivityIndicator color={colors.green} style={{ margin: 24 }} />
          ) : error && items.length > 0 ? (
            <Text style={styles.err} onPress={() => void refreshProducts()}>{error} — tap to retry</Text>
          ) : null
        }
        onEndReachedThreshold={0.6}
        onEndReached={loadMore}
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
  loc: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 6, gap: 12 },
  van: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  accountButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  currencyButton: { minWidth: 52, height: 42, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 6 },
  currencyText: { color: colors.green, fontWeight: '900', fontSize: 12 },
  marketNote: { color: colors.muted, fontSize: 11, marginHorizontal: 20, marginTop: 4 },
  locSmall: { fontSize: 12, color: colors.muted },
  locBig: { fontSize: 18, fontWeight: '800', color: colors.ink },
  q: { fontSize: 20, fontWeight: '800', color: colors.ink, marginHorizontal: 20, marginTop: 22, marginBottom: 10 },
  section: { fontSize: 22, fontWeight: '900', color: colors.green, marginHorizontal: 20, marginTop: 22, marginBottom: 6 },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  categoryTitle: { fontSize: 20, fontWeight: '900', color: colors.ink },
  seeMore: { color: colors.green, fontWeight: '800' },
  productRow: { flexDirection: 'row', paddingHorizontal: 14 },
  productSpacer: { flex: 1, padding: 6 },
  err: { textAlign: 'center', color: '#D32F2F', padding: 20, fontWeight: '700' },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 36 },
  emptyTitle: { marginTop: 12, fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  emptyText: { marginTop: 6, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
