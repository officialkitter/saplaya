'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/format';
import { productPhotoUrl } from '@/lib/images';

const TILES = [
  'from-[#FFE0B2] to-[#FFCC80]',
  'from-[#C8E6C9] to-[#A5D6A7]',
  'from-[#FFF9C4] to-[#FFF176]',
  'from-[#F8BBD0] to-[#F48FB1]',
  'from-[#DCEDC8] to-[#AED581]',
];

/** Tries the uploaded photo, a matching produce photo, then a coloured emoji tile. */
export function SmartImage({
  src, alt, emoji = '🥬', className, imgClassName, sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px', priority = false,
}: { src?: string; alt: string; emoji?: string; className?: string; imgClassName?: string; sizes?: string; priority?: boolean }) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const tile = TILES[(alt.length + emoji.length) % TILES.length];
  const fallbackSrc = productPhotoUrl(alt, 800);
  const imageSrc = src && !primaryFailed ? src : fallbackSrc;
  const isAbsolutelyPositioned = className?.split(/\s+/).includes('absolute') ?? false;

  useEffect(() => {
    setPrimaryFailed(false);
    setFallbackFailed(false);
    setLoaded(false);
  }, [src, fallbackSrc]);

  if (fallbackFailed) {
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
    <div className={cn(isAbsolutelyPositioned ? 'overflow-hidden bg-line' : 'relative overflow-hidden bg-line', className)}>
      {!loaded && (
        <div aria-hidden className={cn('absolute inset-0 grid place-items-center bg-gradient-to-br', tile)}>
          <span className="select-none text-[2.2em] leading-none">{emoji}</span>
        </div>
      )}
      <Image
        src={imageSrc}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        quality={65}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (src && !primaryFailed) setPrimaryFailed(true);
          else setFallbackFailed(true);
        }}
        className={cn('h-full w-full object-cover transition-opacity duration-200', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
      />
    </div>
  );
}
