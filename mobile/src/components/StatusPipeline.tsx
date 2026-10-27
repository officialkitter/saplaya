import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { View as MotiView } from 'moti/build/components/view';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, OrderStatus, statusColor } from '../theme';

const STEPS: { key: Exclude<OrderStatus, 'cancelled'>; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'pending', label: 'Received', icon: 'clipboard-text' },
  { key: 'packing', label: 'Packing', icon: 'shopping' }, // paper bag
  { key: 'en_route', label: 'On the way', icon: 'truck-fast' },
  { key: 'delivered', label: 'At your door', icon: 'door-open' },
];

export const stepIndex = (s: OrderStatus) => Math.max(0, STEPS.findIndex((x) => x.key === s));

/** Four sequential nodes. Reached nodes glow in THEIR status colour; the current one pulses. */
export default function StatusPipeline({ status }: { status: OrderStatus }) {
  const cancelled = status === 'cancelled';
  const current = stepIndex(status);

  return (
    <View style={styles.row}>
      {STEPS.map((s, i) => {
        const reached = cancelled || i <= current;
        const isCurrent = !cancelled && i === current;
        const c = cancelled ? statusColor.cancelled : statusColor[s.key];
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <View style={styles.connector}>
                <MotiView
                  style={styles.connectorFill}
                  animate={{ width: reached ? '100%' : '0%', backgroundColor: c }}
                  transition={{ type: 'timing', duration: 600 }}
                />
              </View>
            )}
            <View style={styles.node}>
              <MotiView
                animate={{
                  backgroundColor: reached ? c : colors.white,
                  borderColor: reached ? c : colors.line,
                  shadowColor: c,
                  shadowOpacity: reached ? 0.9 : 0,
                  shadowRadius: reached ? 12 : 0,
                  scale: isCurrent ? 1.15 : 1,
                }}
                transition={{ type: 'spring', damping: 12 }}
                style={styles.circle}
              >
                {isCurrent && (
                  <MotiView
                    from={{ scale: 1, opacity: 0.55 }}
                    animate={{ scale: 1.9, opacity: 0 }}
                    transition={{ type: 'timing', duration: 1300, loop: true }}
                    style={[styles.halo, { backgroundColor: c }]}
                  />
                )}
                <MaterialCommunityIcons name={s.icon} size={26} color={reached ? colors.white : colors.muted} />
              </MotiView>
              <Text style={[styles.label, reached && { color: colors.ink, fontWeight: '800' }]}>{s.label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 10 },
  node: { width: 64, alignItems: 'center' },
  circle: { width: 54, height: 54, borderRadius: 27, borderWidth: 3, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  halo: { position: 'absolute', width: 54, height: 54, borderRadius: 27 },
  label: { marginTop: 8, fontSize: 12, textAlign: 'center', color: colors.muted },
  connector: { flex: 1, height: 5, marginTop: 24, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  connectorFill: { height: 5 },
});
