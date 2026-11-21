import { userFacingMessage } from '../lib/user-facing-error';
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
import { colors, glass, glassElevated, volumeTheme } from '../theme';
import { Product, Promo } from '../types';
import { useCurrency } from '../lib/currency';
import CurrencySelector from '../components/CurrencySelector';

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
  const { currency, ratesLoading, ratesUnavailable, ratesUpdatedAt } = useCurrency();
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoError, setPromoError] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [columns, setColumns] = useState<1 | 2>(2);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [fresh, setFresh] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>({});
  const [categories, setCategories] = useState<string[]>([]);
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const refreshInFlight = useRef(false);
  const tierTheme = volumeTheme(mode);
  const searching = Boolean(filters.query?.trim() || filters.category || filters.minPrice || filters.maxPrice || filters.fresh || (filters.sort && filters.sort !== 'default'));

  const catalogRows = useMemo<CatalogRow[]>(() => {
    if (searching) {
      return items.length ? [
        { kind: 'heading', key: 'heading-results', title: 'Search results', description: 'Products matching your selected filters.', count: 0, expanded: true },
        ...Array.from({ length: Math.ceil(items.length / columns) }, (_, index) => ({
          kind: 'products' as const, key: `results-${items[index * columns].id}`, products: items.slice(index * columns, index * columns + columns),
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
      const visibleProducts = expanded ? products : products.slice(0, 3);
      return [
        { kind: 'heading' as const, key: `heading-${key}`, title, description, count: products.length, expanded },
        ...Array.from({ length: Math.ceil(visibleProducts.length / columns) }, (_, index) => ({
          kind: 'products' as const,
          key: `${key}-${visibleProducts[index * columns].id}`,
          products: visibleProducts.slice(index * columns, index * columns + columns),
        })),
      ];
    });
  }, [items, expandedSections, searching, columns]);

  const navigateToRoot = (screen: 'Account' | 'LocationPicker') => {
    const rootNavigation = navigation.getParent('RootStack');
    if (!rootNavigation) {
      console.error(`Could not find the root navigator to open ${screen}.`);
      return;
    }
    rootNavigation.navigate(screen);
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
      if (generation === requestGeneration.current) setError(userFacingMessage(e, 'Could not load items.'));
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
      const message = userFacingMessage(e, 'Could not load items.');
      setError(message);
      console.error('Could not refresh customer products:', e);
    } finally {
      if (isActive() && generation === requestGeneration.current) setLoading(false);
    }
  }, [productLocation, filters]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refreshCatalog = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      await Promise.all([
        refreshProducts(() => mounted.current),
        fetchPromos().then((result) => {
          if (mounted.current) {
            setPromos(result);
            setPromoError(false);
          }
        }).catch((promoError: unknown) => {
          console.error('Could not refresh promotions:', promoError);
          if (mounted.current) setPromoError(true);
        }),
      ]);
    } finally {
      refreshInFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [refreshProducts]);

  useEffect(() => {
    if (startupData) return;
    fetchPromos().then((result) => {
      if (mounted.current) {
        setPromos(result);
        setPromoError(false);
      }
    }).catch((promoError: unknown) => {
      console.error('Could not load promotions:', promoError);
      if (mounted.current) setPromoError(true);
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
        <Pressable style={[styles.loc, glassElevated]} onPress={() => navigateToRoot('LocationPicker')} accessibilityRole="button" accessibilityLabel={`Change delivery location, currently ${place.label}`}>
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
              {place.label} <Ionicons name="chevron-down" size={14} color={tierTheme.icon} />
            </Text>
          </View>
        </Pressable>
        <Pressable style={styles.accountButton} onPress={() => navigateToRoot('Account')} accessibilityRole="button" accessibilityLabel="Open your account">
          <Ionicons name="person-outline" size={23} color={tierTheme.icon} />
        </Pressable>
        <CurrencySelector />
      </View>
      {ratesLoading && currency !== 'TZS'
        ? <Text style={styles.marketNote}>Loading {currency} exchange rate…</Text>
        : ratesUnavailable
          ? <Text style={styles.marketNote}>Exchange rates unavailable · showing TZS. Review the payment amount at checkout.</Text>
          : currency !== 'TZS'
            ? <Text style={styles.marketNote}>{currency} prices · rate dated {ratesUpdatedAt}. Review the supported payment currency at checkout.</Text>
            : null}

      <PromoSlider promos={promos} />
      {promoError && <Text style={styles.marketNote}>Promotions could not be refreshed. Pull down to try again.</Text>}

      <Text style={styles.q}>How are you shopping today?</Text>
      <ModeToggle />

      <Text style={[styles.section, { color: tierTheme.accent }]}>Shop by category</Text>
      <Text style={styles.intro}>Find farm produce and pantry essentials for your home or business, all in one place.</Text>
      <View style={styles.searchPanel}>
        <View style={[styles.searchBar, glassElevated, { borderColor: 'rgba(255,255,255,0.92)', backgroundColor: 'rgba(255,255,255,0.82)' }]}>
          <Ionicons name="search" size={20} color={tierTheme.icon} />
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
        <View style={styles.gridControls}>
          <Text style={styles.gridLabel}>Your view</Text>
          <View style={styles.gridOptions} accessibilityRole="radiogroup" accessibilityLabel="Product grid size">
            {([1, 2] as const).map((value) => (
              <Pressable key={value} onPress={() => setColumns(value)} accessibilityRole="radio" accessibilityState={{ checked: columns === value }} style={[styles.gridOption, columns === value && { backgroundColor: tierTheme.button }]}>
                <Ionicons name={value === 1 ? 'square-outline' : 'grid-outline'} size={16} color={columns === value ? tierTheme.buttonText : colors.ink} />
                <Text style={[styles.gridOptionText, columns === value && { color: tierTheme.buttonText }]}>{value === 1 ? 'Large' : 'Compact'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
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
            {item.count > 3 && (
              <Pressable
                onPress={() => setExpandedSections((sections) => ({ ...sections, [item.key.replace('heading-', '')]: !item.expanded }))}
                accessibilityRole="button"
                accessibilityState={{ expanded: item.expanded }}
                style={styles.seeMoreButton}
              >
                <Text style={[styles.seeMore, { color: tierTheme.accent }]}>{item.expanded ? 'See less' : 'See more'}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.productRow}>
            {item.products.map((product, productIndex) => (
              <ProductCard key={product.id} product={product} index={index + productIndex} wide={columns === 2 && item.products.length === 1} onPress={() => navigation.navigate('Product', { product })} />
            ))}
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={tierTheme.icon} style={{ margin: 32 }} />
          ) : error ? (
            <Text style={styles.err} onPress={() => void refreshProducts()}>{error} — tap to retry</Text>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="basket-outline" size={40} color={tierTheme.icon} />
              <Text style={styles.emptyTitle}>{searching ? 'No matching products' : 'No items in stock right now'}</Text>
              <Text style={styles.emptyText}>{searching ? 'Try another search or change your filters.' : 'New products will appear here as local farms add approved prices and available stock.'}</Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && items.length > 0 ? (
            <ActivityIndicator color={tierTheme.icon} style={{ margin: 24 }} />
          ) : error && items.length > 0 ? (
            <Text style={styles.err} onPress={() => void refreshProducts()}>{error} — tap to retry</Text>
          ) : hasMore && items.length > 0 ? (
            <Pressable onPress={() => void loadMore()} accessibilityRole="button"><Text style={[styles.seeMoreFooter, { color: tierTheme.accent }]}>Load more products</Text></Pressable>
          ) : null
        }
        onEndReachedThreshold={0.6}
        onEndReached={loadMore}
        refreshing={refreshing}
        onRefresh={() => { void refreshCatalog(); }}
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 },
  loc: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: 8, paddingRight: 10, gap: 10, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', backgroundColor: 'rgba(255,255,255,0.82)' },
  van: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  accountButton: { ...glass, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  currencyButton: { ...glass, minWidth: 52, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  currencyText: { color: colors.green, fontWeight: '900', fontSize: 12 },
  marketNote: { color: colors.muted, fontSize: 11, marginHorizontal: 20, marginTop: 4 },
  locSmall: { fontSize: 12, color: colors.muted },
  locBig: { fontSize: 18, fontWeight: '800', color: colors.ink },
  q: { fontSize: 20, fontWeight: '800', color: colors.ink, marginHorizontal: 20, marginTop: 22, marginBottom: 10 },
  section: { fontSize: 22, fontWeight: '900', color: colors.green, marginHorizontal: 20, marginTop: 22, marginBottom: 6 },
  intro: { marginHorizontal: 20, color: colors.muted, fontSize: 14, lineHeight: 20 },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  categoryTitle: { fontSize: 20, fontWeight: '900', color: colors.ink },
  categoryDescription: { marginTop: 3, marginRight: 8, color: colors.muted, fontSize: 12 },
  seeMore: { color: colors.green, fontWeight: '800' },
  seeMoreButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  seeMoreFooter: { color: colors.green, fontWeight: '800', textAlign: 'center', padding: 20 },
  productRow: { flexDirection: 'row', paddingHorizontal: 14 },
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
  gridControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  gridLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  gridOptions: { ...glass, flexDirection: 'row', borderRadius: 16, padding: 3 },
  gridOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 13 },
  gridOptionText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
});
