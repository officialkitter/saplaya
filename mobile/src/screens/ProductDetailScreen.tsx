import React, { useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { View as MotiView } from 'moti/build/components/view';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { useFly } from '../store/FlyContext';
import { colors, radius, volumeTheme } from '../theme';
import { Product } from '../types';
import { useCurrency } from '../lib/currency';
import CelebrationModal from '../components/CelebrationModal';
import { unlockedVolumeTier } from '../lib/volume';

const H = Dimensions.get('window').height;

function harvestedText(iso: string) {
  const hrs = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3600000));
  return hrs >= 24 ? `Harvested ${Math.round(hrs / 24)} day${hrs >= 48 ? 's' : ''} ago` : `Harvested ${hrs} hours ago`;
}

export default function ProductDetailScreen({ route, navigation }: any) {
  const product: Product = route.params.product;
  const { baseMode, priceOf, tierOf, add, lines } = useStore();
  const { formatPrice } = useCurrency();
  const { fly } = useFly();
  const insets = useSafeAreaInsets();

  const minQty = baseMode === 'wholesale' ? product.wholesale_min_qty : 1;
  const [qty, setQty] = useState(minQty);
  const [qtyText, setQtyText] = useState(String(minQty));
  const unitPrice = priceOf(product, qty);
  const tier = tierOf(product, qty);
  const tierTheme = volumeTheme(tier);
  const [pressed, setPressed] = useState(false);
  const [unlocked, setUnlocked] = useState<{ tier: 'bulk' | 'mega_bulk'; inBasket: boolean } | null>(null);
  const btn = useRef<View>(null);

  const updateQuantity = (next: number) => {
    const newTier = unlockedVolumeTier(product, qty, next, baseMode);
    if (newTier) setUnlocked({ tier: newTier, inBasket: false });
    setQty(next);
  };

  const onAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPressed(true);
    setTimeout(() => setPressed(false), 140);
    btn.current?.measureInWindow((x, y, w, h) => fly({ x: x + w / 2, y: y + h / 2 }));
    const previousQty = lines.find((line) => line.product.id === product.id)?.qty ?? 0;
    const newTier = unlockedVolumeTier(product, previousQty, previousQty + qty, baseMode);
    if (previousQty > 0 && newTier && newTier !== tier) setUnlocked({ tier: newTier, inBasket: true });
    add(product, qty);
  };

  return (
    <View style={[styles.root, { backgroundColor: tierTheme.background }]}>
      {/* Product photo */}
      <View style={styles.hero}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
            <MaterialCommunityIcons name="food-apple-outline" size={68} color={colors.green} />
          </View>
        )}
        <Pressable onPress={() => navigation.goBack()} style={[styles.back, { top: insets.top + 8 }]} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
      </View>

      {/* Product details and quantity controls */}
      <MotiView
        from={{ translateY: H * 0.48 }}
        animate={{ translateY: 0 }}
        transition={{ type: 'spring', damping: 16, stiffness: 120 }}
        style={[styles.sheet, { backgroundColor: tierTheme.surface, borderTopColor: tierTheme.accent, borderTopWidth: tier === 'retail' || tier === 'wholesale' ? 0 : 4, paddingBottom: Math.max(insets.bottom, 18) }]}
      >
        <View style={[styles.badge, { backgroundColor: tierTheme.soft }]}>
          <MaterialCommunityIcons name="barley" size={18} color={tierTheme.accent} />
          <Text numberOfLines={1} style={[styles.badgeText, { color: tierTheme.accent }]}>Open-field farm · {harvestedText(product.harvested_at)}</Text>
        </View>

        <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
        <Text style={[styles.price, { color: tierTheme.accent }]}>
          {unitPrice === null ? 'Final price at checkout' : formatPrice(unitPrice)} <Text style={styles.unit}>per {product.unit}</Text>
        </Text>
        <Text style={styles.orderTotal}>
          {unitPrice === null ? 'Total confirmed at checkout' : `Order total · ${formatPrice(unitPrice * qty)}`}
        </Text>

        <View style={styles.actions}>
          <View style={styles.stepper}>
            <Pressable onPress={() => {
              const next = Math.max(minQty, qty - 1);
              updateQuantity(next);
              setQtyText(String(next));
            }} style={styles.stepBtn} accessibilityLabel="Less">
              <Ionicons name="remove" size={26} color={colors.green} />
            </Pressable>
            <TextInput
              value={qtyText}
              onChangeText={(value) => {
                setQtyText(value);
                if (/^\d*\.?\d*$/.test(value) && value !== '') {
                  const parsed = Number(value);
                  if (parsed > 0 && parsed <= 10000) updateQuantity(parsed);
                }
              }}
              keyboardType="decimal-pad"
              onEndEditing={({ nativeEvent }) => {
                const parsed = Number(nativeEvent.text);
                const next = !Number.isFinite(parsed) || parsed < minQty || parsed > 10000 ? minQty : parsed;
                updateQuantity(next);
                setQtyText(String(next));
              }}
              style={styles.qty}
              accessibilityLabel="Enter product quantity"
            />
            <Pressable onPress={() => {
              const next = Math.min(10000, qty + 1);
              updateQuantity(next);
              setQtyText(String(next));
            }} style={styles.stepBtn} accessibilityLabel="More" disabled={qty >= 10000}>
              <Ionicons name="add" size={26} color={colors.green} />
            </Pressable>
          </View>

          <View ref={btn} collapsable={false} style={styles.addButtonWrap}>
            <MotiView
              animate={{ scale: pressed ? 0.9 : 1 }}
              transition={{ type: 'spring', damping: 10, stiffness: 300 }}
            >
              <Pressable
                onPress={onAdd}
                style={[styles.addBtn, { backgroundColor: tierTheme.button }]}
                accessibilityRole="button"
                accessibilityLabel={`Add ${qty} ${product.unit} to basket${unitPrice === null ? '' : ` for ${formatPrice(unitPrice * qty)}`}`}
              >
                <Ionicons name="cart" size={20} color={tierTheme.buttonText} />
                <Text numberOfLines={1} style={[styles.addText, { color: tierTheme.buttonText }]}>Add to basket</Text>
              </Pressable>
            </MotiView>
            <CelebrationModal
              visible={unlocked !== null}
              volumeTier={unlocked?.tier}
              title={`Congratulations! ${unlocked?.tier === 'mega_bulk' ? 'Mega-bulk' : 'Bulk'} unlocked`}
              message={`${product.name} now qualifies for ${unlocked?.tier === 'mega_bulk' ? 'mega-bulk' : 'bulk'} pricing${unlocked?.inBasket ? ' in your basket' : ''}.`}
              detail={unlocked?.inBasket ? 'Your combined basket quantity qualifies for this price.' : 'The price shown is per unit for this product and quantity.'}
              buttonLabel="Continue shopping"
              onClose={() => setUnlocked(null)}
            />
          </View>
        </View>
      </MotiView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  hero: { height: '54%', backgroundColor: colors.line },
  imageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9' },
  back: { position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%', backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  badgeText: { flexShrink: 1, color: colors.green, fontWeight: '800', fontSize: 13 },
  name: { fontSize: 26, fontWeight: '900', color: colors.ink, marginTop: 10 },
  price: { fontSize: 21, fontWeight: '800', color: colors.green, marginTop: 4 },
  unit: { fontSize: 14, color: colors.muted, fontWeight: '500' },
  orderTotal: { color: colors.muted, fontWeight: '700', fontSize: 14, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 'auto', marginBottom: 4, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F8E9', borderRadius: radius.lg, padding: 4 },
  stepBtn: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 38, textAlign: 'center', fontSize: 17, fontWeight: '900', color: colors.ink, paddingVertical: 8 },
  addButtonWrap: { flex: 1, minWidth: 0 },
  addBtn: { minHeight: 54, borderRadius: radius.lg, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  disabled: { backgroundColor: colors.muted },
  addText: { flexShrink: 1, color: colors.white, fontSize: 14, fontWeight: '900' },
});
