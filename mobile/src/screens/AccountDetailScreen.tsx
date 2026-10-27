import React, { useEffect, useState } from 'react';
import {
  Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { MotiView } from 'moti';
import ScreenHeader from '../components/ScreenHeader';
import BrandMark from '../components/BrandMark';
import { deletePaymentMethod, fetchPaymentMethods, SavedPaymentMethod, savePaymentMethod, submitSupplierApplication } from '../lib/api';
import { Place, useDeliveryActions, useDeliveryPlace } from '../lib/location';
import { useAccount } from '../store/AccountContext';
import { colors, radius, shadow } from '../theme';

const TITLES: Record<string, string> = {
  profile: 'Personal details',
  addresses: 'Saved addresses',
  payments: 'Payment methods',
  reviews: 'Reviews',
  supplier: 'Supplier registration',
  help: 'Help center',
  legal: 'Terms & privacy',
  about: 'About Saplaya',
  signout: 'Sign out',
};

export default function AccountDetailScreen({ route, navigation }: any) {
  const section: string = route.params?.section ?? 'profile';
  const title = TITLES[section] ?? 'Your account';
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />
      <MotiView style={{ flex: 1 }} from={{ opacity: 0, translateX: 12 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: 'timing', duration: 220 }}>
        {section === 'profile' && <ProfileDetails />}
        {section === 'addresses' && <Addresses />}
        {section === 'payments' && <PaymentMethods />}
        {section === 'reviews' && <Reviews />}
        {section === 'supplier' && <SupplierRegistration navigation={navigation} />}
        {section === 'help' && <HelpCenter />}
        {section === 'legal' && <Legal />}
        {section === 'about' && <About />}
        {section === 'signout' && <SignOut navigation={navigation} />}
      </MotiView>
    </SafeAreaView>
  );
}

