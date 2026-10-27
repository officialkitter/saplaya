import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MotiView } from 'moti';
import { Product } from '../types';
import { useStore } from '../store/StoreContext';
import { colors, formatTZS, radius, shadow } from '../theme';

export default function ProductCard({ product, index, onPress }: { product: Product; index: number; onPress: () => void }) {
  const { mode, priceOf } = useStore();
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
            {formatTZS(priceOf(product))}
            <Text style={styles.unit}> / {product.unit}</Text>
          </Text>
          {mode === 'wholesale' && <Text style={styles.min}>Min {product.wholesale_min_qty} {product.unit}</Text>}
          {product.stock < (mode === 'wholesale' ? product.wholesale_min_qty : 1) && (
            <Text style={styles.soldOut}>{product.stock <= 0 ? 'Sold out' : 'Below wholesale minimum'}</Text>
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
  soldOut: { marginTop: 5, fontSize: 12, fontWeight: '800', color: '#C62828' },
});
