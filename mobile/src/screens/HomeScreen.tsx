import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { View as MotiView } from 'moti/build/components/view';
import { fetchProducts, fetchPromos, type ProductFilters } from '../lib/api';
import { getStartupData } from '../lib/startup';
import { useDeliveryPlace } from '../lib/location';
import { ModeBackdrop, ModeToggle } from '../components/ModeToggle';
import PromoSlider from '../components/PromoSlider';
import ProductCard from '../components/ProductCard';
import { useStore } from '../store/StoreContext';
import { colors, volumeTheme } from '../theme';
import { Product, Promo } from '../types';
import { useCurrency } from '../lib/currency';

type CatalogRow =
  | { kind: 'heading'; key: string; title: string; description: string; count: number; expanded: boolean }
  | { kind: 'products'; key: string; products: Product[] };

function categoryGroup(category = ''): 'holisticare' | 'grains' | 'essentials' {
  const value = category.toLocaleLowerCase();
  if (/grain|pulse|legume|bean|rice|maize|millet|cereal/.test(value)) return 'grains';
  if (/oil|sauce|cheese|dairy|cooking|spice|condiment/.test(value)) return 'essentials';
  if (/fruit|veget|produce|leaf|herb|flower/.test(value)) return 'holisticare';
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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [fresh, setFresh] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>({});
  const [categories, setCategories] = useState<string[]>([]);
  const requestGeneration = useRef(0);
  const tierTheme = volumeTheme(mode);
  const searching = Boolean(filters.query?.trim() || filters.category || filters.minPrice || filters.maxPrice || filters.fresh || (filters.sort && filters.sort !== 'default'));

  const catalogRows = useMemo<CatalogRow[]>(() => {
    if (searching) {
      return items.length ? [
        { kind: 'heading', key: 'heading-results', title: 'Search results', description: 'Products matching your selected filters.', count: 0, expanded: true },
        ...Array.from({ length: Math.ceil(items.length / 2) }, (_, index) => ({
          kind: 'products' as const, key: `results-${index}`, products: items.slice(index * 2, index * 2 + 2),
        })),
      ] : [];
    }
    const groups: { key: 'fresh' | 'holisticare' | 'grains' | 'essentials'; title: string; description: string }[] = [
      { key: 'fresh', title: 'Fresh today', description: 'Harvested within the last 24 hours.' },
      { key: 'holisticare', title: 'Holisticare', description: 'Vegetables, fruits, herbs and other garden produce.' },
      { key: 'grains', title: 'Grains & pulses', description: 'Everyday grains, cereals, beans and pulses.' },
      { key: 'essentials', title: 'Cooking essentials', description: 'Pantry staples including oils, sauces, spices and more.' },
    ];
    return groups.flatMap(({ key, title, description }) => {
      const products = items.filter((product) => {
        if (key !== 'fresh') return categoryGroup(product.category) === key;
        const harvested = Date.parse(product.harvested_at);
        const age = Date.now() - harvested;
        return categoryGroup(product.category) === 'holisticare'
          && Number.isFinite(harvested) && age >= 0 && age < 24 * 60 * 60 * 1000;
      });
      if (!products.length) return [];
      const expanded = expandedSections[key] ?? false;
      const visibleProducts = expanded ? products : products.slice(0, 6);
      return [
        { kind: 'heading' as const, key: `heading-${key}`, title, description, count: products.length, expanded },
        ...Array.from({ length: Math.ceil(visibleProducts.length / 2) }, (_, index) => ({
          kind: 'products' as const,
          key: `${key}-${index}`,
          products: visibleProducts.slice(index * 2, index * 2 + 2),
        })),
      ];
    });
  }, [items, expandedSections, searching]);

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
    const generation = requestGeneration.current;
    setLoading(true);
    try {
      const res = await fetchProducts(page, productLocation, filters);
      if (generation !== requestGeneration.current) return;
      setItems((prev) => [...prev, ...res.items]);
      setHasMore(res.hasMore);
      setPage((p) => p + 1);
      setError(null);
    } catch (e: unknown) {
      if (generation === requestGeneration.current) setError(e instanceof Error ? e.message : 'Could not load items.');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [loading, hasMore, page, productLocation, filters]);

  const refreshProducts = useCallback(async (isActive: () => boolean = () => true) => {
    const generation = ++requestGeneration.current;
    if (filters.sort === 'nearby' && !productLocation) {
      setItems([]);
      setHasMore(false);
      setError('Choose a delivery location to sort by nearby farms.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchProducts(0, productLocation, filters);
      if (!isActive() || generation !== requestGeneration.current) return;
      setItems(res.items);
      setCategories(res.categories ?? []);
      setPage(1);
      setHasMore(res.hasMore);
      setError(null);
    } catch (e: unknown) {
      if (!isActive() || generation !== requestGeneration.current) return;
      const message = e instanceof Error ? e.message : 'Could not load items.';
      setError(message);
      console.error('Could not refresh customer products:', e);
    } finally {
      if (isActive() && generation === requestGeneration.current) setLoading(false);
    }
  }, [productLocation, filters]);

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
      requestGeneration.current += 1;
    };
  }, [refreshProducts]));

  useEffect(() => {
    const timer = setTimeout(() => {
      requestGeneration.current += 1;
      setItems([]);
      setLoading(true);
      setError(null);
      setExpandedSections({});
      setFilters({ query, category, fresh });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, category, fresh]);

  const header = (
    <View>
      {/* Delivery location with van icon */}
      <View style={styles.topBar}>
        <Pressable style={styles.loc} onPress={() => navigateToRoot('LocationPicker')} accessibilityRole="button" accessibilityLabel={`Change delivery location, currently ${place.label}`}>
          <MotiView
            from={{ translateX: -8 }}
            animate={{ translateX: 0 }}
            transition={{ type: 'timing', duration: 900, loop: true, repeatReverse: true }}
            style={[styles.van, { backgroundColor: tierTheme.button }]}
          >
            <MaterialCommunityIcons name="van-utility" size={24} color={tierTheme.buttonText} />
          </MotiView>
          <View style={{ flex: 1 }}>
            <Text style={styles.locSmall}>Delivering to · Tap to change</Text>
            <Text style={styles.locBig} numberOfLines={1}>
              {place.label} <Ionicons name="chevron-down" size={14} color={tierTheme.accent} />
            </Text>
          </View>
        </Pressable>
        <Pressable style={styles.accountButton} onPress={() => navigateToRoot('Account')} accessibilityRole="button" accessibilityLabel="Open your account">
          <Ionicons name="person-outline" size={23} color={tierTheme.accent} />
        </Pressable>
        <Pressable
          style={styles.currencyButton}
          onPress={cycleCurrency}
          accessibilityRole="button"
          accessibilityLabel={`Display currency ${currency}, initially detected from device region. Tap to change currency.`}
        >
          <Text style={[styles.currencyText, { color: tierTheme.accent }]}>{currency}</Text>
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

      <Text style={[styles.section, { color: tierTheme.accent }]}>Shop by category</Text>
      <View style={styles.searchPanel}>
        <View style={[styles.searchBar, { borderColor: tierTheme.button, backgroundColor: mode === 'wholesale' ? tierTheme.soft : colors.white }]}>
          <Ionicons name="search" size={20} color={tierTheme.accent} />
          <TextInput value={query} onChangeText={setQuery} maxLength={100} placeholder="Search products" accessibilityLabel="Search products" style={styles.searchInput} returnKeyType="search" />
          {query ? <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search"><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.filterChips}>
          <Pressable onPress={() => setFresh((value) => !value)} accessibilityRole="button" accessibilityState={{ selected: fresh }} style={[styles.chip, fresh && { backgroundColor: tierTheme.soft, borderColor: tierTheme.accent }]}>
            <Text style={[styles.chipText, fresh && { color: tierTheme.accent }]}>Harvested today</Text>
          </Pressable>
          {['', ...categories].map((value) => (
            <Pressable key={value || 'all'} onPress={() => setCategory(value)} accessibilityRole="button" accessibilityState={{ selected: category === value }} style={[styles.chip, category === value && { backgroundColor: tierTheme.soft, borderColor: tierTheme.button }]}>
              <Text style={[styles.chipText, category === value && { color: tierTheme.accent }]}>{value || 'All'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tierTheme.background }]} edges={['top']}>
      <ModeBackdrop />
      <FlatList<CatalogRow>
        data={catalogRows}
        keyExtractor={(row) => row.key}
        renderItem={({ item, index }) => item.kind === 'heading' ? (
          <View style={styles.categoryHeading}>
            <View style={{ flex: 1 }}>
              <Text style={styles.categoryTitle}>{item.title}</Text>
              <Text style={styles.categoryDescription}>{item.description}</Text>
            </View>
            {item.count > 6 && (
              <Pressable
                onPress={() => setExpandedSections((sections) => ({ ...sections, [item.key.replace('heading-', '')]: !item.expanded }))}
                accessibilityRole="button"
              >
                <Text style={[styles.seeMore, { color: tierTheme.accent }]}>{item.expanded ? 'See less' : 'See more'}</Text>
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
            <ActivityIndicator color={tierTheme.accent} style={{ margin: 32 }} />
          ) : error ? (
            <Text style={styles.err} onPress={() => void refreshProducts()}>{error} — tap to retry</Text>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="basket-outline" size={40} color={tierTheme.accent} />
              <Text style={styles.emptyTitle}>{searching ? 'No matching products' : 'No items in stock right now'}</Text>
              <Text style={styles.emptyText}>{searching ? 'Try another search or change your filters.' : 'New products will appear here as local farms add approved prices and available stock.'}</Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && items.length > 0 ? (
            <ActivityIndicator color={tierTheme.accent} style={{ margin: 24 }} />
          ) : error && items.length > 0 ? (
            <Text style={styles.err} onPress={() => void refreshProducts()}>{error} — tap to retry</Text>
          ) : hasMore && items.length > 0 ? (
            <Pressable onPress={() => void loadMore()} accessibilityRole="button"><Text style={[styles.seeMoreFooter, { color: tierTheme.accent }]}>Load more products</Text></Pressable>
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
  categoryDescription: { marginTop: 3, marginRight: 8, color: colors.muted, fontSize: 12 },
  seeMore: { color: colors.green, fontWeight: '800' },
  seeMoreFooter: { color: colors.green, fontWeight: '800', textAlign: 'center', padding: 20 },
  productRow: { flexDirection: 'row', paddingHorizontal: 14 },
  productSpacer: { flex: 1, padding: 6 },
  err: { textAlign: 'center', color: '#D32F2F', padding: 20, fontWeight: '700' },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 36 },
  emptyTitle: { marginTop: 12, fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  emptyText: { marginTop: 6, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  searchPanel: { marginHorizontal: 20, marginTop: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, backgroundColor: colors.white },
  searchInput: { flex: 1, paddingVertical: 10, color: colors.ink },
  filterChips: { paddingTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.line, marginRight: 6 },
  chipText: { color: colors.ink, fontWeight: '600' },
});
