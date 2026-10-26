import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnimatePresence, MotiView } from 'moti';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Navigation from './src/navigation';
import SplashMorph from './src/components/SplashMorph';
import { StoreProvider } from './src/store/StoreContext';
import { AccountProvider } from './src/store/AccountContext';
import { FlyProvider } from './src/store/FlyContext';
import { DeliveryProvider } from './src/lib/location';

export default function App() {
  const [splash, setSplash] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const finish = useCallback(() => setSplash(false), []);

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AccountProvider>
          <DeliveryProvider>
            <StoreProvider>
              <FlyProvider>
                <StatusBar style="dark" />
                {hasSeenOnboarding !== null && (
                  <Navigation initialRouteName={hasSeenOnboarding ? 'Tabs' : 'Onboarding'} />
                )}
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
              </FlyProvider>
            </StoreProvider>
          </DeliveryProvider>
        </AccountProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
