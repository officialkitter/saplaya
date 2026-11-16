import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass } from '../theme';

export default function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={23} color={colors.ink} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.trailing}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { ...glass, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: colors.ink, fontSize: 22, fontWeight: '900' },
  trailing: { minWidth: 42, alignItems: 'flex-end' },
});
