import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { View as MotiView } from 'moti/build/components/view';
import { Product } from '../types';
import { useStore } from '../store/StoreContext';
import { colors, radius, shadow } from '../theme';
import { useCurrency } from '../lib/currency';

export default function ProductCard({ product, index, onPress }: { product: Product; index: number; onPress: () => void }) {
  const { mode, priceOf } = useStore();
  const { formatPrice } = useCurrency();
  return (
    <MotiView
      from={{ opacity: 0, translateY: 18 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 350, delay: (index % 6) * 50 }}
      style={styles.wrap}
    >
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, shadow, pressed && { transform: [{ scale: 0.97 }] }]}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.img} contentFit="cover" transition={250} />
        ) : (
          <View style={[styles.img, styles.imageFallback]}>
            <Text style={styles.imageFallbackIcon}>🥬</Text>
          </View>
        )}
        <View style={styles.body}>
          <Text numberOfLines={1} style={styles.name}>{product.name}</Text>
          <Text style={styles.price}>
            {formatPrice(priceOf(product) ?? 0)}
            <Text style={styles.unit}> / {product.unit}</Text>
          </Text>
          {mode === 'wholesale' && <Text style={styles.min}>Min {product.wholesale_min_qty} {product.unit}</Text>}
          {typeof product.farm_distance_km === 'number' && (
            <Text style={styles.distance}>{product.farm_distance_km.toFixed(1)} km away</Text>
          )}
        </View>
      </Pressable>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 6 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, overflow: 'hidden' },
  img: { width: '100%', aspectRatio: 1, backgroundColor: colors.line },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  imageFallbackIcon: { fontSize: 42 },
  body: { padding: 12 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  price: { fontSize: 17, fontWeight: '800', color: colors.green, marginTop: 4 },
  unit: { fontSize: 13, fontWeight: '500', color: colors.muted },
  min: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.yellowDeep },
  distance: { marginTop: 4, fontSize: 10, fontWeight: '700', color: colors.muted },
});
