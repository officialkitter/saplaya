import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { View as MotiView } from 'moti/build/components/view';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/StoreContext';
import { colors, radius, shadow, volumeTheme } from '../theme';
import { unlockedVolumeTier, volumeTierLabel } from '../lib/volume';
import { useCurrency } from '../lib/currency';
import CelebrationModal from '../components/CelebrationModal';
import type { CartLine } from '../types';

export default function CartScreen({ navigation }: any) {
  const { lines, setQty, subtotal, priceOf, tierOf, mode, baseMode } = useStore();
  const { formatPrice } = useCurrency();
  const [unlocked, setUnlocked] = useState<{ name: string; tier: 'bulk' | 'mega_bulk' } | null>(null);
  const activeTier = lines.reduce<'retail' | 'wholesale' | 'bulk' | 'mega_bulk'>((highest, line) => {
    const tier = tierOf(line.product, line.qty);
    const rank = { retail: 0, wholesale: 1, bulk: 2, mega_bulk: 3 };
    return rank[tier] > rank[highest] ? tier : highest;
  }, mode);
  const tierTheme = volumeTheme(activeTier);

  const updateQuantity = (line: CartLine, qty: number) => {
    const tier = unlockedVolumeTier(line.product, line.qty, qty, baseMode);
    if (tier) setUnlocked({ name: line.product.name, tier });
    setQty(line.product.id, qty);
  };

  const openCheckout = () => {
    const rootNavigation = navigation.getParent('RootStack');
    if (!rootNavigation) {
      console.error('Could not find the root navigator to open checkout.');
      return;
    }
    rootNavigation.navigate('Checkout');
  };

  if (lines.length === 0) {
    return (
      <SafeAreaView style={[styles.root, styles.empty, { backgroundColor: tierTheme.background }]}>
        <MotiView from={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
          <Ionicons name="basket-outline" size={96} color={tierTheme.icon} />
        </MotiView>
        <Text style={styles.emptyTitle}>Your basket is empty</Text>
        <Text style={styles.emptySub}>Pick something fresh from the shop.</Text>
        <Pressable style={[styles.cta, { backgroundColor: tierTheme.button }]} onPress={() => navigation.navigate('Home')}>
          <Text style={[styles.ctaText, { color: tierTheme.buttonText }]}>Start shopping</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tierTheme.background }]} edges={['top']}>
      <Text style={[styles.h1, { color: tierTheme.accent }]}>{activeTier === 'mega_bulk' ? 'Mega-bulk basket' : activeTier === 'bulk' ? 'Bulk basket' : 'Your basket'}</Text>
      <FlatList
        data={lines}
        keyExtractor={(l) => l.product.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 160 }}
        renderItem={({ item }) => (
          <View style={[styles.line, shadow, { borderColor: tierTheme.accent + '55' }]}>
            {item.product.image_url ? (
              <Image source={{ uri: item.product.image_url }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.imageFallback]}>
                <Ionicons name="leaf-outline" size={22} color={tierTheme.icon} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name} numberOfLines={1}>{item.product.name}</Text>
              <Text style={[styles.price, { color: tierTheme.accent }]}>
                {priceOf(item.product, item.qty) === null ? 'Price confirmed at checkout' : formatPrice((priceOf(item.product, item.qty) ?? 0) * item.qty)}
              </Text>
              <Text style={[styles.tierLabel, { color: volumeTheme(tierOf(item.product, item.qty)).accent }]}>
                {volumeTierLabel(tierOf(item.product, item.qty))}
              </Text>
              <View style={[styles.stepper, { backgroundColor: tierTheme.soft }]}>
                <Pressable onPress={() => updateQuantity(item, item.qty - 1)} style={styles.sBtn} accessibilityLabel={`Decrease ${item.product.name} quantity`}><Ionicons name="remove" size={20} color={tierTheme.icon} /></Pressable>
                <QuantityInput qty={item.qty} onChange={(qty) => updateQuantity(item, qty)} />
                <Pressable onPress={() => updateQuantity(item, item.qty + 1)} style={styles.sBtn} accessibilityLabel={`Increase ${item.product.name} quantity`}><Ionicons name="add" size={20} color={tierTheme.icon} /></Pressable>
              </View>
              <Pressable style={styles.remove} onPress={() => setQty(item.product.id, 0)} accessibilityRole="button">
                <Ionicons name="trash-outline" size={15} color="#C62828" />
                <Text style={styles.removeText}>Remove item</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.summary}>
            <Row label="Estimated items" value={subtotal === null ? 'Confirmed at checkout' : formatPrice(subtotal)} />
            <Text style={styles.dist}>Farm availability, delivery distance and fees are confirmed at checkout.</Text>
          </View>
        }
      />
      <View style={styles.bar}>
        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>Estimate</Text>
          <Text style={[styles.total, { color: tierTheme.accent }]}>{subtotal === null ? 'At checkout' : formatPrice(subtotal)}</Text>
        </View>
        <CelebrationModal
          visible={unlocked !== null}
          volumeTier={unlocked?.tier}
          title={`Congratulations! ${unlocked?.tier === 'mega_bulk' ? 'Mega-bulk' : 'Bulk'} unlocked`}
          message={`${unlocked?.name ?? 'Your item'} now qualifies for ${unlocked?.tier === 'mega_bulk' ? 'mega-bulk' : 'bulk'} pricing.`}
          detail="The price applies to this product and quantity in your basket."
          buttonLabel="Back to basket"
          onClose={() => setUnlocked(null)}
        />
        <Pressable style={[styles.cta, { flex: 1, marginLeft: 12, backgroundColor: tierTheme.button }]} onPress={openCheckout} accessibilityRole="button">
          <Text numberOfLines={2} style={[styles.ctaText, { color: tierTheme.buttonText }]}>Checkout</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function QuantityInput({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  const [value, setValue] = useState(String(qty));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setValue(String(qty));
  }, [qty, editing]);

  return (
    <TextInput
      value={value}
      onChangeText={(text) => {
        setValue(text);
        if (/^\d*\.?\d*$/.test(text) && Number(text) > 0 && Number(text) <= 10000) onChange(Number(text));
      }}
      onFocus={() => setEditing(true)}
      onEndEditing={() => {
        const parsed = Number(value);
        const next = Number.isFinite(parsed) && parsed > 0 && parsed <= 10000 ? parsed : qty;
        setValue(String(next));
        onChange(next);
        setEditing(false);
      }}
      keyboardType="decimal-pad"
      accessibilityLabel="Enter basket quantity"
      style={styles.qtyInput}
    />
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowL}>{label}</Text>
      <Text style={[styles.rowV, accent && { color: colors.green }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { fontSize: 24, fontWeight: '900', color: colors.ink, marginTop: 14 },
  emptySub: { color: colors.muted, marginTop: 4, marginBottom: 22 },
  h1: { fontSize: 30, fontWeight: '900', color: colors.green, marginHorizontal: 20, marginTop: 8 },
  line: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.md, padding: 10, marginBottom: 12 },
  thumb: { width: 84, height: 84, borderRadius: radius.sm, backgroundColor: colors.line },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', color: colors.ink },
  price: { fontSize: 16, fontWeight: '800', color: colors.green, marginTop: 2 },
  tierLabel: { color: colors.green, fontWeight: '800', fontSize: 12, marginTop: 3 },
  bulkTier: { color: colors.bulk },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#F1F8E9', borderRadius: 14 },
  sBtn: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { minWidth: 54, textAlign: 'center', fontWeight: '900', color: colors.ink, paddingVertical: 6 },
  remove: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingVertical: 7 },
  removeText: { color: '#C62828', fontSize: 12, fontWeight: '800' },
  summary: { backgroundColor: colors.white, borderRadius: radius.md, padding: 16, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6 },
  rowL: { flex: 1, color: colors.muted, fontSize: 15 },
  rowV: { flexShrink: 1, fontWeight: '800', color: colors.ink, fontSize: 15, textAlign: 'right' },
  dist: { marginTop: 6, color: colors.muted, fontSize: 12 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, ...shadow },
  totalBlock: { flexShrink: 1, minWidth: 0 },
  totalLabel: { color: colors.muted, fontSize: 13 },
  total: { flexShrink: 1, fontSize: 20, fontWeight: '900', color: colors.ink },
  cta: { minHeight: 58, borderRadius: radius.lg, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  disabled: { opacity: 0.65 },
  ctaText: { flexShrink: 1, color: colors.white, fontSize: 15, fontWeight: '900', lineHeight: 19, textAlign: 'center' },
});
