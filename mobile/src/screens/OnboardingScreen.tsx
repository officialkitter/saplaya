import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Atmosphere from '../components/Atmosphere';
import BrandMark from '../components/BrandMark';
import { colors, radius } from '../theme';

const slides = [
  {
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1400&q=88',
    eyebrow: 'FRESH FROM NEARBY FARMS',
    title: 'Good food, closer to home.',
    body: 'Shop seasonal produce selected from local growers and delivered to your door.',
    icon: 'basket-outline' as const,
  },
  {
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1400&q=88',
    eyebrow: 'YOUR SHOP, YOUR WAY',
    title: 'A little basket or a big one.',
    body: 'Choose everyday portions or switch to wholesale quantities when you need more.',
    icon: 'layers-outline' as const,
  },
  {
    image: 'https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=1400&q=88',
    eyebrow: 'DELIVERED WITH CARE',
    title: 'Harvest to home, made simple.',
    body: 'Choose a delivery window, follow your order and enjoy what is fresh today.',
    icon: 'time-outline' as const,
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<(typeof slides)[number]>>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.max(0, Math.min(slides.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))));
  };

  const finish = async () => {
    setBusy(true);
    try {
      await AsyncStorage.setItem('saplaya.onboarding.complete', 'true');
      navigation.replace('Authentication');
    } catch (error) {
      console.error('Could not save onboarding completion:', error);
      Alert.alert('Could not continue', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (page < slides.length - 1) {
      listRef.current?.scrollToIndex({ index: page + 1, animated: true });
      return;
    }
    void finish();
  };

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        keyExtractor={(slide) => slide.eyebrow}
        renderItem={({ item, index }) => (
          <ImageBackground source={{ uri: item.image }} style={[styles.slide, { width, height }]} resizeMode="cover">
            <LinearGradient
              colors={['rgba(8,25,11,0.28)', 'rgba(8,25,11,0.04)', 'rgba(8,25,11,0.8)']}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
            <MotiView
              key={`${index}-badge`}
              from={{ opacity: 0, scale: 0.9, translateY: 10 }}
              animate={{ opacity: 1, scale: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 450, delay: 120 }}
              style={styles.freshBadge}
            >
              <Ionicons name={item.icon} size={17} color={colors.green} />
              <Text style={styles.freshBadgeText}>Picked with care</Text>
            </MotiView>
            <View style={[styles.caption, { bottom: Math.max(220, height * 0.23) }]}>
              <Text style={styles.eyebrow}>{item.eyebrow}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
          </ImageBackground>
        )}
      />

      <Atmosphere variant="photo" />

      <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <BrandMark size={34} />
            <Text style={styles.brandName}>Sapla<Text style={styles.brandAccent}>ya</Text></Text>
          </View>
          <Pressable onPress={() => void finish()} disabled={busy} hitSlop={12} accessibilityRole="button">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${slides.length}`}>
            {slides.map((slide, index) => (
              <Pressable
                key={slide.eyebrow}
                onPress={() => listRef.current?.scrollToIndex({ index, animated: true })}
                accessibilityRole="button"
                accessibilityLabel={`Go to introduction page ${index + 1}`}
                style={[styles.dot, page === index && styles.dotActive]}
              />
            ))}
          </View>
          <Pressable style={[styles.primary, busy && styles.disabled]} onPress={next} disabled={busy}>
            <Text style={styles.primaryText}>{busy ? 'Please wait…' : page === slides.length - 1 ? 'Get started' : 'Continue'}</Text>
            {!busy && <Ionicons name="arrow-forward" size={20} color={colors.white} />}
          </Pressable>
          <Pressable style={styles.guest} onPress={() => void finish()} disabled={busy}>
            <Text style={styles.guestText}>Sign in or continue as guest</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.white} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#142418' },
  slide: { justifyContent: 'flex-end' },
  header: { paddingHorizontal: 22, paddingTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandName: { color: colors.white, fontSize: 22, fontWeight: '900', letterSpacing: -0.6 },
  brandAccent: { color: colors.yellow },
  skip: { color: colors.white, fontWeight: '800', fontSize: 14, padding: 8 },
  freshBadge: { position: 'absolute', top: '27%', left: 22, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.96)', paddingHorizontal: 12, paddingVertical: 9 },
  freshBadgeText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  caption: { position: 'absolute', left: 25, right: 25 },
  eyebrow: { color: '#FBE89C', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { marginTop: 10, color: colors.white, fontSize: 35, lineHeight: 42, fontWeight: '900', letterSpacing: -0.8 },
  body: { marginTop: 10, color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 23 },
  footer: { marginTop: 'auto', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 15 },
  dot: { width: 8, height: 8, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.52)' },
  dotActive: { width: 25, backgroundColor: colors.yellow },
  primary: { height: 56, borderRadius: radius.lg, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primaryText: { color: colors.white, fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.65 },
  guest: { minHeight: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 5 },
  guestText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
