import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { User } from '@supabase/supabase-js';
import type { ImagePickerAsset } from 'expo-image-picker';
import { ensureSession, supabase } from '../lib/supabase';
import {
  getCurrentPhoneIdentity,
  getCustomerDataContext,
  sendPhoneOtp as sendCustomerPhoneOtp,
  signOutPhoneAuth,
  subscribePhoneAuth,
  verifyPhoneOtp as verifyCustomerPhoneOtp,
} from '../lib/customer-auth';
import type { CustomerIdentity } from '../lib/customer-auth.types';

type AccountUser = CustomerIdentity & {
  emailVerified?: boolean;
  emailVerificationType?: 'signup' | 'email_change';
};

export type AccountProfile = {
  fullName: string;
  phone: string;
  avatarUrl: string | null;
};

export type SavedAddress = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
};

export type CustomerReview = {
  id: string;
  rating: number;
  message: string;
  createdAt: string;
};

type AccountContextValue = {
  user: AccountUser | null;
  isSignedIn: boolean;
  profile: AccountProfile;
  addresses: SavedAddress[];
  reviews: CustomerReview[];
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: 'google' | 'apple') => Promise<boolean>;
  continueAsGuest: () => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<boolean>;
  requestEmailVerification: () => Promise<void>;
  sendPhoneOtp: (phone: string, fullName?: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (profile: AccountProfile) => Promise<void>;
  uploadAvatar: (asset: ImagePickerAsset) => Promise<void>;
  addAddress: (address: Omit<SavedAddress, 'id' | 'isDefault'>) => Promise<void>;
  selectAddress: (id: string) => Promise<void>;
  removeAddress: (id: string) => Promise<void>;
  addReview: (rating: number, message: string) => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

const emptyProfile: AccountProfile = { fullName: '', phone: '', avatarUrl: null };

function requireData<T>(data: T | null, error: { message: string } | null, message: string): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error(message);
  return data;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapSupabaseUser = useCallback((supabaseUser: User | null): AccountUser | null => {
    if (!supabaseUser) return null;
    return {
      id: supabaseUser.id,
      email: supabaseUser.email ?? null,
      phone: supabaseUser.phone ?? null,
      is_anonymous: Boolean(supabaseUser.is_anonymous),
      emailVerified: Boolean(supabaseUser.email_confirmed_at),
      emailVerificationType: supabaseUser.user_metadata?.email_pending_verification === true ? 'email_change' : 'signup',
    };
  }, []);

  useEffect(() => {
    let active = true;
    let version = 0;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) throw sessionError;
      if (active && !getCurrentPhoneIdentity()) {
        const sessionUser = data.session?.user ?? null;
        setUser(mapSupabaseUser(sessionUser));
        setCustomerId(sessionUser?.id ?? null);
      }
    }).catch((sessionError: unknown) => {
      if (active) setError(sessionError instanceof Error ? sessionError.message : 'Could not restore your account.');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && !getCurrentPhoneIdentity()) {
        const sessionUser = session?.user ?? null;
        setUser(mapSupabaseUser(sessionUser));
        setCustomerId(sessionUser?.id ?? null);
      }
    });
    const unsubscribePhoneAuth = subscribePhoneAuth((phoneUser) => {
      const currentVersion = ++version;
      if (!phoneUser) {
        void supabase.auth.getSession().then(({ data, error: sessionError }) => {
          if (sessionError) throw sessionError;
          if (!active || currentVersion !== version) return;
          const sessionUser = data.session?.user ?? null;
          setUser(mapSupabaseUser(sessionUser));
          setCustomerId(sessionUser?.id ?? null);
        }).catch((sessionError: unknown) => {
          if (active && currentVersion === version) {
            setError(sessionError instanceof Error ? sessionError.message : 'Could not restore your account.');
          }
        });
        return;
      }

      setUser(phoneUser);
      setCustomerId(null);
      void getCustomerDataContext().then(({ userId }) => {
        if (active && currentVersion === version) setCustomerId(userId);
      }).catch((identityError: unknown) => {
        if (active && currentVersion === version) {
          setError(identityError instanceof Error ? identityError.message : 'Could not restore your account.');
        }
      });
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      unsubscribePhoneAuth();
    };
  }, [mapSupabaseUser]);

  useEffect(() => {
    let active = true;
    const processAuthUrl = async (url: string) => {
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code;
      if (typeof code === 'string') {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        return;
      }
      const fragment = url.split('#')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
      }
    };
    const handle = (url: string) => {
      void processAuthUrl(url).catch((authError: unknown) => {
        if (active) setError(authError instanceof Error ? authError.message : 'Could not verify your email link.');
      });
    };
    void Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    }).catch((urlError: unknown) => {
      if (active) setError(urlError instanceof Error ? urlError.message : 'Could not open your email link.');
    });
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      if (!user) {
        if (active) {
          setProfile(emptyProfile);
          setAddresses([]);
          setReviews([]);
        }
        return;
      }
      if (!customerId) return;

      const { client, userId } = await getCustomerDataContext();
      const [profileResult, addressResult, reviewResult] = await Promise.all([
        client.from('customer_profiles').select('full_name, phone, avatar_url').eq('customer_id', userId).maybeSingle(),
        client.from('customer_addresses').select('id, label, address, lat, lng, is_default').eq('customer_id', userId).order('created_at', { ascending: false }),
        client.from('customer_reviews').select('id, rating, message, created_at').eq('customer_id', userId).order('created_at', { ascending: false }).limit(20),
      ]);
      if (profileResult.error || addressResult.error || reviewResult.error) {
        throw new Error(profileResult.error?.message ?? addressResult.error?.message ?? reviewResult.error?.message);
      }
      if (active) {
        setProfile({
          fullName: profileResult.data?.full_name ?? '',
          phone: profileResult.data?.phone ?? '',
          avatarUrl: profileResult.data?.avatar_url ?? null,
        });
        setAddresses((addressResult.data ?? []).map((address) => ({
          id: address.id,
          label: address.label,
          address: address.address,
          lat: Number(address.lat),
          lng: Number(address.lng),
          isDefault: address.is_default,
        })));
        setReviews((reviewResult.data ?? []).map((review) => ({
          id: review.id,
          rating: review.rating,
          message: review.message,
          createdAt: review.created_at,
        })));
      }
    };

    load().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your account details.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user, customerId]);

  useEffect(() => {
    if (!user || user.is_anonymous || !customerId) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import('../lib/push-notifications')
      .then(({ registerPushNotifications }) => registerPushNotifications())
      .then((stopListening) => {
        if (active) unsubscribe = stopListening;
        else stopListening();
      })
      .catch((pushError: unknown) => {
        console.error('Could not enable order notifications:', pushError);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [user, customerId]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signOutPhoneAuth();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  }, []);

  const signInWithProvider = useCallback(async (provider: 'google' | 'apple') => {
    await signOutPhoneAuth();
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (oauthError) throw oauthError;
    if (!data.url) throw new Error(`Could not start ${provider === 'google' ? 'Google' : 'Apple'} sign-in.`);

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { preferEphemeralSession: true });
    if (result.type !== 'success' || !result.url) return false;

    const callback = Linking.parse(result.url);
    const code = callback.queryParams?.code;
    if (typeof code === 'string') {
      const { data: session, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      if (!session.user) throw new Error('The sign-in provider did not return a user.');
      setUser(mapSupabaseUser(session.user));
      setCustomerId(session.user.id);
      return true;
    }

    const fragment = result.url.split('#')[1] ?? '';
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) throw new Error('The sign-in provider did not return a valid session.');
    const { data: session, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
    if (!session.user) throw new Error('The sign-in provider did not return a user.');
    setUser(mapSupabaseUser(session.user));
    setCustomerId(session.user.id);
    return true;
  }, [mapSupabaseUser]);

  const continueAsGuest = useCallback(async () => {
    await signOutPhoneAuth();
    const session = await ensureSession();
    setUser(mapSupabaseUser(session.user));
    setCustomerId(session.user.id);
  }, [mapSupabaseUser]);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    await signOutPhoneAuth();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user.is_anonymous) {
      const { data, error: updateError } = await supabase.auth.updateUser({
        email,
        password,
        data: { full_name: fullName.trim(), email_pending_verification: true },
      });
      if (updateError) throw updateError;
      const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession();
      if (currentSessionError) throw currentSessionError;
      const updatedUser = currentSession.session?.user ?? data.user;
      if (updatedUser) {
        setUser({
          ...mapSupabaseUser(updatedUser)!,
          emailVerificationType: 'email_change',
        });
        setCustomerId(updatedUser.id);
      }
      return !currentSession.session;
    }
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: Linking.createURL('auth/callback'), data: { full_name: fullName.trim() } },
    });
    if (signUpError) throw signUpError;
    if (data.session?.user) {
      setUser(mapSupabaseUser(data.session.user));
      setCustomerId(data.session.user.id);
    }
    return !data.session;
  }, [mapSupabaseUser]);

  const requestEmailVerification = useCallback(async () => {
    if (!user?.email) throw new Error('Add an email address to your account before requesting verification.');
    if (user.emailVerified) throw new Error('This email address is already verified.');
    const { error: resendError } = await supabase.auth.resend({
      type: user.emailVerificationType ?? 'signup',
      email: user.email,
      options: { emailRedirectTo: Linking.createURL('auth/callback') },
    });
    if (resendError) throw resendError;
  }, [user]);

  const sendPhoneOtp = useCallback(async (phone: string, fullName?: string) => {
    await sendCustomerPhoneOtp(phone, fullName);
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    const phoneUser = await verifyCustomerPhoneOtp(phone, token);
    const { userId } = await getCustomerDataContext();
    setUser(phoneUser);
    setCustomerId(userId);
  }, []);

  const signOut = useCallback(async () => {
    await signOutPhoneAuth();
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }, []);

  const saveProfile = useCallback(async (nextProfile: AccountProfile) => {
    const { client, userId } = await getCustomerDataContext();
    const result = await client.from('customer_profiles').upsert({
      customer_id: userId,
      full_name: nextProfile.fullName.trim(),
      phone: nextProfile.phone.trim(),
      avatar_url: nextProfile.avatarUrl,
      updated_at: new Date().toISOString(),
    });
    if (result.error) throw new Error(result.error.message);
    setProfile(nextProfile);
  }, []);

  const uploadAvatar = useCallback(async (asset: ImagePickerAsset) => {
    let avatarUrl = asset.uri;
    const { client, userId } = await getCustomerDataContext();
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error('Could not read the selected photo.');
    const file = await response.blob();
    const extension = asset.mimeType?.split('/')[1] ?? 'jpg';
    const path = `${userId}/${Date.now()}.${extension}`;
    const { error: uploadError } = await client.storage.from('customer-avatars').upload(path, file, {
      contentType: asset.mimeType ?? 'image/jpeg',
      upsert: true,
    });
    if (uploadError) throw new Error(uploadError.message);
    avatarUrl = client.storage.from('customer-avatars').getPublicUrl(path).data.publicUrl;
    await saveProfile({ ...profile, avatarUrl });
  }, [profile, saveProfile]);

  const addAddress = useCallback(async (input: Omit<SavedAddress, 'id' | 'isDefault'>) => {
    const { client, userId } = await getCustomerDataContext();
    const { data, error: insertError } = await client.from('customer_addresses').insert({
      customer_id: userId,
      label: input.label.trim(),
      address: input.address.trim(),
      lat: input.lat,
      lng: input.lng,
      is_default: addresses.length === 0,
    }).select('id, label, address, lat, lng, is_default').single();
    const saved = requireData(data, insertError, 'Could not save this address.');
    setAddresses((current) => [{ ...input, id: saved.id, isDefault: saved.is_default }, ...current]);
  }, [addresses]);

  const selectAddress = useCallback(async (id: string) => {
    const address = addresses.find((entry) => entry.id === id);
    if (!address) throw new Error('This saved address could not be found.');
    const { client, userId } = await getCustomerDataContext();
    const { error: unsetError } = await client.from('customer_addresses')
      .update({ is_default: false }).eq('customer_id', userId);
    if (unsetError) throw new Error(unsetError.message);
    const { error: setError } = await client.from('customer_addresses')
      .update({ is_default: true }).eq('customer_id', userId).eq('id', id);
    if (setError) throw new Error(setError.message);
    const next = addresses.map((entry) => ({ ...entry, isDefault: entry.id === id }));
    setAddresses(next);
  }, [addresses]);

  const removeAddress = useCallback(async (id: string) => {
    const { client, userId } = await getCustomerDataContext();
    const { error: deleteError } = await client.from('customer_addresses')
      .delete().eq('customer_id', userId).eq('id', id);
    if (deleteError) throw new Error(deleteError.message);
    const next = addresses.filter((entry) => entry.id !== id);
    if (!next.some((entry) => entry.isDefault) && next.length) next[0].isDefault = true;
    setAddresses(next);
  }, [addresses]);

  const addReview = useCallback(async (rating: number, message: string) => {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !message.trim()) {
      throw new Error('Choose a rating and write a short review.');
    }
    let nextReview: CustomerReview;
    const { client, userId } = await getCustomerDataContext();
    const { data, error: insertError } = await client.from('customer_reviews').insert({
      customer_id: userId,
      rating,
      message: message.trim(),
    }).select('id, rating, message, created_at').single();
    const saved = requireData(data, insertError, 'Could not save your review.');
    nextReview = { id: saved.id, rating: saved.rating, message: saved.message, createdAt: saved.created_at };
    const next = [nextReview, ...reviews];
    setReviews(next);
  }, [reviews]);

  const value = useMemo<AccountContextValue>(() => ({
    user,
    isSignedIn: Boolean(user && !user.is_anonymous),
    profile,
    addresses,
    reviews,
    loading,
    error,
    signIn,
    signInWithProvider,
    continueAsGuest,
    register,
    requestEmailVerification,
    sendPhoneOtp,
    verifyPhoneOtp,
    signOut,
    saveProfile,
    uploadAvatar,
    addAddress,
    selectAddress,
    removeAddress,
    addReview,
  }), [
    user, profile, addresses, reviews, loading, error, signIn, signInWithProvider, continueAsGuest, register, requestEmailVerification, sendPhoneOtp, verifyPhoneOtp, signOut,
    saveProfile, uploadAvatar, addAddress, selectAddress, removeAddress, addReview,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used within an AccountProvider.');
  return value;
}
