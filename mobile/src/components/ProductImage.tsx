import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { productPhotoUrl } from '../lib/product-images';

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
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const sourceUri = uri && !primaryFailed ? uri : fallbackUri;
  const showIcon = fallbackFailed;

  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
  }, [uri, fallbackUri]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[style, styles.container, { backgroundColor: fallbackColor }]}
    >
      {!showIcon && (
        <Image
          source={{ uri: sourceUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={180}
          onError={() => {
            if (uri && !primaryFailed) setPrimaryFailed(true);
            else setFallbackFailed(true);
          }}
        />
      )}
      {showIcon && (
        <View style={styles.fallback}>
          <Ionicons name="leaf-outline" size={iconSize} color={iconColor} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
