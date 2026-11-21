import React, { useEffect, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

export default function RemotePhotoBackground({
  uri,
  style,
  imageStyle,
  children,
}: {
  uri: string;
  style: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  children: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [uri]);

  return (
    <View style={[styles.container, style]}>
      {!failed && (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, imageStyle]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={180}
          onError={() => setFailed(true)}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#2E7D32' },
});
