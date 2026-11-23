import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COUNTRY_CODES } from '../lib/country-codes';

export default function CountryCodePicker({
  value,
  onChange,
  accent,
}: { value: string; onChange: (dial: string) => void; accent: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return COUNTRY_CODES.filter((country) =>
      !term || country.name.toLowerCase().includes(term) || country.dial.includes(term),
    );
  }, [query]);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.button}>
        <Text style={styles.text}>{value}</Text>
        <Ionicons name="chevron-down" size={16} color={accent} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Country code</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or code"
              style={styles.search}
              autoCapitalize="none"
            />
            <ScrollView keyboardShouldPersistTaps="handled">
              {matches.map((country) => (
                <Pressable
                  key={`${country.name}-${country.dial}`}
                  onPress={() => {
                    onChange(country.dial);
                    setQuery('');
                    setOpen(false);
                  }}
                  style={styles.row}
                >
                  <Text style={styles.name}>{country.name}</Text>
                  <Text style={[styles.dial, { color: accent }]}>{country.dial}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { height: 48, minWidth: 92, borderWidth: 1, borderColor: '#DDE5DA', borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  text: { fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(21,38,26,.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '75%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  search: { height: 48, borderWidth: 1, borderColor: '#DDE5DA', borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#EDF1EA' },
  name: { fontWeight: '700' },
  dial: { fontWeight: '800' },
});
