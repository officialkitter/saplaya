import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MotiText, MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';
import BrandMark from './BrandMark';
import { colors } from '../theme';

/**
 * Phase 1: a crisp green seed, centered, pulses.
 * Phase 2: the seed morphs (squash → shrink) into a bouncy brand logo.
 */
export default function SplashMorph({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<'seed' | 'logo'>('seed');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('logo'), 650);
    const t2 = setTimeout(onFinish, 1900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onFinish]);

  return (
    <View style={styles.root}>
      {BLOBS.map((b, i) => (
        <MotiView
          key={i}
          pointerEvents="none"
          style={[styles.blob, { width: b.size, height: b.size, borderRadius: b.size / 2, left: b.x, top: b.y, backgroundColor: b.color }]}
          from={{ translateY: 0, translateX: 0, scale: 1, opacity: 0 }}
          animate={{ translateY: b.dy, translateX: b.dx, scale: 1.15, opacity: 0.35 }}
          transition={{
            type: 'timing',
            duration: b.duration,
            loop: true,
            repeatReverse: true,
            easing: Easing.inOut(Easing.sin),
            delay: i * 200,
          }}
        />
      ))}
      <View style={styles.center}>
        {/* Seed */}
        <MotiView
          style={styles.abs}
          animate={
            phase === 'seed'
              ? { scale: 1, opacity: 1 }
              : { scale: 0.2, opacity: 0, rotate: '25deg' }
          }
          transition={{ type: 'timing', duration: 380, easing: Easing.in(Easing.cubic) }}
        >
          <MotiView
            from={{ scale: 0.9 }}
            animate={{ scale: 1.18 }}
            transition={{ type: 'timing', duration: 520, loop: true, repeatReverse: true, easing: Easing.inOut(Easing.quad) }}
          >
            <View style={styles.seed}>
              <View style={styles.seedShine} />
              <View style={styles.seedLine} />
            </View>
          </MotiView>
        </MotiView>

        {/* Logo */}
        <MotiView
          style={styles.abs}
          from={{ scale: 0, opacity: 0 }}
          animate={phase === 'logo' ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 6, stiffness: 140, mass: 0.9, delay: phase === 'logo' ? 250 : 0 }}
        >
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <BrandMark size={112} />
            </View>
          </View>
        </MotiView>
      </View>

      <MotiText
        style={styles.brand}
        from={{ opacity: 0, translateY: 14 }}
        animate={phase === 'logo' ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: 14 }}
        transition={{ type: 'timing', duration: 500, delay: 650 }}
      >
        Sapla<Text style={{ color: colors.yellowDeep }}>ya</Text>
      </MotiText>
      <MotiText
        style={styles.tag}
        from={{ opacity: 0 }}
        animate={{ opacity: phase === 'logo' ? 1 : 0 }}
        transition={{ type: 'timing', duration: 500, delay: 900 }}
      >
        Straight from the farm
      </MotiText>
    </View>
  );
}

const BLOBS = [
  { size: 220, x: -70, y: 60, dx: 40, dy: 50, duration: 3600, color: colors.greenLight },
  { size: 160, x: 230, y: 140, dx: -30, dy: 60, duration: 4200, color: colors.yellow },
  { size: 260, x: 120, y: 560, dx: -50, dy: -60, duration: 4800, color: colors.greenLight },
  { size: 120, x: -20, y: 480, dx: 40, dy: -40, duration: 3200, color: colors.yellow },
];

const styles = StyleSheet.create({
  blob: { position: 'absolute' },
  root: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  center: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  seed: {
    width: 46,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.green,
    transform: [{ rotate: '-18deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.greenLight,
  },
  seedShine: { position: 'absolute', top: 10, left: 11, width: 9, height: 18, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.45)' },
  seedLine: { width: 2, height: 40, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 2 },
  logoWrap: { alignItems: 'center' },
  logoCircle: {
    width: 128,
    height: 128,
    borderRadius: 42,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.yellow,
  },
  brand: { marginTop: 28, fontSize: 38, fontWeight: '800', color: colors.green, letterSpacing: 0.5 },
  tag: { marginTop: 6, fontSize: 15, color: colors.muted },
});
