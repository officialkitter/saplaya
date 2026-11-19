'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/format';

const TILES = [
  'from-[#FFE0B2] to-[#FFCC80]',
  'from-[#C8E6C9] to-[#A5D6A7]',
  'from-[#FFF9C4] to-[#FFF176]',
  'from-[#F8BBD0] to-[#F48FB1]',
  'from-[#DCEDC8] to-[#AED581]',
];

/** A photo that quietly turns into a coloured emoji tile if the picture can't load. */
export function SmartImage({
  src, alt, emoji = '🥬', className, imgClassName, sizes = '(max-width: 640px) 50vw, 256px',
}: { src?: string; alt: string; emoji?: string; className?: string; imgClassName?: string; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  const tile = TILES[(alt.length + emoji.length) % TILES.length];

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn('grid place-items-center bg-gradient-to-br', tile, className)}
      >
        <span className="select-none text-[2.2em] leading-none">{emoji}</span>
      </div>
    );
  }
  return (
    <div className={cn('relative overflow-hidden bg-line', className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        unoptimized
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover', imgClassName)}
      />
    </div>
  );
}
