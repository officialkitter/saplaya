import React, { useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { View as MotiView } from 'moti/build/components/view';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { Product } from '../types';
import { useStore } from '../store/StoreContext';
import { colors, glass, glassElevated, radius, volumeTheme } from '../theme';
import { useCurrency } from '../lib/currency';
import { quickAddQuantity } from '../lib/volume';
import { useFly } from '../store/FlyContext';
import ProductImage from './ProductImage';

export default function ProductCard({ product, index, wide, onPress }: { product: Product; index: number; wide?: boolean; onPress: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const buttonRef = useRef<View>(null);
  const reduceMotion = useReducedMotion();
  const { fly } = useFly();
  const { mode, baseMode, priceOf, lines, add } = useStore();
  const tierTheme = volumeTheme(mode);
  const { formatPrice } = useCurrency();
  const qty = lines.find((line) => line.product.id === product.id)?.qty ?? 0;
  const increment = quickAddQuantity(product, qty, baseMode);
  const price = priceOf(product, qty + increment || 1);
  return (
    <MotiView
      from={reduceMotion ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: 18 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: reduceMotion ? 0 : 350, delay: reduceMotion ? 0 : (index % 6) * 50 }}
      style={styles.wrap}
    >
      <View style={[styles.card, glassElevated]}>
        <Pressable
          onPress={() => setRevealed((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={`${revealed ? 'Hide' : 'Show'} details for ${product.name}`}
          accessibilityState={{ expanded: revealed }}
          style={({ pressed }) => pressed && !reduceMotion ? { transform: [{ scale: 0.98 }] } : undefined}
        >
          <ProductImage
            uri={product.image_url}
            name={product.name}
            style={[styles.img, wide && styles.wideImage]}
            fallbackColor={tierTheme.soft}
            iconColor={tierTheme.icon}
          />
        </Pressable>
        {revealed && (
          <MotiView
            from={reduceMotion ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: reduceMotion ? 0 : 180 }}
            style={styles.body}
          >
            <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
            <Text style={styles.description}>{product.category} · sold per {product.unit}</Text>
            <Text style={[styles.price, { color: tierTheme.accent }]}>
              {price === null ? 'Confirmed at checkout' : formatPrice(price)}
              <Text style={styles.unit}> / {product.unit}</Text>
            </Text>
            {baseMode === 'wholesale' && <Text style={[styles.min, { color: tierTheme.accent }]}>Min {product.wholesale_min_qty} {product.unit}</Text>}
            {typeof product.farm_distance_km === 'number' && <Text style={styles.distance}>{product.farm_distance_km.toFixed(1)} km away</Text>}
            {qty > 0 && <Text accessibilityLiveRegion="polite" style={styles.distance}>{qty} {product.unit} in your basket</Text>}
            <Pressable
              ref={buttonRef}
              collapsable={false}
              onPress={() => {
                if (!increment) return;
                if (!reduceMotion) buttonRef.current?.measureInWindow((x, y, width, height) => fly({ x: x + width / 2, y: y + height / 2 }));
                add(product, increment);
                AccessibilityInfo.announceForAccessibility(`${product.name} added to your basket`);
              }}
              disabled={!increment}
              accessibilityRole="button"
              accessibilityLabel={`Add ${product.name} to basket`}
              accessibilityState={{ disabled: !increment }}
              style={({ pressed }) => [styles.add, { backgroundColor: tierTheme.button }, !increment && styles.disabled, pressed && !reduceMotion && styles.pressed]}
            >
              <Ionicons name="basket-outline" size={18} color={tierTheme.buttonText} />
              <Text style={[styles.addText, { color: tierTheme.buttonText }]}>{increment ? 'Add to basket' : 'Unavailable'}</Text>
            </Pressable>
            <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`View ${product.name} details`} style={styles.details}>
              <Text style={[styles.detailsText, { color: tierTheme.accent }]}>View details</Text>
            </Pressable>
          </MotiView>
        )}
      </View>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 6 },
  card: { backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)', borderRadius: radius.lg, overflow: 'hidden' },
  img: { width: '100%', aspectRatio: 1, backgroundColor: colors.line },
  wideImage: { aspectRatio: 2 },
  body: { ...glass, padding: 12 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  description: { marginTop: 3, fontSize: 12, color: colors.muted },
  price: { fontSize: 17, fontWeight: '800', color: colors.green, marginTop: 4 },
  unit: { fontSize: 13, fontWeight: '500', color: colors.muted },
  min: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.yellowDeep },
  distance: { marginTop: 4, fontSize: 10, fontWeight: '700', color: colors.muted },
  add: { minHeight: 44, marginTop: 10, paddingHorizontal: 8, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  addText: { flexShrink: 1, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { transform: [{ scale: 0.96 }] },
  details: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  detailsText: { fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
});
