import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { View as MotiView } from 'moti/build/components/view';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/StoreContext';
import { colors, radius, shadow } from '../theme';
import { volumeTierLabel } from '../lib/volume';
import { useCurrency } from '../lib/currency';

export default function CartScreen({ navigation }: any) {
  const { lines, setQty, subtotal, priceOf, tierOf } = useStore();
  const { formatPrice } = useCurrency();
  const hasUnpricedTier = lines.some((line) => priceOf(line.product, line.qty) === null);

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
      <SafeAreaView style={[styles.root, styles.empty]}>
        <MotiView from={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
          <Ionicons name="basket-outline" size={96} color={colors.greenLight} />
        </MotiView>
        <Text style={styles.emptyTitle}>Your basket is empty</Text>
        <Text style={styles.emptySub}>Pick something fresh from the shop.</Text>
        <Pressable style={styles.cta} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.ctaText}>Start shopping</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.h1}>Your basket</Text>
      <FlatList
        data={lines}
        keyExtractor={(l) => l.product.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 160 }}
        renderItem={({ item }) => (
          <View style={[styles.line, shadow]}>
            {item.product.image_url ? (
              <Image source={{ uri: item.product.image_url }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.imageFallback]}>
                <Ionicons name="leaf-outline" size={22} color={colors.green} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name} numberOfLines={1}>{item.product.name}</Text>
              <Text style={styles.price}>
                {priceOf(item.product, item.qty) === null ? 'Bulk price not set' : formatPrice((priceOf(item.product, item.qty) ?? 0) * item.qty)}
              </Text>
              <Text style={[styles.tierLabel, (tierOf(item.product, item.qty) === 'bulk' || tierOf(item.product, item.qty) === 'mega_bulk') && styles.bulkTier]}>
                {volumeTierLabel(tierOf(item.product, item.qty))}
              </Text>
              <View style={styles.stepper}>
                <Pressable onPress={() => setQty(item.product.id, item.qty - 1)} style={styles.sBtn} accessibilityLabel={`Decrease ${item.product.name} quantity`}><Ionicons name="remove" size={20} color={colors.green} /></Pressable>
                <QuantityInput qty={item.qty} onChange={(qty) => setQty(item.product.id, qty)} />
                <Pressable onPress={() => setQty(item.product.id, item.qty + 1)} style={styles.sBtn} accessibilityLabel={`Increase ${item.product.name} quantity`}><Ionicons name="add" size={20} color={colors.green} /></Pressable>
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
            <Row label="Items" value={formatPrice(subtotal)} />
            <Text style={styles.dist}>Farm availability, delivery distance and fees are confirmed at checkout.</Text>
          </View>
        }
      />
      <View style={styles.bar}>
        <View>
          <Text style={styles.totalLabel}>Items</Text>
          <Text style={styles.total}>{formatPrice(subtotal)}</Text>
        </View>
        <Pressable style={[styles.cta, hasUnpricedTier && styles.disabled, { flex: 1, marginLeft: 16 }]} onPress={openCheckout} disabled={hasUnpricedTier}>
          <Text style={styles.ctaText}>{hasUnpricedTier ? 'Bulk price not available' : 'Continue to checkout'}</Text>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowL: { color: colors.muted, fontSize: 15 },
  rowV: { fontWeight: '800', color: colors.ink, fontSize: 15 },
  dist: { marginTop: 6, color: colors.muted, fontSize: 12 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, ...shadow },
  totalLabel: { color: colors.muted, fontSize: 13 },
  total: { fontSize: 22, fontWeight: '900', color: colors.ink },
  cta: { minHeight: 58, borderRadius: radius.lg, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  disabled: { opacity: 0.65 },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '900', textAlign: 'center' },
});
