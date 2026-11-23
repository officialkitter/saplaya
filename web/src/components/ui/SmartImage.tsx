'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/format';
import { generatedProductPhotoUrl, productPhotoUrl } from '@/lib/images';

/** Tries the uploaded photo, a matching produce photo, then a guaranteed white-background product tile. */
export function SmartImage({
  src, alt, emoji = '🥬', className, imgClassName, sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px', priority = false,
}: { src?: string; alt: string; emoji?: string; className?: string; imgClassName?: string; sizes?: string; priority?: boolean }) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fallbackSrc = productPhotoUrl(alt, 800);
  const generatedSrc = generatedProductPhotoUrl(alt, 800);
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
        className={cn('grid place-items-center bg-white', className)}
      >
        <Image
          src={generatedSrc}
          alt={alt}
          fill
          sizes={sizes}
          unoptimized
          className="h-full w-full object-contain"
        />
      </div>
    );
  }
  return (
    <div className={cn(isAbsolutelyPositioned ? 'overflow-hidden bg-white' : 'relative overflow-hidden bg-white', className)}>
      {!loaded && (
        <div aria-hidden className="absolute inset-0 grid place-items-center bg-white">
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
        className={cn('h-full w-full object-contain transition-opacity duration-200', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
      />
    </div>
  );
}
