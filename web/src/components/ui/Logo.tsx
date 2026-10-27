'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { cn } from '@/lib/format';

export function LogoMark({ size = 40, grow = false }: { size?: number; grow?: boolean }) {
  return (
    <motion.span
      initial={grow ? { scale: 0, rotate: -20 } : false}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', damping: 8, stiffness: 140, delay: 0.1 }}
      className="relative block shrink-0 overflow-hidden rounded-[26%]"
      style={{ width: size, height: size }}
    >
      <Image src="/saplaya-icon.png" alt="" width={size} height={size} priority className="h-full w-full object-contain" />
    </motion.span>
  );
}

export function Logo({ className, dark = false, grow = false }: { className?: string; dark?: boolean; grow?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark grow={grow} />
      <span className={cn('font-display text-2xl font-extrabold tracking-tight', dark ? 'text-white' : 'text-leaf')}>
        Sapla<span className="text-sun-deep">ya</span>
      </span>
    </span>
  );
}
