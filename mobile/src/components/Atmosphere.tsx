import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Easing } from 'react-native-reanimated';
import { View as MotiView } from 'moti/build/components/view';

type Props = {
  variant?: 'light' | 'photo';
};

type Cloud = {
  width: number;
  height: number;
  top?: `${number}%`;
  right?: `${number}%`;
  bottom?: `${number}%`;
  left?: `${number}%`;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
};

const mist: Cloud[] = [
  { width: 250, height: 190, top: '9%', left: '-18%', dx: 36, dy: 28, duration: 9200, delay: 0 },
  { width: 290, height: 220, top: '39%', right: '-20%', dx: -42, dy: -26, duration: 11200, delay: 900 },
  { width: 220, height: 170, bottom: '8%', left: '12%', dx: 24, dy: -24, duration: 10400, delay: 1700 },
] as const;

export default function Atmosphere({ variant = 'light' }: Props) {
  const photo = variant === 'photo';
  return (
    <View pointerEvents="none" style={styles.layer}>
      {mist.map((cloud, index) => (
        <MotiView
          key={index}
          from={{ opacity: photo ? 0.03 : 0.05, scale: 0.92, translateX: 0, translateY: 0 }}
          animate={{ opacity: photo ? 0.12 : 0.12, scale: 1.08, translateX: cloud.dx, translateY: cloud.dy }}
          transition={{
            type: 'timing',
            duration: cloud.duration,
            delay: cloud.delay,
            easing: Easing.inOut(Easing.sin),
            loop: true,
            repeatReverse: true,
          }}
          style={[
            styles.cloud,
            {
              width: cloud.width,
              height: cloud.height,
              top: cloud.top,
              right: 'right' in cloud ? cloud.right : undefined,
              bottom: 'bottom' in cloud ? cloud.bottom : undefined,
              left: 'left' in cloud ? cloud.left : undefined,
              backgroundColor: photo
                ? index === 1 ? 'rgba(255,255,255,0.78)' : 'rgba(221,246,212,0.76)'
                : index === 1 ? 'rgba(255,213,79,0.52)' : 'rgba(76,175,80,0.46)',
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  cloud: {
    position: 'absolute',
    borderRadius: 999,
    transform: [{ scaleX: 1.35 }],
  },
});
