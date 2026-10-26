import React, { useRef, useState } from 'react';
import { Alert, Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

const { width, height } = Dimensions.get('window');
const slides = [
  {
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=85',
    eyebrow: 'FRESH FROM NEARBY FARMS',
    title: 'Good food, closer to home.',
    body: 'Shop seasonal produce selected from local growers and delivered to your door.',
    icon: 'leaf-outline' as const,
  },
  {
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=85',
    eyebrow: 'YOUR SHOP, YOUR WAY',
    title: 'A little basket or a big one.',
    body: 'Choose everyday retail portions or switch to wholesale quantities whenever you need more.',
    icon: 'basket-outline' as const,
  },
  {
    image: 'https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=1200&q=85',
    eyebrow: 'DELIVERED WITH CARE',
    title: 'Harvest to home, made simple.',
    body: 'Pick a delivery window, follow your order and enjoy what is fresh today.',
    icon: 'time-outline' as const,
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const finish = async () => {
    setBusy(true);
    try {
      await AsyncStorage.setItem('saplaya.onboarding.complete', 'true');
      navigation.replace('Authentication');
    } catch (error) {
      Alert.alert('Could not continue', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (page < slides.length - 1) {
      scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
      return;
    }
    void finish();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Ionicons name="leaf" size={19} color={colors.white} /></View>
          <Text style={styles.brandName}>Sapla<Text style={styles.brandAccent}>ya</Text></Text>
        </View>
        <Pressable onPress={() => void finish()} disabled={busy} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        onMomentumScrollEnd={onScroll}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {slides.map((slide, index) => (
          <View key={slide.eyebrow} style={styles.slide}>
            <View style={styles.imageFrame}>
              <Image source={{ uri: slide.image }} style={styles.image} contentFit="cover" transition={350} />
              <LinearGradient colors={['rgba(12,35,16,0.02)', 'rgba(12,35,16,0.72)']} style={StyleSheet.absoluteFill} />
              <MotiView
                key={`${index}-icon`}
                from={{ opacity: 0, scale: 0.8, translateY: 12 }}
                animate={{ opacity: 1, scale: 1, translateY: 0 }}
                transition={{ type: 'spring', damping: 14, delay: 120 }}
                style={styles.freshBadge}
              >
                <Ionicons name={slide.icon} size={17} color={colors.green} />
                <Text style={styles.freshBadgeText}>Picked with care</Text>
              </MotiView>
              <View style={styles.imageCaption}>
                <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
                <Text style={styles.imageTitle}>{slide.title}</Text>
              </View>
            </View>
            <MotiView
              key={`${index}-copy`}
              from={{ opacity: 0, translateY: 14 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: 80 }}
              style={styles.copy}
            >
              <Text style={styles.body}>{slide.body}</Text>
            </MotiView>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${slides.length}`}>
          {slides.map((slide, index) => (
            <Pressable
              key={slide.eyebrow}
              onPress={() => scrollRef.current?.scrollTo({ x: index * width, animated: true })}
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
          <Ionicons name="arrow-forward" size={16} color={colors.green} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const imageHeight = Math.min(height * 0.48, 430);
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  header: { height: 56, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 31, height: 31, borderRadius: 11, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: colors.green, fontSize: 22, fontWeight: '900', letterSpacing: -0.6 },
  brandAccent: { color: colors.yellowDeep },
  skip: { color: colors.muted, fontWeight: '800', fontSize: 14, padding: 8 },
  pager: { flex: 1 },
  slide: { width, paddingHorizontal: 18, paddingTop: 8 },
  imageFrame: { height: imageHeight, overflow: 'hidden', borderRadius: 30, backgroundColor: colors.line },
  image: { width: '100%', height: '100%' },
  freshBadge: { position: 'absolute', top: 17, left: 17, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.96)' },
  freshBadgeText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  imageCaption: { position: 'absolute', left: 24, right: 24, bottom: 25 },
  eyebrow: { color: '#FBE89C', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  imageTitle: { marginTop: 8, color: colors.white, fontSize: 31, lineHeight: 37, fontWeight: '900', letterSpacing: -0.7 },
  copy: { paddingHorizontal: 6, paddingTop: 18 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  footer: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 15 },
  dot: { width: 8, height: 8, borderRadius: 5, backgroundColor: '#C9D8C8' },
  dotActive: { width: 25, backgroundColor: colors.green },
  primary: { height: 56, borderRadius: radius.lg, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primaryText: { color: colors.white, fontWeight: '900', fontSize: 16 },
  disabled: { opacity: 0.65 },
  guest: { minHeight: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 5 },
  guestText: { color: colors.green, fontWeight: '800', fontSize: 14 },
});