function ProfileDetails() {
  const { user, profile, saveProfile, uploadAvatar, requestEmailVerification } = useAccount();
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone);
  const [busy, setBusy] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo library access to add a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    setBusy(true);
    try {
      await uploadAvatar(result.assets[0]);
    } catch (error) {
      Alert.alert('Could not save photo', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!fullName.trim()) {
      Alert.alert('Add your name', 'Enter the name you would like shown on your account.');
      return;
    }
    setBusy(true);
    try {
      await saveProfile({ ...profile, fullName, phone });
      Alert.alert('Saved', 'Your personal details have been updated.');
    } catch (error) {
      Alert.alert('Could not save profile', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendVerification = async () => {
    setBusy(true);
    try {
      await requestEmailVerification();
      setVerificationSent(true);
      Alert.alert('Check your inbox', 'We sent a link to verify your email address.');
    } catch (error) {
      Alert.alert('Could not send verification email', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.avatarBlock}>
        {profile.avatarUrl
          ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          : <View style={styles.avatarPlaceholder}><Ionicons name="person" size={40} color={colors.green} /></View>}
        <Pressable onPress={choosePhoto} style={styles.photoButton} disabled={busy}>
          <Ionicons name="camera-outline" size={17} color={colors.green} />
          <Text style={styles.photoText}>{busy ? 'Saving…' : 'Change photo'}</Text>
        </Pressable>
      </View>
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" />
      <Field label="Email address" value={user?.email ?? ''} editable={false} />
      {user?.email && !user.is_anonymous && (
        <View style={styles.emailVerificationCard}>
          <View style={styles.emailVerificationIcon}>
            <Ionicons name={user.emailVerified ? 'checkmark-circle' : 'mail-unread-outline'} size={21} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{user.emailVerified ? 'Email verified' : 'Verify your email'}</Text>
            <Text style={styles.cardBody}>
              {user.emailVerified
                ? 'Your email is ready for account updates.'
                : verificationSent ? 'Verification link sent. Check your inbox.' : 'Add a verified email to help secure account access.'}
            </Text>
          </View>
          {!user.emailVerified && (
            <Pressable onPress={() => void sendVerification()} disabled={busy} hitSlop={8}>
              <Text style={[styles.verificationAction, busy && styles.disabledAction]}>
                {busy ? 'Sending…' : verificationSent ? 'Resend link' : 'Send link'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <ActionButton title={busy ? 'Saving…' : 'Save details'} onPress={save} disabled={busy} />
      <Text style={styles.helper}>Your details are stored securely with your Saplaya account.</Text>
    </ScrollView>
  );
}

function Addresses() {
  const { addresses, addAddress, selectAddress, removeAddress } = useAccount();
  const place = useDeliveryPlace();
  const { setPlace, useCurrentLocation } = useDeliveryActions();
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<Place>(place);
  const [busy, setBusy] = useState(false);

  const currentLocation = async () => {
    setBusy(true);
    try {
      const current = await useCurrentLocation();
      setCoordinates(current);
    } catch (error) {
      Alert.alert('Could not get location', error instanceof Error ? error.message : 'Choose an address or try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!label.trim() || !address.trim()) {
      Alert.alert('Add address details', 'Enter a label and delivery address first.');
      return;
    }
    setBusy(true);
    try {
      await addAddress({ label: label.trim(), address: address.trim(), lat: coordinates.lat, lng: coordinates.lng });
      await setPlace({ ...coordinates, label: address.trim() });
      setLabel('');
      setAddress('');
      Alert.alert('Address saved', 'This address is ready for your next order.');
    } catch (error) {
      Alert.alert('Could not save address', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const choose = async (id: string) => {
    const saved = addresses.find((entry) => entry.id === id);
    if (!saved) return;
    try {
      await selectAddress(id);
      await setPlace({ lat: saved.lat, lng: saved.lng, label: saved.address, approximate: false });
      Alert.alert('Delivery address updated', `Your next order will go to ${saved.label}.`);
    } catch (error) {
      Alert.alert('Could not update address', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const remove = (id: string) => Alert.alert('Remove address?', 'This address will no longer appear at checkout.', [
    { text: 'Keep address', style: 'cancel' },
    {
      text: 'Remove',
      style: 'destructive',
      onPress: () => removeAddress(id).catch((error: unknown) => {
        Alert.alert('Could not remove address', error instanceof Error ? error.message : 'Please try again.');
      }),
    },
  ]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>Choose an address for delivery, or add a new one below.</Text>
      {addresses.map((saved) => (
        <View key={saved.id} style={[styles.addressCard, saved.isDefault && styles.selectedAddress]}>
          <Pressable style={styles.addressMain} onPress={() => choose(saved.id)}>
            <Ionicons name={saved.isDefault ? 'checkmark-circle' : 'location-outline'} size={22} color={colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{saved.label}{saved.isDefault ? ' · Selected' : ''}</Text>
              <Text style={styles.cardBody}>{saved.address}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => remove(saved.id)} style={styles.deleteAddress} accessibilityLabel={`Delete ${saved.label}`}>
            <Ionicons name="trash-outline" size={20} color="#C62828" />
          </Pressable>
        </View>
      ))}

      <View style={[styles.formCard, shadow]}>
        <Text style={styles.cardTitle}>Add a delivery address</Text>
        <Field label="Address label" value={label} onChangeText={setLabel} placeholder="Home, work…" />
        <Field label="Street, area or landmark" value={address} onChangeText={setAddress} placeholder="Add directions for your rider" />
        <Pressable style={styles.locationButton} onPress={currentLocation} disabled={busy}>
          <Ionicons name="locate-outline" size={19} color={colors.green} />
          <Text style={styles.locationButtonText}>{busy ? 'Finding location…' : 'Use my current location'}</Text>
        </Pressable>
        <Text style={styles.helper}>
          Map point: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}{coordinates.approximate ? ' · approximate' : ''}
        </Text>
        <ActionButton title={busy ? 'Saving…' : 'Save address'} onPress={save} disabled={busy} />
      </View>
    </ScrollView>
  );
}

function PaymentMethods() {
  const { isSignedIn } = useAccount();
  const [methods, setMethods] = useState<SavedPaymentMethod[]>([]);
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('Mobile money');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchPaymentMethods().then((result) => {
      if (active) setMethods(result);
    }).catch((error: unknown) => {
      if (active) Alert.alert('Could not load payment methods', error instanceof Error ? error.message : 'Please try again.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const addMethod = async () => {
    if (!phone.trim()) {
      Alert.alert('Add a phone number', 'Enter the mobile money number you want to use at checkout.');
      return;
    }
    setBusy(true);
    try {
      const saved = await savePaymentMethod({ label, phone: phone.trim() });
      setMethods((current) => {
        const withoutDuplicate = current.filter((method) => method.id !== saved.id);
        return saved.is_default
          ? [saved, ...withoutDuplicate.map((method) => ({ ...method, is_default: false }))]
          : [...withoutDuplicate, saved];
      });
      setPhone('');
    } catch (error) {
      Alert.alert('Could not save payment method', error instanceof Error ? error.message : 'Please check the number and try again.');
    } finally {
      setBusy(false);
    }
  };

  const removeMethod = (method: SavedPaymentMethod) => {
    Alert.alert('Remove mobile money number?', method.phone_e164, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deletePaymentMethod(method.id);
            setMethods(await fetchPaymentMethods());
          } catch (error) {
            Alert.alert('Could not remove payment method', error instanceof Error ? error.message : 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (!isSignedIn) return null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.cardTitle}>Saved payment methods</Text>
      <Text style={styles.helper}>Select a saved number during checkout.</Text>

      {loading ? (
        <View style={styles.paymentLoading}><Text style={styles.helper}>Loading…</Text></View>
      ) : methods.length === 0 ? (
        <View style={styles.paymentEmpty}>
          <Ionicons name="wallet-outline" size={30} color={colors.green} />
          <Text style={styles.cardTitle}>Add your first mobile money number</Text>
        </View>
      ) : methods.map((method) => (
        <View key={method.id} style={[styles.paymentMethodRow, styles.addressCard]}>
          <View style={styles.paymentIcon}><Ionicons name="phone-portrait-outline" size={22} color={colors.green} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{method.label}{method.is_default ? ' · Preferred' : ''}</Text>
            <Text style={styles.cardBody}>{method.phone_e164}</Text>
          </View>
          <Pressable onPress={() => removeMethod(method)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Remove ${method.label} number`}>
            <Ionicons name="trash-outline" size={20} color="#B3261E" />
          </Pressable>
        </View>
      ))}

      <View style={[styles.formCard, shadow]}>
        <Text style={styles.cardTitle}>Add mobile money</Text>
        <Field label="Network name" value={label} onChangeText={setLabel} placeholder="e.g. M-Pesa" />
        <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+255 7XX XXX XXX" />
        <ActionButton title={busy ? 'Saving…' : 'Save number'} onPress={() => void addMethod()} disabled={busy} />
      </View>

      <View style={styles.paymentCardOption}>
        <Ionicons name="card-outline" size={22} color={colors.green} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Cards</Text>
          <Text style={styles.cardBody}>Available in secure online checkout.</Text>
        </View>
        <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
      </View>
    </ScrollView>
  );
}

function Reviews() {
  const { reviews, addReview } = useAccount();
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await addReview(rating, message);
      setMessage('');
      setRating(5);
      Alert.alert('Thank you', 'Your review has been saved.');
    } catch (error) {
      Alert.alert('Could not save review', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>Tell us how we’re doing. Your feedback helps local farms and our delivery team.</Text>
      <View style={[styles.formCard, shadow]}>
        <Text style={styles.cardTitle}>Rate your Saplaya experience</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable key={value} onPress={() => setRating(value)} accessibilityLabel={`${value} stars`}>
              <Ionicons name={value <= rating ? 'star' : 'star-outline'} size={32} color={colors.yellowDeep} />
            </Pressable>
          ))}
        </View>
        <Field label="Your review" value={message} onChangeText={setMessage} placeholder="What went well? What can we improve?" multiline />
        <ActionButton title={busy ? 'Sending…' : 'Submit review'} onPress={submit} disabled={busy} />
      </View>
      {reviews.map((review) => (
        <View key={review.id} style={styles.reviewCard}>
          <Text style={styles.reviewStars}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</Text>
          <Text style={styles.cardBody}>{review.message}</Text>
          <Text style={styles.helper}>{new Date(review.createdAt).toLocaleDateString()}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function SupplierRegistration({ navigation }: { navigation: any }) {
  const { isSignedIn, user, profile } = useAccount();
  const [farmName, setFarmName] = useState('');
  const [contactName, setContactName] = useState(profile.fullName);
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(profile.phone);
  const [location, setLocation] = useState('');
  const [products, setProducts] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!farmName.trim() || !contactName.trim() || !email.trim() || !phone.trim() || !location.trim() || !products.trim()) {
      Alert.alert('Complete your application', 'Fill in the farm, contact, location and product details before submitting.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || phone.trim().length < 5) {
      Alert.alert('Check your contact details', 'Enter a valid email address and phone number.');
      return;
    }
    setBusy(true);
    try {
      const result = await submitSupplierApplication({ farmName, contactName, email, phone, location, products });
      Alert.alert('Application sent', `Your supplier application is ${result.status}. We’ll be in touch.`);
      setFarmName('');
      setLocation('');
      setProducts('');
    } catch (error) {
      Alert.alert('Could not submit application', error instanceof Error ? error.message : 'Please check your details and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!isSignedIn) {
    return (
      <View style={styles.centerContent}>
        <Ionicons name="storefront-outline" size={56} color={colors.green} />
        <Text style={styles.cardTitle}>Apply to sell on Saplaya</Text>
        <Text style={styles.intro}>Sign in or create an account before registering your farm.</Text>
        <ActionButton title="Sign in or create account" onPress={() => navigation.navigate('Authentication')} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>Tell us about your farm. Our team will review your application before your products appear in the shop.</Text>
      <Field label="Farm or business name" value={farmName} onChangeText={setFarmName} />
      <Field label="Contact name" value={contactName} onChangeText={setContactName} autoComplete="name" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Farm location" value={location} onChangeText={setLocation} placeholder="District, ward or nearby landmark" />
      <Field label="What do you grow or supply?" value={products} onChangeText={setProducts} multiline placeholder="List your main crops or products" />
      <ActionButton title={busy ? 'Submitting…' : 'Send application'} onPress={submit} disabled={busy} />
    </ScrollView>
  );
}

function HelpCenter() {
  const openSupport = async () => {
    try {
      await Linking.openURL('mailto:?subject=Saplaya%20customer%20support');
    } catch (error) {
      Alert.alert('Could not open email', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Quick answers for your Saplaya shopping experience.</Text>
      <InfoCard icon="cube-outline" title="Where is my order?" body="Open My orders or Track in the bottom navigation to see delivery progress and order history." />
      <InfoCard icon="card-outline" title="When is payment confirmed?" body="Online orders are confirmed after the provider verifies payment. Cash-on-delivery orders are confirmed when you place them." />
      <InfoCard icon="location-outline" title="Can I change my delivery point?" body="Tap the delivery location at the top of the shop, or choose a saved address at checkout." />
      <Pressable style={styles.locationButton} onPress={openSupport}>
        <Ionicons name="mail-outline" size={20} color={colors.green} />
        <Text style={styles.locationButtonText}>Email customer support</Text>
      </Pressable>
    </ScrollView>
  );
}

function Legal() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.legalHero}>
        <View style={styles.legalHeroIcon}><Ionicons name="shield-checkmark" size={23} color={colors.green} /></View>
        <Text style={styles.legalTitle}>Your trust matters</Text>
        <Text style={styles.legalIntro}>Here is how Saplaya orders work and how we use the information needed to serve you.</Text>
        <Text style={styles.legalUpdated}>Saplaya customer terms and privacy</Text>
      </View>
      <LegalSection
        icon="document-text-outline"
        title="Using Saplaya"
        body="Saplaya connects customers with participating local suppliers. Keep your account and contact details accurate, use the service lawfully, and protect your sign-in credentials. You may shop as a guest; guest order history remains associated with that guest session."
      />
      <LegalSection
        icon="bag-handle-outline"
        title="Orders, prices and availability"
        body="Product availability and stock can change. The price, quantity tier, delivery charge and total are confirmed at checkout. A submitted online order is fulfilled after payment is verified; a cash-on-delivery order is submitted when you confirm it. Supplier applications are reviewed before a farm can sell through Saplaya."
      />
      <LegalSection
        icon="time-outline"
        title="Delivery and payment"
        body="Choose an available delivery window at checkout and provide a delivery location where service is available. Online payment is processed through the payment provider's secure checkout. Saplaya does not request or store your card security code or mobile-money PIN. If payment status is pending, check order tracking before starting another payment."
      />
      <LegalSection
        icon="person-circle-outline"
        title="Information used to provide the service"
        body="Depending on how you use Saplaya, your account may include your name, email or phone number, saved delivery addresses, saved mobile-money contact numbers, reviews and order details. We use this information to authenticate your account, prepare and deliver orders, provide support and show order history. Notification permission is optional."
      />
      <LegalSection
        icon="share-social-outline"
        title="Service partners"
        body="Order details needed to prepare and deliver your purchase are shared with the relevant supplier and delivery operation. Payment details needed to complete an online transaction are sent to the payment provider. Each partner processes information according to its own service terms and privacy practices."
      />
      <LegalSection
        icon="settings-outline"
        title="Your choices"
        body="You can update profile details, saved addresses and saved payment contact numbers in Account settings. You can decline notification permission in your device settings. Contact Saplaya through the Help center for questions about an order or your account information."
      />
      <Text style={styles.legalFootnote}>
        These in-app terms explain the customer experience and are not a substitute for legal advice. Contact Saplaya support if you need help understanding how a specific order or account detail is handled.
      </Text>
    </ScrollView>
  );
}

function About() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.aboutMark}><BrandMark size={72} /></View>
      <Text style={styles.aboutTitle}>Saplaya</Text>
      <Text style={styles.intro}>Fresh food from local farms, delivered with care.</Text>
      <InfoCard icon="storefront-outline" title="One easy shop" body="Shop seasonal produce from multiple local farms in one simple basket." />
      <InfoCard icon="people-outline" title="Supporting growers" body="We help independent farms reach nearby households and businesses." />
    </ScrollView>
  );
}

function SignOut({ navigation }: { navigation: any }) {
  const { signOut } = useAccount();
  const [busy, setBusy] = useState(false);
  const confirm = () => Alert.alert('Sign out of Saplaya?', 'You can sign back in at any time.', [
    { text: 'Stay signed in', style: 'cancel' },
    {
      text: 'Sign out',
      style: 'destructive',
      onPress: async () => {
        setBusy(true);
        try {
          await signOut();
          navigation.popToTop();
        } catch (error) {
          Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.');
        } finally {
          setBusy(false);
        }
      },
    },
  ]);
  return (
    <View style={styles.centerContent}>
      <Ionicons name="log-out-outline" size={56} color="#C62828" />
      <Text style={styles.cardTitle}>{busy ? 'Signing out…' : 'Ready to sign out?'}</Text>
      <Text style={styles.intro}>Your orders will remain linked to your account.</Text>
      <ActionButton title="Sign out" onPress={confirm} disabled={busy} />
    </View>
  );
}

function Field({ label, helper, ...props }: { label: string; helper?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        style={[styles.input, props.multiline && styles.multiline]}
        placeholderTextColor={colors.muted}
      />
      {helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

function ActionButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.actionButton, disabled && { opacity: 0.6 }]} onPress={onPress} disabled={disabled}>
      <Text style={styles.actionText}>{title}</Text>
    </Pressable>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}><Ionicons name={icon} size={21} color={colors.green} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
    </View>
  );
}

function LegalSection({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
  return (
    <View style={styles.legalSection}>
      <View style={styles.infoIcon}><Ionicons name={icon} size={21} color={colors.green} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.legalSectionTitle}>{title}</Text>
        <Text style={styles.legalSectionBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 36 },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  avatarBlock: { alignItems: 'center', marginBottom: 22 },
  avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.line },
  avatarPlaceholder: { width: 104, height: 104, borderRadius: 52, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 8 },
  photoText: { color: colors.green, fontWeight: '800' },
  fieldWrap: { marginBottom: 14 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 14, color: colors.ink, fontSize: 15 },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  emailVerificationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 14, borderRadius: radius.md, backgroundColor: colors.white },
  emailVerificationIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF7EC' },
  verificationAction: { color: colors.green, fontWeight: '900', fontSize: 12 },
  disabledAction: { opacity: 0.55 },
  actionButton: { minHeight: 54, marginTop: 8, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: colors.white, fontWeight: '900', fontSize: 16 },
  addressCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  selectedAddress: { borderColor: colors.green, backgroundColor: '#F4FAF1' },
  addressMain: { flex: 1, minHeight: 76, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  deleteAddress: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 16 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  cardBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  formCard: { marginTop: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.white },
  locationButton: { minHeight: 48, marginVertical: 8, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radius.md, backgroundColor: '#EFF7EC' },
  locationButtonText: { color: colors.green, fontSize: 14, fontWeight: '800' },
  paymentIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
  paymentLoading: { minHeight: 88, alignItems: 'center', justifyContent: 'center' },
  paymentEmpty: { minHeight: 120, marginTop: 14, marginBottom: 12, padding: 20, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 10 },
  paymentMethodRow: { padding: 14, gap: 12 },
  paymentCardOption: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 16, borderRadius: radius.md, backgroundColor: colors.white },
  stars: { flexDirection: 'row', gap: 10, marginVertical: 14 },
  reviewCard: { marginTop: 12, padding: 15, borderRadius: radius.md, backgroundColor: colors.white },
  reviewStars: { color: colors.yellowDeep, fontSize: 18, marginBottom: 5 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  infoCard: { flexDirection: 'row', gap: 12, padding: 16, marginBottom: 12, borderRadius: radius.md, backgroundColor: colors.white },
  infoIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EFF7EC', alignItems: 'center', justifyContent: 'center' },
  legalHero: { padding: 20, marginBottom: 16, borderRadius: radius.lg, backgroundColor: colors.green },
  legalHeroIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  legalTitle: { marginTop: 16, color: colors.white, fontSize: 24, lineHeight: 30, fontWeight: '900' },
  legalIntro: { marginTop: 6, color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 21 },
  legalUpdated: { marginTop: 14, color: '#FBE89C', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  legalSection: { flexDirection: 'row', gap: 12, padding: 16, marginBottom: 10, borderRadius: radius.md, backgroundColor: colors.white },
  legalSectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  legalSectionBody: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 20 },
  legalFootnote: { paddingHorizontal: 4, paddingTop: 5, color: colors.muted, fontSize: 11, lineHeight: 17 },
  aboutMark: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  aboutTitle: { color: colors.green, fontSize: 30, fontWeight: '900', marginTop: 12, marginBottom: 4 },
});
