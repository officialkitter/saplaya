import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BrandMark from './BrandMark';
import { colors, radius, volumeTheme } from '../theme';
import type { Mode } from '../types';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  detail?: string;
  buttonLabel: string;
  onClose: () => void;
  volumeTier?: 'bulk' | 'mega_bulk';
  orderMode?: Mode;
};

export default function CelebrationModal({ visible, title, message, detail, buttonLabel, onClose, volumeTier, orderMode }: Props) {
  const entrance = useRef(new Animated.Value(1)).current;
  const cardMode = volumeTier ?? orderMode;

  useEffect(() => {
    if (!visible || !cardMode) return;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active || reduced) return;
      entrance.setValue(0);
      Animated.spring(entrance, { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }).start();
    }).catch((error: unknown) => {
      console.error('Could not check the motion accessibility setting:', error);
    });
    return () => {
      active = false;
      entrance.stopAnimation();
      entrance.setValue(1);
    };
  }, [visible, cardMode, entrance]);

  if (cardMode) {
    const theme = volumeTheme(cardMode);
    const accent = cardMode === 'bulk' ? '#007586' : theme.accent;
    const buttonColor = cardMode === 'bulk' ? accent : theme.button;
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <SafeAreaView style={styles.backdrop}>
          <ScrollView contentContainerStyle={styles.cardContainer}>
            <Animated.View style={[styles.card, {
              opacity: entrance,
              transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
            }]}>
              <LinearGradient
                colors={cardMode === 'mega_bulk' ? ['#FFF4E4', '#FFFFFF', '#F6E8D9'] : cardMode === 'bulk' ? ['#E1FAF8', '#FFFFFF', '#EAF4FF'] : cardMode === 'wholesale' ? ['#FFF4C7', '#FFFFFF', '#FFF8E1'] : ['#E8F5E9', '#FFFFFF', '#F0F9EB']}
                style={styles.cardGradient}
              >
                <View style={styles.brandRow}>
                  <BrandMark size={42} />
                  <Text style={styles.brandName}>SAPLAYA</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: accent }]}>
                  <Ionicons name="sparkles" size={26} color={colors.white} />
                </View>
                <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardMessage}>{message}</Text>
                {!!detail && <Text style={[styles.cardDetail, { color: accent }]}>{detail}</Text>}
                <Pressable onPress={onClose} style={[styles.button, { backgroundColor: buttonColor }]} accessibilityRole="button">
                  <Text style={[styles.buttonText, { color: theme.buttonText }]}>{buttonLabel}</Text>
                </Pressable>
              </LinearGradient>
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.iconBackground}>
            <Ionicons name="sparkles" size={58} color={colors.green} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {!!detail && <Text style={styles.detail}>{detail}</Text>}
          <Pressable onPress={onClose} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>{buttonLabel}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  iconBackground: { width: 130, height: 130, borderRadius: 65, backgroundColor: colors.bulkLight, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 26, fontSize: 30, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  message: { marginTop: 14, fontSize: 18, lineHeight: 26, color: colors.muted, textAlign: 'center' },
  detail: { marginTop: 12, fontSize: 15, lineHeight: 22, color: colors.green, fontWeight: '700', textAlign: 'center' },
  button: { marginTop: 32, alignSelf: 'stretch', backgroundColor: colors.green, borderRadius: radius.md, padding: 17, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 33, 24, 0.72)' },
  cardContainer: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  cardGradient: { padding: 26, alignItems: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start' },
  brandName: { color: colors.green, fontWeight: '900', letterSpacing: 2, fontSize: 13 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  cardTitle: { marginTop: 18, fontSize: 27, lineHeight: 33, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  cardMessage: { marginTop: 12, fontSize: 16, lineHeight: 24, color: colors.ink, textAlign: 'center' },
  cardDetail: { marginTop: 14, fontSize: 14, lineHeight: 21, fontWeight: '700', textAlign: 'center' },
});
