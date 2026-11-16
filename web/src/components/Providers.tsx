'use client';

import { MotionConfig } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/Bits';
import { useBoot, useDB } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { loadAdminData } from '@/lib/admin-data';
import { GlobalMarketProvider } from '@/lib/global-market';
import { StorefrontCartProvider } from '@/lib/cart';
import { withTimeout } from '@/lib/timeout';

function clearAdminData() {
  useDB.setState({
    suppliers: [],
    products: [],
    orders: [],
    movements: [],
    team: [],
    applications: [],
    sessionId: null,
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const setReady = useBoot((state) => state.setReady);
  const setError = useBoot((state) => state.setError);
  const attempt = useBoot((state) => state.attempt);

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    let supabase: ReturnType<typeof getSupabase>;
    try {
      supabase = getSupabase();
    } catch (error) {
      console.error('Could not initialize the admin session:', error);
      clearAdminData();
      setError('We couldn’t connect to your account. Please try again.');
      return;
    }

    const restore = async (hasSession: boolean) => {
      if (!active) return;
      const version = ++requestVersion;
      try {
        if (window.location.pathname === '/auth/callback' || !hasSession) {
          clearAdminData();
        } else {
          const member = await withTimeout(loadAdminData());
          if (active && version === requestVersion) {
            useDB.setState(member);
          }
        }
      } catch (error) {
        console.error('Could not load live admin data:', error);
        if (active && version === requestVersion) {
          clearAdminData();
          setError('We couldn’t load your team workspace. Please try again.');
        }
        return;
      }
      if (active && version === requestVersion) setReady();
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { void restore(Boolean(session)); }, 0);
    });
    void withTimeout(supabase.auth.getSession()).then(({ data, error }) => {
      if (error) throw error;
      if (active && requestVersion === 0) return restore(Boolean(data.session));
    }).catch((error: unknown) => {
      console.error('Could not restore live admin session:', error);
      if (active && requestVersion === 0) {
        clearAdminData();
        setError('We couldn’t connect to your account. Please try again.');
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [attempt, setReady, setError]);

  return (
    <MotionConfig reducedMotion="user">
      <GlobalMarketProvider>
        <StorefrontCartProvider>
          {children}
          <Toaster />
        </StorefrontCartProvider>
      </GlobalMarketProvider>
    </MotionConfig>
  );
}
