import { userFacingMessage } from '../lib/user-facing-error';
import React, { useRef, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  const { addresses, selectAddress } = useAccount();
  const { mode } = useStore();
  const theme = volumeTheme(mode);
  const [label, setLabel] = useState('');
  const [results, setResults] = useState<SearchPlace[]>([]);
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
    <SafeAreaView style={[styles.root, { backgroundColor: colors.cream }]} edges={['top']}>
      <ScreenHeader title="Delivery location" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Where should we deliver?</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            value={label}
            onChangeText={(text) => {
              generation.current += 1;
              setLabel(text);
              setResults([]);
              setError('');
              setSearching(false);
            }}
            placeholder="Search address"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
          />
          {searching ? (
            <ActivityIndicator size="small" color={theme.icon} />
          ) : label.length > 0 ? (
            <Pressable onPress={() => setLabel('')} accessibilityRole="button" accessibilityLabel="Clear address search">
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {label.trim().length >= 3 && !searching && results.length === 0 && (
          <Pressable accessibilityRole="button" style={styles.searchButton} onPress={() => void search()} disabled={searching}>
            <Text style={styles.searchButtonText}>Search</Text>
          </Pressable>
        )}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {results.map((result) => (
          <Pressable
            key={result.id}
            accessibilityRole="button"
            style={styles.resultRow}
            onPress={() => {
              if (result.partial_match) {
                setError('This address is not exact. Add a street or landmark and search again.');
                return;
              }
              setBusy(true);
              void choose({ lat: result.lat, lng: result.lng, label: result.label, approximate: false })
                .finally(() => setBusy(false));
            }}
          >
            <View style={styles.resultIcon}><Ionicons name="location-outline" size={20} color={theme.icon} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{result.label}</Text>
              {result.partial_match && <Text style={styles.subtitle}>Check that this destination is correct</Text>}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}

        {!results.length && (
          <>
            <Pressable style={styles.gps} onPress={locate} disabled={busy}>
              <View style={styles.gpsIcon}>
                {busy ? <ActivityIndicator size="small" color={theme.icon} /> : <Ionicons name="navigate" size={21} color={theme.icon} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{busy ? 'Finding your location…' : 'Use current location'}</Text>
                <Text style={styles.subtitle}>Uses your phone GPS</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>

            {addresses.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Saved places</Text>
                {addresses.map((address) => (
                  <Pressable
                    key={address.id}
                    style={[styles.savedRow, !address.isDefault && current.label === address.address ? styles.currentRow : null]}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        await selectAddress(address.id);
                        await choose({ lat: address.lat, lng: address.lng, label: address.address, approximate: false });
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <View style={styles.savedIcon}>
                      <Ionicons name={address.label.toLowerCase().includes('home') ? 'home-outline' : 'location-outline'} size={20} color={theme.icon} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.savedTitleRow}>
                        <Text style={styles.itemTitle}>{address.label}</Text>
                        {address.isDefault && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>Default</Text></View>}
                      </View>
                      <Text style={styles.subtitle} numberOfLines={2}>{address.address}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}

        <Text style={styles.providerNote}>Address suggestions from Google Maps</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  heading: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '900', marginBottom: 14 },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, marginTop: 18, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  gpsIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#EEF7EA' },
  sectionTitle: { marginTop: 28, marginBottom: 10, color: colors.ink, fontSize: 14, fontWeight: '900' },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 12, marginBottom: 8, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  currentRow: { borderColor: colors.green },
  savedIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EEF7EA', alignItems: 'center', justifyContent: 'center' },
  savedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  defaultBadge: { borderRadius: 10, backgroundColor: '#EEF7EA', paddingHorizontal: 7, paddingVertical: 3 },
  defaultBadgeText: { color: colors.green, fontSize: 10, fontWeight: '900' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  searchButton: { alignSelf: 'flex-start', minHeight: 44, minWidth: 92, marginTop: 12, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  searchButtonText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 12, marginTop: 8, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  resultIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EEF7EA', alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  input: { flex: 1, minHeight: 52, color: colors.ink, fontSize: 15 },
  error: { marginTop: 10, color: '#A15C00', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  providerNote: { marginTop: 18, color: colors.muted, fontSize: 11, textAlign: 'center' },
});
