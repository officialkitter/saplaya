import { Alert, Platform } from 'react-native';
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import { registerPushToken } from './api';

export async function registerPushNotifications(): Promise<() => void> {
  const currentMessaging = getMessaging();
  const authorization = await requestPermission(currentMessaging);
  const isAuthorized = authorization === AuthorizationStatus.AUTHORIZED
    || authorization === AuthorizationStatus.PROVISIONAL;
  if (!isAuthorized) return () => undefined;

  const token = await getToken(currentMessaging);
  const platform = Platform.OS;
  if (platform !== 'android' && platform !== 'ios') return () => undefined;
  await registerPushToken(token, platform);

  const unsubscribeMessage = onMessage(currentMessaging, async (message) => {
    const title = message.notification?.title;
    const body = message.notification?.body;
    if (title || body) Alert.alert(title ?? 'Saplaya', body ?? 'Your order has an update.');
  });
  const unsubscribeToken = onTokenRefresh(currentMessaging, async (updatedToken) => {
    try {
      await registerPushToken(updatedToken, platform);
    } catch (error) {
      console.error('Could not refresh the order notification token:', error);
    }
  });
  return () => {
    unsubscribeMessage();
    unsubscribeToken();
  };
}
