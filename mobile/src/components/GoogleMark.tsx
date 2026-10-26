import React from 'react';
import Svg, { Path } from 'react-native-svg';

export default function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v2.96h3.87c2.27-2.09 3.57-5.17 3.57-8.6Z" />
      <Path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.93l-3.87-2.96c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.76-2.11-6.71-4.95H1.29v3.05C3.26 21.3 7.3 24 12 24Z" />
      <Path fill="#FBBC05" d="M5.29 14.31a7.2 7.2 0 0 1 0-4.62V6.64H1.29a12 12 0 0 0 0 10.72l4-3.05Z" />
      <Path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.81l3.44-3.44C17.95 1.15 15.24 0 12 0 7.3 0 3.26 2.7 1.29 6.64l4 3.05C6.24 6.86 8.88 4.75 12 4.75Z" />
    </Svg>
  );
}
