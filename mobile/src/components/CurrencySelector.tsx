import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCurrency } from '../lib/currency';
import { colors, radius } from '../theme';

export default function CurrencySelector() {
  const { currency, currencies, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const close = () => { setOpen(false); setSearch(''); };
  const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'currency' }) : null;
  const label = (code: string) => names ? `${code} — ${names.of(code) || code}` : code;
  const filtered = currencies.filter((code) => label(code).toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <>
      <Pressable style={styles.trigger} accessibilityRole="button" accessibilityLabel={`Currency ${currency}. Choose currency.`} onPress={() => setOpen(true)}>
        <Text style={styles.code}>{currency}</Text><Ionicons name="chevron-down" size={14} color={colors.green} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={styles.root}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Choose currency</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close currency selection" onPress={close} style={styles.close}><Ionicons name="close" size={26} color={colors.ink} /></Pressable>
          </View>
          <TextInput autoFocus value={search} onChangeText={setSearch} placeholder="Search currency name or code" accessibilityLabel="Search currencies" autoCapitalize="none" style={styles.search} />
          <FlatList keyboardShouldPersistTaps="handled" data={filtered} keyExtractor={(code) => code} ListEmptyComponent={<Text style={styles.empty}>No matching currencies.</Text>} renderItem={({ item }) => (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: item === currency }} style={styles.row} onPress={() => { setCurrency(item); close(); }}>
              <Text style={styles.name}>{label(item)}</Text>
              {item === currency && <Ionicons name="checkmark" size={22} color={colors.green} />}
            </Pressable>
          )} />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  trigger: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.white },
  code: { color: colors.green, fontWeight: '900', fontSize: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  title: { color: colors.ink, fontWeight: '900', fontSize: 22 },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  search: { marginHorizontal: 20, marginBottom: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, color: colors.ink },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { flex: 1, color: colors.ink, fontWeight: '600', fontSize: 16 },
  empty: { padding: 20, color: colors.muted },
});
