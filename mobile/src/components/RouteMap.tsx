import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, OrderStatus, radius, statusColor, volumeTheme } from '../theme';
import { useStore } from '../store/StoreContext';

const W = 340;
const H = 190;
const P0 = { x: 40, y: 140 }; // farm hub
const P1 = { x: 130, y: 20 };
const P2 = { x: 250, y: 190 };
const P3 = { x: 300, y: 50 }; // your door
const PATH = `M ${P0.x} ${P0.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${P3.x} ${P3.y}`;

const bez = (t: number) => {
  const u = 1 - t;
  const f = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return { x: f(P0.x, P1.x, P2.x, P3.x), y: f(P0.y, P1.y, P2.y, P3.y) };
};

const progressFor: Record<OrderStatus, number> = { pending: 0, packing: 0.12, en_route: 0.6, delivered: 1, cancelled: 0 };

const ACircle = Animated.createAnimatedComponent(Circle);

/** Stylized route map (SVG). The marker glides along the route as the status advances. */
export default function RouteMap({ status }: { status: OrderStatus }) {
  const { mode } = useStore();
  const theme = volumeTheme(mode);
  const p = useSharedValue(progressFor[status]);
  useEffect(() => {
    p.value = withTiming(progressFor[status], { duration: 1200 });
  }, [status, p]);

  const props = useAnimatedProps(() => {
    const t = p.value;
    const u = 1 - t;
    const f = (a: number, b: number, c: number, d: number) =>
      u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
    return { cx: f(P0.x, P1.x, P2.x, P3.x), cy: f(P0.y, P1.y, P2.y, P3.y) };
  });

  const c = statusColor[status];
  const start = bez(0);
  const end = bez(1);

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.soft} />
            <Stop offset="1" stopColor={theme.background} />
          </LinearGradient>
        </Defs>
        <Rect width={W} height={H} fill="url(#g)" />
        {/* soft street grid */}
        {[40, 90, 140].map((y) => <Path key={y} d={`M0 ${y} H${W}`} stroke="#DDE8D8" strokeWidth={10} />)}
        {[70, 160, 250].map((x) => <Path key={x} d={`M${x} 0 V${H}`} stroke="#DDE8D8" strokeWidth={10} />)}
        <Path d={PATH} stroke="#C9D8C3" strokeWidth={8} fill="none" strokeLinecap="round" />
        <Path d={PATH} stroke={c} strokeWidth={4} strokeDasharray="2 10" fill="none" strokeLinecap="round" />
        <Circle cx={start.x} cy={start.y} r={9} fill={theme.accent} />
        <Circle cx={end.x} cy={end.y} r={9} fill={colors.yellowDeep} stroke="#fff" strokeWidth={3} />
        <ACircle animatedProps={props} r={12} fill={c} stroke="#fff" strokeWidth={4} />
      </Svg>
      <View style={[styles.pin, { left: `${end.x / W * 100}%`, top: `${(end.y - 34) / H * 100}%` }]}>
        <MaterialCommunityIcons name="home-map-marker" size={28} color={colors.yellowDeep} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 200, marginHorizontal: 20, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  pin: { position: 'absolute', marginLeft: -14 },
});
