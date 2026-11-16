import { userFacingMessage } from '../lib/user-facing-error';
import React, { useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { View as MotiView } from 'moti/build/components/view';
import ScreenHeader from '../components/ScreenHeader';
import { useDeliveryActions, useDeliveryPlace } from '../lib/location';
import { useAccount } from '../store/AccountContext';
import { useStore } from '../store/StoreContext';
import { colors, radius, volumeTheme } from '../theme';
import { API_URL } from '../lib/supabase';

type SearchPlace = { id: string; label: string; lat: number; lng: number; partial_match: boolean };

export default function LocationPickerScreen({ navigation }: any) {
  const current = useDeliveryPlace();
  const { setPlace, useCurrentLocation } = useDeliveryActions();
  const { addresses } = useAccount();
  const { mode } = useStore();
  const theme = volumeTheme(mode);
  const [label, setLabel] = useState('');
  const [results, setResults] = useState<SearchPlace[]>([]);
  const [selected, setSelected] = useState<SearchPlace | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);

  const choose = async (place: typeof current) => {
    try {
      await setPlace(place);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not update delivery location', userFacingMessage(error, 'Please try again.'));
    }
  };

  const locate = async () => {
    setBusy(true);
    try {
      await useCurrentLocation();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not get location', userFacingMessage(error, 'Allow location access or choose a saved address.'));
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    const request = ++generation.current;
    setError('');
    setResults([]);
    setSelected(null);
    if (label.trim().length < 3) {
      setError('Enter an address with at least three characters.');
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`${API_URL}/location/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: label.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not search delivery addresses.');
      if (request !== generation.current) return;
      setResults(result.places);
      if (!result.places.length) setError('No matching address found. Include the city and country, or use GPS.');
    } catch (cause) {
      if (request === generation.current) setError(userFacingMessage(cause, 'Could not search delivery addresses.'));
    } finally {
      if (request === generation.current) setSearching(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <ScreenHeader title="Delivery location" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <MotiView from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 220 }}>
          <Text style={styles.intro}>Choose where you’d like your fresh order delivered.</Text>
          <Pressable style={[styles.gps, { backgroundColor: theme.soft }]} onPress={locate} disabled={busy}>
            <View style={styles.gpsIcon}><Ionicons name="locate" size={22} color={theme.icon} /></View>
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
                  <Ionicons name={address.isDefault ? 'checkmark-circle' : 'location-outline'} size={21} color={theme.icon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{address.label}</Text>
                    <Text style={styles.subtitle}>{address.address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={colors.muted} />
                </Pressable>
              ))}
            </>
          )}

          <Text style={styles.sectionTitle}>Search for a delivery address</Text>
          <TextInput
            value={label}
            onChangeText={(text) => {
              generation.current += 1;
              setLabel(text);
              setResults([]);
              setSelected(null);
              setError('');
              setSearching(false);
            }}
            placeholder="Enter a street address, city and country"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
          />
          <Text style={styles.note}>
            Order for yourself or someone else. Select a matching address and confirm its map location; delivery fees are recalculated for that destination.
          </Text>
          <Pressable accessibilityRole="button" disabled={searching} style={[styles.button, { backgroundColor: theme.button }]} onPress={() => void search()}>
            <Text style={[styles.buttonText, { color: theme.buttonText }]}>{searching ? 'Searching…' : 'Find address'}</Text>
          </Pressable>
          {error ? <Text accessibilityRole="alert" style={styles.note}>{error}</Text> : null}
          {results.map((result) => (
            <Pressable key={result.id} accessibilityRole="radio" accessibilityState={{ checked: selected?.id === result.id }} style={[styles.savedRow, { marginTop: 10 }]} onPress={() => setSelected(result)}>
              <Ionicons name={selected?.id === result.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={theme.icon} />
              <Text style={[styles.itemTitle, { flex: 1 }]}>{result.label}{result.partial_match ? '\nPartial match — check the map carefully.' : ''}</Text>
            </Pressable>
          ))}
          {selected && (
            <>
              <Pressable accessibilityRole="link" style={styles.button} onPress={() => {
                void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}&query_place_id=${encodeURIComponent(selected.id)}`).catch((cause) => {
                  Alert.alert('Could not open map', userFacingMessage(cause, 'Please try again.'));
                });
              }}><Text style={styles.buttonText}>Check destination on Google Maps</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} style={[styles.button, { backgroundColor: theme.button }]} onPress={async () => {
                setBusy(true);
                await choose({ lat: selected.lat, lng: selected.lng, label: selected.label, approximate: false });
                setBusy(false);
              }}><Text style={[styles.buttonText, { color: theme.buttonText }]}>Confirm delivery destination</Text></Pressable>
            </>
          )}
          <Text style={styles.note}>Address results by Google Maps</Text>
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
