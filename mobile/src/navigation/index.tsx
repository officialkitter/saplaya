import React from 'react';
import { createNavigationContainerRef, NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import CartScreen from '../screens/CartScreen';
import TrackingScreen from '../screens/TrackingScreen';
import AccountScreen from '../screens/AccountScreen';
import AccountDetailScreen from '../screens/AccountDetailScreen';
import AuthenticationScreen from '../screens/AuthenticationScreen';
import LocationPickerScreen from '../screens/LocationPickerScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import CartTabIcon from '../components/CartTabIcon';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: undefined;
  Account: undefined;
  AccountDetail: { section: string };
  Authentication: undefined;
  LocationPicker: undefined;
  Checkout: undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.cream, primary: colors.green } };

/**
 * Product detail lives INSIDE the tab navigator as a hidden tab so the tab bar
 * (and therefore the cart icon the particle flies to) stays visible.
 */
export default function Navigation({
  initialRouteName = 'Tabs',
  onReady,
}: {
  initialRouteName?: 'Tabs' | 'Onboarding';
  onReady?: () => void;
}) {
  return (
    <NavigationContainer ref={navigationRef} theme={theme} onReady={onReady}>
      <Stack.Navigator id="RootStack" initialRouteName={initialRouteName} screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.cream } }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Account" component={AccountScreen} />
        <Stack.Screen name="AccountDetail" component={AccountDetailScreen} />
        <Stack.Screen name="Authentication" component={AuthenticationScreen} />
        <Stack.Screen name="LocationPicker" component={LocationPickerScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
        tabBarStyle: { height: 66, paddingTop: 6, backgroundColor: colors.white, borderTopColor: colors.line },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} />, tabBarLabel: 'Shop' }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{ tabBarIcon: ({ color, size }) => <CartTabIcon color={color} size={size} />, tabBarLabel: 'Basket' }}
      />
      <Tab.Screen
        name="Tracking"
        component={TrackingScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="navigate-circle" size={size} color={color} />, tabBarLabel: 'Track' }}
      />
      <Tab.Screen
        name="Product"
        component={ProductDetailScreen}
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
    </Tab.Navigator>
  );
}
