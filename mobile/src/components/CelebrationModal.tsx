import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  detail?: string;
  buttonLabel: string;
  onClose: () => void;
};

export default function CelebrationModal({ visible, title, message, detail, buttonLabel, onClose }: Props) {
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
});
