import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { View as MotiView } from 'moti/build/components/view';
import ScreenHeader from '../components/ScreenHeader';
import { useDeliveryActions, useDeliveryPlace } from '../lib/location';
import { useAccount } from '../store/AccountContext';
import { colors, radius } from '../theme';

export default function LocationPickerScreen({ navigation }: any) {
  const current = useDeliveryPlace();
  const { setPlace, useCurrentLocation } = useDeliveryActions();
  const { addresses } = useAccount();
  const [label, setLabel] = useState(current.label);
  const [busy, setBusy] = useState(false);

  const choose = async (place: typeof current) => {
    try {
      await setPlace(place);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not update delivery location', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const locate = async () => {
    setBusy(true);
    try {
      await useCurrentLocation();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not get location', error instanceof Error ? error.message : 'Allow location access or choose a saved address.');
    } finally {
      setBusy(false);
    }
  };

  const saveLabel = () => {
    if (!label.trim()) {
      Alert.alert('Enter a delivery location', 'Add a neighborhood or delivery landmark.');
      return;
    }
    Alert.alert(
      'Use this delivery location?',
      'For the most accurate delivery fee, use your current GPS location or select a saved address.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Use location', onPress: () => choose({ ...current, label: label.trim() }) },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Delivery location" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <MotiView from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 220 }}>
          <Text style={styles.intro}>Choose where you’d like your fresh order delivered.</Text>
          <Pressable style={styles.gps} onPress={locate} disabled={busy}>
            <View style={styles.gpsIcon}><Ionicons name="locate" size={22} color={colors.green} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{busy ? 'Finding your location…' : 'Use my current location'}</Text>
              <Text style={styles.subtitle}>Allow location access for a more accurate delivery fee</Text>
            </View>
            {!busy && <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
          </Pressable>

          {addresses.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Saved addresses</Text>
              {addresses.map((address) => (
                <Pressable
                  key={address.id}
                  style={styles.savedRow}
                  onPress={() => choose({ lat: address.lat, lng: address.lng, label: address.address, approximate: false })}
                >
                  <Ionicons name={address.isDefault ? 'checkmark-circle' : 'location-outline'} size={21} color={colors.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{address.label}</Text>
                    <Text style={styles.subtitle}>{address.address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={colors.muted} />
                </Pressable>
              ))}
            </>
          )}

          <Text style={styles.sectionTitle}>Enter a neighborhood or landmark</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Nkuhungu, near the market"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={saveLabel}
          />
          <Text style={styles.note}>
            This updates your delivery label. GPS coordinates stay at the current map point until you choose a saved address or use GPS.
          </Text>
          <Pressable style={styles.button} onPress={saveLabel}>
            <Text style={styles.buttonText}>Use this location</Text>
          </Pressable>
        </MotiView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 36 },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: '#EFF7EC', borderRadius: radius.md },
  gpsIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { marginTop: 24, marginBottom: 10, color: colors.ink, fontSize: 14, fontWeight: '900' },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 13, marginBottom: 9, borderRadius: radius.md, backgroundColor: colors.white },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  input: { minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, color: colors.ink, fontSize: 15 },
  note: { marginTop: 9, color: colors.muted, fontSize: 12, lineHeight: 18 },
  button: { height: 54, marginTop: 17, borderRadius: radius.md, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.white, fontWeight: '900', fontSize: 16 },
});
