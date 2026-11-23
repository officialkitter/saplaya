import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { generatedProductPhotoUri, productPhotoUrl } from '../lib/product-images';

export default function ProductImage({
  uri,
  name,
  style,
  fallbackColor,
  iconColor,
  iconSize = 42,
}: {
  uri: string | null | undefined;
  name: string;
  style: StyleProp<ViewStyle>;
  fallbackColor: string;
  iconColor: string;
  iconSize?: number;
}) {
  const fallbackUri = productPhotoUrl(name);
  const generatedUri = generatedProductPhotoUri(name);
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const sourceUri = uri && !primaryFailed ? uri : fallbackFailed ? generatedUri : fallbackUri;

  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [uri, fallbackUri]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[style, styles.container, { backgroundColor: '#FFFFFF' }]}
    >
      <Image
          source={{ uri: sourceUri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={180}
          onError={() => {
            if (uri && !primaryFailed) setPrimaryFailed(true);
            else setFallbackFailed(true);
          }}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
