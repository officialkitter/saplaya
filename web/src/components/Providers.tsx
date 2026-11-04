'use client';

import { MotionConfig } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/Bits';
import { useBoot, useDB } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { loadAdminData } from '@/lib/admin-data';
import { GlobalMarketProvider } from '@/lib/global-market';

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

  useEffect(() => {
    let active = true;
    let requestVersion = 0;
    const supabase = getSupabase();

    const restore = async (hasSession: boolean) => {
      const version = ++requestVersion;
      try {
        if (!hasSession) {
          clearAdminData();
          return;
        }
        const member = await loadAdminData();
        if (active && version === requestVersion) {
          useDB.setState(member);
        }
      } catch (error) {
        console.error('Could not load live admin data:', error);
        if (active && version === requestVersion) {
          clearAdminData();
          setReady();
        }
      } finally {
        if (active) setReady();
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { void restore(Boolean(session)); }, 0);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      return restore(Boolean(data.session));
    }).catch((error: unknown) => {
      console.error('Could not restore live admin session:', error);
      if (active) {
        clearAdminData();
        setReady();
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [setReady]);

  return (
    <MotionConfig reducedMotion="user">
      <GlobalMarketProvider>
        {children}
        <Toaster />
      </GlobalMarketProvider>
    </MotionConfig>
  );
}
