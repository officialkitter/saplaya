import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, FlatList, ImageBackground, KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import GoogleMark from '../components/GoogleMark';
import BrandMark from '../components/BrandMark';
import ScreenHeader from '../components/ScreenHeader';
import { useAccount } from '../store/AccountContext';
import { colors, radius } from '../theme';

const authSlides = [
  { image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1100&q=85', title: 'Fresh finds, every day' },
  { image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1100&q=85', title: 'From local farms to you' },
  { image: 'https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=1100&q=85', title: 'Make room for good food' },
];
const RESEND_SECONDS = 45;

export default function AuthenticationScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const { signIn, register, signInWithProvider, continueAsGuest, sendPhoneOtp, verifyPhoneOtp } = useAccount();
  const heroRef = useRef<FlatList<(typeof authSlides)[number]>>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setHeroIndex((current) => {
        const next = (current + 1) % authSlides.length;
        heroRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4600);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!resendIn) return;
    const timer = setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn > 0]);

  const finish = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };
  const requireTerms = () => {
    if (acceptedTerms) return true;
    Alert.alert('One more step', 'Please accept the Terms & Privacy notice to continue.');
    return false;
  };
  const friendlyError = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    if (/operation-not-allowed|billing-not-enabled|provider is disabled/i.test(message)) {
      return 'This sign-in option is not available right now. Try another sign-in method.';
    }
    if (/anonymous.*disabled|anonymous sign-ins are disabled/i.test(message)) {
      return 'Guest checkout is temporarily unavailable. Please sign in or create an account.';
    }
    if (/invalid-credential|wrong-password|user-not-found/i.test(message)) {
      return 'Those sign-in details do not match an account. Check them and try again.';
    }
    if (/too-many-requests|quota-exceeded|resource-exhausted/i.test(message)) {
      return 'Please wait a little before trying again.';
    }
    return 'Please check your details and try again.';
  };

  const submit = async () => {
    if (creating && !requireTerms()) return;
    if (method === 'phone') {
      const normalizedPhone = phone.trim().replace(/[\s()-]/g, '');
      if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
        Alert.alert('Check your phone number', 'Enter a valid international number beginning with + and its country code.');
        return;
      }
      if (creating && !name.trim()) {
        Alert.alert('Add your name', 'Enter the name you would like shown on your account.');
        return;
      }
      if (codeSent && !/^\d{6}$/.test(code.trim())) {
        Alert.alert('Check your OTP', 'Enter the six-digit OTP sent to your phone.');
        return;
      }
      setBusy(true);
      try {
        if (!codeSent) {
          await sendPhoneOtp(normalizedPhone, creating ? name : undefined);
          setCodeSent(true);
          setResendIn(RESEND_SECONDS);
        } else {
          await verifyPhoneOtp(normalizedPhone, code.trim());
          finish();
        }
      } catch (error) {
        Alert.alert(codeSent ? 'Could not verify OTP' : 'Could not send OTP', friendlyError(error));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password to continue.');
      return;
    }
    if (creating && !name.trim()) {
      Alert.alert('Add your name', 'Enter the name you would like shown on your account.');
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        const confirmationRequired = await register(email.trim(), password, name);
        if (confirmationRequired) {
          Alert.alert(
            'Check your email',
            'Email confirmation is required by the current account settings. Follow the link to finish creating your account. To allow immediate signup temporarily, turn off Confirm email in Supabase Authentication → Providers → Email.',
          );
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      finish();
    } catch (error) {
      Alert.alert(creating ? 'Could not create account' : 'Could not sign in', friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitSocial = async (provider: 'google' | 'apple') => {
    if (!requireTerms()) return;
    setBusy(true);
    try {
      if (await signInWithProvider(provider)) finish();
    } catch (error) {
      Alert.alert('Could not sign in', friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    if (!requireTerms()) return;
    setBusy(true);
    try {
      await continueAsGuest();
      finish();
    } catch (error) {
      Alert.alert('Guest checkout unavailable', friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const requestAnotherCode = async () => {
    const normalizedPhone = phone.trim().replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      Alert.alert('Check your phone number', 'Enter a valid international number beginning with + and its country code.');
      return;
    }
    setBusy(true);
    try {
      await sendPhoneOtp(normalizedPhone, creating ? name : undefined);
      setCode('');
      setResendIn(RESEND_SECONDS);
    } catch (error) {
      Alert.alert('Could not resend OTP', friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const openLegal = () => navigation.navigate('AccountDetail', { section: 'legal' });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title={creating ? 'Create account' : 'Welcome'} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.heroFrame, { width: width - 36 }]}>
            <FlatList
              ref={heroRef}
              data={authSlides}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              decelerationRate="fast"
              onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
                setHeroIndex(Math.round(event.nativeEvent.contentOffset.x / (width - 36)));
              }}
              getItemLayout={(_, index) => ({ length: width - 36, offset: (width - 36) * index, index })}
              keyExtractor={(slide) => slide.title}
              renderItem={({ item: slide }) => (
                <ImageBackground source={{ uri: slide.image }} style={[styles.hero, { width: width - 36 }]} imageStyle={styles.heroImage}>
                  <LinearGradient colors={['rgba(10,30,14,0.02)', 'rgba(10,30,14,0.73)']} style={StyleSheet.absoluteFill} />
                  <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }} style={styles.heroCopy}>
                    <View style={styles.heroPill}><BrandMark size={16} /><Text style={styles.heroPillText}>SAPLAYA · FRESH DAILY</Text></View>
                    <Text style={styles.heroTitle}>{slide.title}</Text>
                  </MotiView>
                </ImageBackground>
              )}
            />
            <View style={styles.heroDots}>
              {authSlides.map((slide, index) => <View key={slide.title} style={[styles.heroDot, index === heroIndex && styles.heroDotActive]} />)}
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.heading}>{creating ? 'Join Saplaya' : 'Welcome back'}</Text>
            <Text style={styles.subheading}>{creating ? 'Create an account to keep your details and orders together.' : 'Sign in to see your saved details and orders.'}</Text>

            <View style={styles.methods}>
              {(['email', 'phone'] as const).map((value) => (
                <Pressable
                  key={value}
                  style={[styles.method, method === value && styles.methodActive]}
                  onPress={() => { setMethod(value); setCodeSent(false); setCode(''); setResendIn(0); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: method === value }}
                >
                  <Text style={[styles.methodText, method === value && styles.methodTextActive]}>{value === 'email' ? 'Email' : 'Phone'}</Text>
                </Pressable>
              ))}
            </View>

            {method === 'email' ? (
              <>
                {creating && <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />}
                <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={creating ? 'new-password' : 'current-password'} />
              </>
            ) : (
              <>
                {creating && !codeSent && <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />}
                <Field label="Phone number" value={phone} onChangeText={(value) => { setPhone(value); setCodeSent(false); setCode(''); }} keyboardType="phone-pad" autoComplete="tel" editable={!codeSent} placeholder="+255 7XX XXX XXX" />
                {codeSent && (
                  <>
                    <Field label="One-time password (OTP)" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
                    <View style={styles.resendRow}>
                      <Text style={styles.resendHint}>Didn't receive your OTP?</Text>
                      <Pressable onPress={() => void requestAnotherCode()} disabled={busy || resendIn > 0}>
                        <Text style={[styles.resendText, (busy || resendIn > 0) && styles.disabledText]}>
                          {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            )}

            <View style={styles.termsRow}>
              <Pressable
                onPress={() => setAcceptedTerms((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityLabel="I agree to Saplaya's Terms and Privacy Policy"
                accessibilityState={{ checked: acceptedTerms }}
                hitSlop={8}
                style={styles.termsToggle}
              >
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                  {acceptedTerms && <Ionicons name="checkmark" size={16} color={colors.white} />}
                </View>
                <Text style={styles.termsText}>I agree to Saplaya's</Text>
              </Pressable>
              <Pressable onPress={openLegal} hitSlop={8} accessibilityRole="link">
                <Text style={styles.termsLink}>Terms & Privacy Policy</Text>
              </Pressable>
            </View>

            <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit} disabled={busy}>
              <Text style={styles.buttonText}>
                {busy ? 'Please wait…' : method === 'phone' ? codeSent ? 'Verify OTP' : 'Send OTP' : creating ? 'Create account' : 'Sign in'}
              </Text>
              {!busy && <Ionicons name="arrow-forward" size={18} color={colors.white} />}
            </Pressable>

            <Pressable style={styles.switch} onPress={() => { setCreating((value) => !value); setCodeSent(false); setCode(''); }}>
              <Text style={styles.switchText}>
                {creating ? 'Already with us? Sign in' : 'New to Saplaya? Create an account'}
              </Text>
            </Pressable>

            <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>OR CONTINUE WITH</Text><View style={styles.orLine} /></View>
            <View style={styles.socialRow}>
              <Pressable style={styles.socialButton} onPress={() => void submitSocial('google')} disabled={busy}>
                <GoogleMark size={20} /><Text style={styles.socialText}>Google</Text>
              </Pressable>
              <Pressable style={styles.socialButton} onPress={() => void submitSocial('apple')} disabled={busy}>
                <Ionicons name="logo-apple" size={20} color={colors.ink} /><Text style={styles.socialText}>Apple</Text>
              </Pressable>
            </View>
            <Pressable style={styles.guestButton} onPress={() => void guest()} disabled={busy}>
              <Ionicons name="person-outline" size={18} color={colors.green} />
              <Text style={styles.guestText}>Continue as guest</Text>
            </Pressable>
            <Text style={styles.guestNote}>You can shop and order without an account. Order history is saved when you create an account.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} style={styles.input} placeholderTextColor="#89958A" />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 32 },
  heroFrame: { height: 242, alignSelf: 'center', overflow: 'hidden', borderRadius: 27, backgroundColor: colors.line },
  hero: { height: 242, justifyContent: 'flex-end' },
  heroImage: { borderRadius: 27 },
  heroCopy: { paddingHorizontal: 19, paddingBottom: 23 },
  heroPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 10, paddingVertical: 7 },
  heroPillText: { color: colors.ink, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { marginTop: 11, color: colors.white, fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  heroDots: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 5 },
  heroDot: { height: 6, width: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  heroDotActive: { width: 18, backgroundColor: colors.white },
  formCard: { marginTop: 15, padding: 19, borderRadius: 25, backgroundColor: colors.white },
  heading: { color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  subheading: { marginTop: 5, marginBottom: 17, color: colors.muted, fontSize: 13, lineHeight: 19 },
  methods: { flexDirection: 'row', padding: 4, marginBottom: 15, borderRadius: 15, backgroundColor: '#EEF5EC' },
  method: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  methodActive: { backgroundColor: colors.white, elevation: 1 },
  methodText: { color: colors.muted, fontWeight: '800' },
  methodTextActive: { color: colors.green },
  fieldWrap: { marginBottom: 12 },
  label: { marginBottom: 6, fontSize: 12, fontWeight: '800', color: colors.ink },
  input: { minHeight: 49, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: '#FCFDFC', color: colors.ink, fontSize: 15 },
  resendRow: { marginTop: -5, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resendHint: { color: colors.muted, fontSize: 12 },
  resendText: { color: colors.green, fontWeight: '900', fontSize: 12 },
  disabledText: { color: '#9AA69A' },
  termsRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', marginTop: 1, marginBottom: 7, flexWrap: 'wrap', gap: 5 },
  termsToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingRight: 2 },
  checkbox: { width: 22, height: 22, marginRight: 8, borderWidth: 1.5, borderColor: colors.green, borderRadius: 6, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.green },
  termsText: { color: colors.muted, fontSize: 12 },
  termsLink: { color: colors.green, fontSize: 12, fontWeight: '900' },
  button: { height: 52, marginTop: 5, borderRadius: 15, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: colors.white, fontWeight: '900', fontSize: 15 },
  switch: { paddingVertical: 13, alignItems: 'center' },
  switchText: { color: colors.green, fontWeight: '800', fontSize: 13 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 1, marginBottom: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { color: '#89958A', fontWeight: '900', fontSize: 9, letterSpacing: 1.1 },
  socialRow: { flexDirection: 'row', gap: 10 },
  socialButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
  socialText: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  guestButton: { minHeight: 48, marginTop: 10, borderRadius: 14, backgroundColor: '#EFF7EC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  guestText: { color: colors.green, fontWeight: '900', fontSize: 14 },
  guestNote: { marginTop: 8, color: colors.muted, textAlign: 'center', fontSize: 11, lineHeight: 16 },
});
