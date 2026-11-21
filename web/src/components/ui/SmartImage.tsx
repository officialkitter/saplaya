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

/** A photo that quietly turns into a coloured emoji tile if the picture can't load. */
export function SmartImage({
  src, alt, emoji = '🥬', className, imgClassName, sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px', priority = false,
}: { src?: string; alt: string; emoji?: string; className?: string; imgClassName?: string; sizes?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const tile = TILES[(alt.length + emoji.length) % TILES.length];
  const imageSrc = src || productPhotoUrl(alt);
  const isAbsolutelyPositioned = className?.split(/\s+/).includes('absolute') ?? false;

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [imageSrc]);

  if (failed) {
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
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover transition-opacity duration-200', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
      />
    </div>
  );
}
