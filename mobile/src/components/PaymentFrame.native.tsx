import React from 'react';
import { Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { classifyPaymentNavigation } from '../lib/payment-navigation';

type Props = {
  paymentUrl: string;
  apiUrl: string;
  onCallback: () => void;
  onOriginChange: (origin: string) => void;
  onBrowserFallback: () => void;
  buttonColor: string;
  buttonTextColor: string;
};

export default function PaymentFrame({ paymentUrl, apiUrl, onCallback, onOriginChange, onBrowserFallback }: Props) {
  return (
    <WebView
      source={{ uri: paymentUrl }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(request) => {
        const action = classifyPaymentNavigation(request.url, apiUrl);
        if (action === 'callback') {
          onCallback();
          return false;
        }
        if (action === 'blocked') {
          Alert.alert('Open secure payment', 'This payment step needs the secure browser. Continue there to finish, then check the payment status.', [
            { text: 'Stay here', style: 'cancel' },
            { text: 'Open browser', onPress: onBrowserFallback },
          ]);
          return false;
        }
        return true;
      }}
      onNavigationStateChange={(state) => {
        try {
          const url = new URL(state.url);
          if (url.protocol === 'https:') onOriginChange(url.hostname);
        } catch {
          onOriginChange('');
        }
      }}
      onError={() => Alert.alert('Payment page unavailable', 'Try again or open the secure browser to continue your existing payment.', [
        { text: 'Close', style: 'cancel' },
        { text: 'Open browser', onPress: onBrowserFallback },
      ])}
    />
  );
}
