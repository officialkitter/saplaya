import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { View as MotiView } from 'moti/build/components/view';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

/** Cheerful banner: the scooter drives in, bounces, then idles with a gentle wobble. */
export default function ScooterBanner({ km }: { km: number }) {
  return (
    <MotiView
      from={{ opacity: 0, scale: 0.8, translateY: 20 }}
      animate={{ opacity: 1, scale: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 9 }}
      style={styles.banner}
    >
      <MotiView
        from={{ translateX: -160 }}
        animate={{ translateX: 0 }}
        transition={{ type: 'spring', damping: 8, stiffness: 90, delay: 150 }}
      >
        <MotiView
          from={{ rotate: '-4deg' }}
          animate={{ rotate: '4deg' }}
          transition={{ type: 'timing', duration: 600, loop: true, repeatReverse: true, delay: 1000 }}
        >
          <Ionicons name="bicycle" size={44} color={colors.green} />
        </MotiView>
      </MotiView>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.title}>🎉 Free delivery!</Text>
        <Text style={styles.sub}>You're only {km.toFixed(1)} km from our hub.</Text>
      </View>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.yellow, borderRadius: radius.lg, padding: 16, marginBottom: 16, overflow: 'hidden' },
  title: { fontSize: 18, fontWeight: '900', color: colors.ink },
  sub: { fontSize: 14, color: colors.ink, marginTop: 2 },
});
