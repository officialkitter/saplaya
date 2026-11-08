import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnimatePresence } from 'moti/build/core';
import { View as MotiView } from 'moti/build/components/view';
import { Platform, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Navigation from './src/navigation';
import SplashMorph from './src/components/SplashMorph';
import { StoreProvider } from './src/store/StoreContext';
import { AccountProvider } from './src/store/AccountContext';
import { FlyProvider } from './src/store/FlyContext';
import { DeliveryProvider } from './src/lib/location';
import { CurrencyProvider } from './src/lib/currency';
import { navigationRef } from './src/navigation';
import { supabase } from './src/lib/supabase';
import { preloadStartupData } from './src/lib/startup';

void SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.error('Could not hold the native splash screen:', error);
});

export default function App() {
  const [splash, setSplash] = useState(true);
  const [splashAnimationFinished, setSplashAnimationFinished] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [startupReady, setStartupReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const pendingAuthNavigation = React.useRef(false);
  const finish = useCallback(() => setSplashAnimationFinished(true), []);
  const routeToShop = useCallback(() => {
    if (!navigationRef.isReady()) {
      pendingAuthNavigation.current = true;
      return;
    }
    pendingAuthNavigation.current = false;
    navigationRef.resetRoot({ index: 0, routes: [{ name: 'Tabs' }] });
  }, []);
  const handleNavigationReady = useCallback(() => {
    setNavigationReady(true);
    if (pendingAuthNavigation.current) routeToShop();
  }, [routeToShop]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem('saplaya.onboarding.complete').then((value) => {
      if (active) setHasSeenOnboarding(value === 'true');
    }).catch((error: unknown) => {
      console.error('Could not restore onboarding state:', error);
      if (active) setHasSeenOnboarding(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void preloadStartupData().then(() => {
      if (active) setStartupReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user && !session.user.is_anonymous) {
        routeToShop();
      }
    });
    return () => authListener.subscription.unsubscribe();
  }, [routeToShop]);

  useEffect(() => {
    if (hasSeenOnboarding === null || (Platform.OS !== 'web' && !startupReady)) return;
    void SplashScreen.hideAsync().catch((error: unknown) => {
      console.error('Could not hide the native splash screen:', error);
    });
  }, [hasSeenOnboarding, startupReady]);

  useEffect(() => {
    if (splashAnimationFinished && navigationReady && (Platform.OS === 'web' || startupReady)) setSplash(false);
  }, [navigationReady, splashAnimationFinished, startupReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#F9FBF7' }}>
      <SafeAreaProvider>
        <AccountProvider>
          <DeliveryProvider>
            <CurrencyProvider>
              <StoreProvider>
                <FlyProvider>
                  <StatusBar style="dark" />
                  {hasSeenOnboarding !== null && (
                    <Navigation
                      initialRouteName={hasSeenOnboarding ? 'Tabs' : 'Onboarding'}
                      onReady={handleNavigationReady}
                    />
                  )}
                  {Platform.OS === 'web' ? (
                    splash && <View style={StyleSheet.absoluteFill}><SplashMorph onFinish={finish} /></View>
                  ) : (
                    <AnimatePresence>
                      {splash && (
                        <MotiView
                          key="splash"
                          style={StyleSheet.absoluteFill}
                          from={{ opacity: 1 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ type: 'timing', duration: 400 }}
                        >
                          <SplashMorph onFinish={finish} />
                        </MotiView>
                      )}
                    </AnimatePresence>
                  )}
                </FlyProvider>
              </StoreProvider>
            </CurrencyProvider>
          </DeliveryProvider>
        </AccountProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
