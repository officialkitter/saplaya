import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { View as MotiView } from 'moti/build/components/view';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useStore } from '../store/StoreContext';
import { colors, radius, volumeTheme } from '../theme';
import Atmosphere from './Atmosphere';

const H = 64;

/** Big, obvious two-option slide toggle. */
export function ModeToggle() {
  const { baseMode, setMode } = useStore();
  const wholesale = baseMode === 'wholesale';
  const [w, setW] = React.useState(0);
  const half = w / 2;

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        setMode(wholesale ? 'retail' : 'wholesale');
      }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessibilityRole="switch"
      accessibilityLabel="Switch between retail and wholesale"
      style={[styles.track, wholesale && { backgroundColor: '#FFF4C2', borderColor: colors.yellow }]}
    >
      <MotiView
        style={[styles.thumb, { width: Math.max(0, half - 6) }]}
        animate={{ translateX: wholesale ? half : 0, backgroundColor: wholesale ? colors.yellow : colors.green }}
        transition={{ type: 'spring', damping: 14, stiffness: 160 }}
      />
      <View style={styles.label}>
        <Ionicons name="basket" size={20} color={wholesale ? colors.muted : colors.white} />
        <Text numberOfLines={1} style={[styles.text, { color: wholesale ? colors.muted : colors.white }]}>Retail</Text>
      </View>
      <View style={styles.label}>
        <MaterialCommunityIcons name="package-variant-closed" size={20} color={wholesale ? colors.ink : colors.muted} />
        <Text numberOfLines={1} style={[styles.text, { color: wholesale ? colors.ink : colors.muted }]}>Wholesale</Text>
      </View>
    </Pressable>
  );
}

/** Slow, low-contrast color movement keeps the shop background calm behind product cards. */
export function ModeBackdrop() {
  const { mode } = useStore();
  return (
    <View style={styles.backdrop} pointerEvents="none"><Atmosphere accent={volumeTheme(mode).button} /></View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: H,
    marginHorizontal: 20,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
  },
  thumb: { position: 'absolute', left: 3, top: 3, height: H - 10, borderRadius: radius.xl - 4 },
  label: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  text: { flexShrink: 1, fontSize: 16, fontWeight: '800' },
  backdrop: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
});
