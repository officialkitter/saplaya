import React from 'react';
import { Dimensions, FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Promo } from '../types';
import { colors, radius, shadow } from '../theme';
import ProductImage from './ProductImage';

const W = Dimensions.get('window').width;
const CARD_W = W - 56;

export default function PromoSlider({ promos }: { promos: Promo[] }) {
  return (
    <FlatList
      data={promos}
      horizontal
      keyExtractor={(p) => p.id}
      showsHorizontalScrollIndicator={false}
      initialNumToRender={1}
      maxToRenderPerBatch={1}
      windowSize={2}
      snapToInterval={CARD_W + 12}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
      renderItem={({ item }) => (
        <View style={[styles.card, shadow]}>
          <ProductImage
            uri={item.image_url}
            name={item.title}
            style={StyleSheet.absoluteFill}
            fallbackColor={colors.green}
            iconColor={colors.white}
          />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFill} />
          <View style={styles.chip}>
            <Text style={styles.chipText}>{item.kind === 'farm_box' ? 'FARM BOX' : "CHEF'S KIT"}</Text>
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>{item.title}</Text>
            {!!item.subtitle && <Text style={styles.sub}>{item.subtitle}</Text>}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_W, height: 170, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.line },
  chip: { position: 'absolute', top: 12, left: 12, backgroundColor: colors.yellow, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 11, fontWeight: '800', color: colors.ink, letterSpacing: 0.8 },
  text: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  title: { color: colors.white, fontSize: 20, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 2 },
});
