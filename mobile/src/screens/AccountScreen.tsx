import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import ScreenHeader from '../components/ScreenHeader';
import { useAccount } from '../store/AccountContext';
import { colors, radius, shadow } from '../theme';

const sections = [
  { key: 'profile', title: 'Personal details', subtitle: 'Your name, phone and profile photo', icon: 'person-outline' as const },
  { key: 'addresses', title: 'Saved addresses', subtitle: 'Choose where your fresh order goes', icon: 'location-outline' as const },
  { key: 'payments', title: 'Payment methods', subtitle: 'Secure online and delivery options', icon: 'card-outline' as const },
  { key: 'reviews', title: 'Reviews', subtitle: 'Share feedback with Saplaya', icon: 'star-outline' as const },
  { key: 'supplier', title: 'Become a supplier', subtitle: 'Register your farm with Saplaya', icon: 'leaf-outline' as const },
  { key: 'help', title: 'Help center', subtitle: 'FAQs and customer support', icon: 'help-circle-outline' as const },
  { key: 'legal', title: 'Terms & privacy', subtitle: 'How Saplaya protects your information', icon: 'shield-checkmark-outline' as const },
  { key: 'about', title: 'About Saplaya', subtitle: 'Our farm-to-home promise', icon: 'information-circle-outline' as const },
];

export default function AccountScreen({ navigation }: any) {
  const { user, isSignedIn, profile } = useAccount();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Your account" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 260 }}>
          <View style={[styles.identity, shadow]}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}><Ionicons name="person" size={30} color={colors.green} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{profile.fullName || (isSignedIn ? 'Welcome to Saplaya' : 'Welcome, shopper')}</Text>
              <Text style={styles.email}>{isSignedIn ? user?.email : 'Create an account to save your details'}</Text>
            </View>
          </View>
        </MotiView>

        <Pressable style={styles.orderShortcut} onPress={() => navigation.navigate('Tabs', { screen: 'Tracking' })}>
          <View style={styles.shortcutIcon}><Ionicons name="receipt-outline" size={22} color={colors.green} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>My orders</Text>
            <Text style={styles.rowSubtitle}>{isSignedIn ? 'Track deliveries and view your order history' : 'Track a delivery in this session'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        <Text style={styles.sectionTitle}>Manage your account</Text>
        <View style={styles.menu}>
          {sections.filter((section) => section.key !== 'payments' || isSignedIn).map((section, index, visibleSections) => (
            <MotiView
              key={section.key}
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 220, delay: index * 30 }}
            >
              <Pressable
                style={[styles.row, index < visibleSections.length - 1 && styles.rowBorder]}
                onPress={() => navigation.navigate('AccountDetail', { section: section.key })}
                accessibilityRole="button"
              >
                <View style={styles.rowIcon}><Ionicons name={section.icon} size={21} color={colors.green} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{section.title}</Text>
                  <Text style={styles.rowSubtitle}>{section.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color={colors.muted} />
              </Pressable>
            </MotiView>
          ))}
        </View>

        <Pressable
          style={[styles.authButton, isSignedIn && styles.signOutButton]}
          onPress={() => isSignedIn
            ? navigation.navigate('AccountDetail', { section: 'signout' })
            : navigation.navigate('Authentication')}
        >
          <Ionicons name={isSignedIn ? 'log-out-outline' : 'log-in-outline'} size={20} color={isSignedIn ? '#C62828' : colors.white} />
          <Text style={[styles.authText, isSignedIn && { color: '#C62828' }]}>
            {isSignedIn ? 'Sign out' : 'Sign in or create an account'}
          </Text>
        </Pressable>
        <Text style={styles.version}>Saplaya · Fresh from local farms</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 36 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.lg, padding: 18, backgroundColor: colors.white },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.line },
  avatarFallback: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 19, fontWeight: '900', color: colors.ink },
  email: { marginTop: 3, fontSize: 13, color: colors.muted },
  orderShortcut: { marginTop: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, backgroundColor: '#EFF7EC' },
  shortcutIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { marginTop: 26, marginBottom: 10, color: colors.muted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  menu: { overflow: 'hidden', backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: 15 },
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EFF7EC', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, color: colors.ink, fontWeight: '800' },
  rowSubtitle: { marginTop: 2, fontSize: 12, color: colors.muted },
  authButton: { minHeight: 54, marginTop: 22, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: colors.green },
  signOutButton: { backgroundColor: '#FDECEC' },
  authText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  version: { marginTop: 18, textAlign: 'center', color: colors.muted, fontSize: 12 },
});
