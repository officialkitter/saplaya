import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  paymentUrl: string;
  apiUrl: string;
  onCallback: () => void;
  onOriginChange: (origin: string) => void;
  onBrowserFallback: () => void;
  buttonColor: string;
  buttonTextColor: string;
};

export default function PaymentFrame({ onBrowserFallback, buttonColor, buttonTextColor }: Props) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: colors.ink, textAlign: 'center' }}>Continue this payment in the secure browser.</Text>
      <Pressable onPress={onBrowserFallback} accessibilityRole="button" style={{ marginTop: 16, padding: 14, borderRadius: radius.md, backgroundColor: buttonColor }}>
        <Text style={{ color: buttonTextColor, fontWeight: '700' }}>Open secure browser</Text>
      </Pressable>
    </View>
  );
}
