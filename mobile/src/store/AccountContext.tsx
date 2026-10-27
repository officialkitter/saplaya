import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';
import type { ImagePickerAsset } from 'expo-image-picker';
import { ensureSession, supabase, supabaseOAuth } from '../lib/supabase';
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
  requestPasswordReset: (email: string) => Promise<void>;
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
const nativeAuthRedirect = 'saplaya://auth/callback';
let latestAuthCode: string | null = null;
let latestAuthCodeExchange: Promise<User | null> | null = null;
let latestAccessToken: string | null = null;
let latestSessionExchange: Promise<User | null> | null = null;

function getEmailCallbackUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_AUTH_CALLBACK_URL;
  if (configuredUrl) {
    const callback = new URL(configuredUrl);
    if (!callback.pathname.replace(/\/+$/, '').endsWith('/auth/callback')) {
      throw new Error('EXPO_PUBLIC_AUTH_CALLBACK_URL must point to the deployed /auth/callback page.');
    }
    if (callback.protocol !== 'https:' && callback.hostname !== 'localhost') {
      throw new Error('The authentication callback URL must use HTTPS.');
    }
    return callback.toString();
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  if (__DEV__) return Linking.createURL('auth/callback');
  throw new Error('Email links are not configured. Set EXPO_PUBLIC_AUTH_CALLBACK_URL to the deployed /auth/callback page.');
}

function requireData<T>(data: T | null, error: { message: string } | null, message: string): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error(message);
  return data;
}

async function completeAuthUrl(url: string): Promise<User | null> {
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  const callbackError = parsed.queryParams?.error_description ?? parsed.queryParams?.error;
  if (typeof callbackError === 'string') throw new Error(callbackError);
  if (typeof code === 'string') {
    if (latestAuthCode === code && latestAuthCodeExchange) return latestAuthCodeExchange;
    latestAuthCode = code;
    latestAuthCodeExchange = (async () => {
      const { data, error } = await supabaseOAuth.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (!data.session) return data.user;
      const { data: syncedSession, error: syncError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (syncError) throw syncError;
      return syncedSession.user ?? data.user;
    })();
    try {
      return await latestAuthCodeExchange;
    } catch (error) {
      if (latestAuthCode === code) {
        latestAuthCode = null;
        latestAuthCodeExchange = null;
      }
      throw error;
    }
  }

  const fragment = url.split('#')[1] ?? '';
  const params = new URLSearchParams(fragment);
  const fragmentError = params.get('error_description') ?? params.get('error');
  if (fragmentError) throw new Error(fragmentError);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  if (latestAccessToken === accessToken && latestSessionExchange) return latestSessionExchange;

  latestAccessToken = accessToken;
  latestSessionExchange = supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  }).then(({ data, error }) => {
    if (error) throw error;
    return data.user;
  });
  try {
    return await latestSessionExchange;
  } catch (error) {
    if (latestAccessToken === accessToken) {
      latestAccessToken = null;
      latestSessionExchange = null;
    }
    throw error;
  }
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
    const handle = (url: string) => {
      void completeAuthUrl(url).catch((authError: unknown) => {
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
    const redirectTo = Platform.OS === 'web' ? getEmailCallbackUrl() : nativeAuthRedirect;
    const { data, error: oauthError } = await supabaseOAuth.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      },
    });
    if (oauthError) throw oauthError;
    if (!data.url) throw new Error(`Could not start ${provider === 'google' ? 'Google' : 'Apple'} sign-in.`);

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { preferEphemeralSession: true });
    if (result.type === 'cancel' || result.type === 'dismiss') return false;
    if (result.type !== 'success' || !result.url) {
      throw new Error(`${provider === 'google' ? 'Google' : 'Apple'} sign-in returned without an authentication callback.`);
    }

    const callback = Linking.parse(result.url);
    const callbackPath = callback.path?.replace(/^\/+/, '');
    const isExpectedCallback = Platform.OS === 'web'
      ? Boolean(callbackPath?.endsWith('auth/callback'))
      : callback.scheme === 'saplaya' && callback.hostname === 'auth' && callbackPath === 'callback';
    if (!isExpectedCallback) {
      throw new Error('The sign-in provider returned to an unexpected address.');
    }
    const user = await completeAuthUrl(result.url);
    if (!user) throw new Error('The sign-in provider did not return a valid session.');
    setUser(mapSupabaseUser(user));
    setCustomerId(user.id);
    return true;
  }, [mapSupabaseUser]);

  const continueAsGuest = useCallback(async () => {
    await signOutPhoneAuth();
    const { data: current, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (current.session && !current.session.user.is_anonymous) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    }
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
      options: { emailRedirectTo: getEmailCallbackUrl(), data: { full_name: fullName.trim() } },
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
      options: { emailRedirectTo: getEmailCallbackUrl() },
    });
    if (resendError) throw resendError;
  }, [user]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getEmailCallbackUrl(),
    });
    if (resetError) throw resetError;
  }, []);

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
    const { client, userId } = await getCustomerDataContext();
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!supportedTypes.includes(mimeType)) throw new Error('Choose a JPEG, PNG, WebP, or HEIC photo.');
    if (!asset.base64) throw new Error('Could not prepare the selected photo. Please choose or take another photo.');
    const binary = atob(asset.base64);
    const file = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (file.length === 0) throw new Error('The selected photo is empty. Choose another photo and try again.');
    if (file.byteLength > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
    const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const bucket = client.storage.from('customer-avatars');
    const { error: uploadError } = await bucket.upload(path, file, {
      contentType: mimeType,
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);
    const avatarUrl = bucket.getPublicUrl(path).data.publicUrl;
    try {
      await saveProfile({ ...profile, avatarUrl });
    } catch (saveError) {
      const { error: removeError } = await bucket.remove([path]);
      if (removeError) {
        console.error('Could not remove the uploaded avatar after its profile save failed.', removeError.message);
      }
      throw saveError;
    }
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
    requestPasswordReset,
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
    user, profile, addresses, reviews, loading, error, signIn, signInWithProvider, continueAsGuest, register, requestEmailVerification, requestPasswordReset, sendPhoneOtp, verifyPhoneOtp, signOut,
    saveProfile, uploadAvatar, addAddress, selectAddress, removeAddress, addReview,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used within an AccountProvider.');
  return value;
}
