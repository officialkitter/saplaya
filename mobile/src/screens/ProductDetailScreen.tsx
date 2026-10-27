import React, { useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MotiView } from 'moti';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/StoreContext';
import { useFly } from '../store/FlyContext';
import { colors, formatTZS, radius } from '../theme';
import { Product } from '../types';

const H = Dimensions.get('window').height;

function harvestedText(iso: string) {
  const hrs = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3600000));
  return hrs >= 24 ? `Harvested ${Math.round(hrs / 24)} day${hrs >= 48 ? 's' : ''} ago` : `Harvested ${hrs} hours ago`;
}

export default function ProductDetailScreen({ route, navigation }: any) {
  const product: Product = route.params.product;
  const { mode, priceOf, add } = useStore();
  const { fly } = useFly();
  const insets = useSafeAreaInsets();

  const minQty = mode === 'wholesale' ? product.wholesale_min_qty : 1;
  const unavailable = product.stock < minQty;
  const [qty, setQty] = useState(minQty);
  const [pressed, setPressed] = useState(false);
  const btn = useRef<View>(null);

  const onAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPressed(true);
    setTimeout(() => setPressed(false), 140);
    btn.current?.measureInWindow((x, y, w, h) => fly({ x: x + w / 2, y: y + h / 2 }));
    add(product, qty);
  };

  return (
    <View style={styles.root}>
      {/* 60% hero */}
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

      {/* 40% sliding sheet */}
      <MotiView
        from={{ translateY: H * 0.4 }}
        animate={{ translateY: 0 }}
        transition={{ type: 'spring', damping: 16, stiffness: 120 }}
        style={styles.sheet}
      >
        <View style={styles.badge}>
          <MaterialCommunityIcons name="barley" size={18} color={colors.green} />
          <Text style={styles.badgeText}>Open-field farm · {harvestedText(product.harvested_at)}</Text>
        </View>

        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>
          {formatTZS(priceOf(product))} <Text style={styles.unit}>per {product.unit}</Text>
        </Text>
        {mode === 'wholesale' && <Text style={styles.min}>Wholesale: minimum {product.wholesale_min_qty} {product.unit}</Text>}

        <View style={styles.actions}>
          <View style={styles.stepper}>
            <Pressable onPress={() => setQty((q) => Math.max(minQty, q - 1))} style={styles.stepBtn} accessibilityLabel="Less">
              <Ionicons name="remove" size={26} color={colors.green} />
            </Pressable>
            <Text style={styles.qty}>{qty}</Text>
            <Pressable onPress={() => setQty((q) => Math.min(product.stock, q + 1))} style={styles.stepBtn} accessibilityLabel="More" disabled={unavailable || qty >= product.stock}>
              <Ionicons name="add" size={26} color={colors.green} />
            </Pressable>
          </View>

          <View ref={btn} collapsable={false} style={{ flex: 1 }}>
            <MotiView
              animate={{ scale: pressed ? 0.9 : 1 }}
              transition={{ type: 'spring', damping: 10, stiffness: 300 }}
            >
              <Pressable onPress={onAdd} style={[styles.addBtn, unavailable && styles.disabled]} disabled={unavailable}>
                <Ionicons name="cart" size={22} color={colors.white} />
                <Text style={styles.addText}>{unavailable ? 'Currently unavailable' : `Add · ${formatTZS(priceOf(product) * qty)}`}</Text>
              </Pressable>
            </MotiView>
          </View>
        </View>
      </MotiView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  hero: { height: '60%', backgroundColor: colors.line },
  imageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9' },
  back: { position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '41%', backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 22, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, elevation: 12 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  badgeText: { color: colors.green, fontWeight: '800', fontSize: 13 },
  name: { fontSize: 28, fontWeight: '900', color: colors.ink, marginTop: 14 },
  price: { fontSize: 22, fontWeight: '800', color: colors.green, marginTop: 4 },
  unit: { fontSize: 15, color: colors.muted, fontWeight: '500' },
  min: { marginTop: 6, color: colors.yellowDeep, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 'auto', marginBottom: 6, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F8E9', borderRadius: radius.lg, padding: 4 },
  stepBtn: { width: 48, height: 52, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 34, textAlign: 'center', fontSize: 20, fontWeight: '900', color: colors.ink },
  addBtn: { height: 60, borderRadius: radius.lg, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { backgroundColor: colors.muted },
  addText: { color: colors.white, fontSize: 18, fontWeight: '900' },
});
