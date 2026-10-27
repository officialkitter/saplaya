import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

export default function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Image source={require('../../assets/icon.png')} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
