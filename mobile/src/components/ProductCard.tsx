import React, { useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { View as MotiView } from 'moti/build/components/view';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { Product } from '../types';
import { useStore } from '../store/StoreContext';
import { colors, radius, shadow, volumeTheme } from '../theme';
import { useCurrency } from '../lib/currency';
import { quickAddQuantity } from '../lib/volume';

export default function ProductCard({ product, index, onPress }: { product: Product; index: number; onPress: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const reduceMotion = useReducedMotion();
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
      <View style={[styles.card, shadow]}>
        <Pressable
          onPress={() => setRevealed((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={`${revealed ? 'Hide' : 'Show'} details for ${product.name}`}
          accessibilityState={{ expanded: revealed }}
          style={({ pressed }) => pressed && !reduceMotion ? { transform: [{ scale: 0.98 }] } : undefined}
        >
          {product.image_url ? (
            <Image source={{ uri: product.image_url }} style={styles.img} contentFit="cover" transition={reduceMotion ? 0 : 250} />
          ) : (
            <View style={[styles.img, styles.imageFallback, { backgroundColor: tierTheme.soft }]}>
              <Ionicons name="leaf-outline" size={42} color={tierTheme.icon} />
            </View>
          )}
        </Pressable>
        {revealed && (
          <MotiView
            from={reduceMotion ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: reduceMotion ? 0 : 180 }}
            style={styles.body}
          >
            <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
            <Text style={[styles.price, { color: tierTheme.accent }]}>
              {price === null ? 'Confirmed at checkout' : formatPrice(price)}
              <Text style={styles.unit}> / {product.unit}</Text>
            </Text>
            {baseMode === 'wholesale' && <Text style={[styles.min, { color: tierTheme.accent }]}>Min {product.wholesale_min_qty} {product.unit}</Text>}
            {typeof product.farm_distance_km === 'number' && <Text style={styles.distance}>{product.farm_distance_km.toFixed(1)} km away</Text>}
            {qty > 0 && <Text accessibilityLiveRegion="polite" style={styles.distance}>{qty} {product.unit} in your basket</Text>}
            <Pressable
              onPress={() => {
                if (!increment) return;
                add(product, increment);
                AccessibilityInfo.announceForAccessibility(`${product.name} added to your basket`);
              }}
              disabled={!increment}
              accessibilityRole="button"
              accessibilityLabel={`Add ${product.name} to basket`}
              accessibilityState={{ disabled: !increment }}
              style={[styles.add, { backgroundColor: tierTheme.button }, !increment && styles.disabled]}
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
  card: { backgroundColor: colors.white, borderRadius: radius.md, overflow: 'hidden' },
  img: { width: '100%', aspectRatio: 1, backgroundColor: colors.line },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 12 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  price: { fontSize: 17, fontWeight: '800', color: colors.green, marginTop: 4 },
  unit: { fontSize: 13, fontWeight: '500', color: colors.muted },
  min: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.yellowDeep },
  distance: { marginTop: 4, fontSize: 10, fontWeight: '700', color: colors.muted },
  add: { minHeight: 44, marginTop: 10, paddingHorizontal: 8, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  addText: { flexShrink: 1, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  details: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  detailsText: { fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
});
