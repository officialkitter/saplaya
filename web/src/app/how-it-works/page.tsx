import type { Metadata } from 'next';
import Link from 'next/link';
import { Pipeline } from '@/components/landing/Pipeline';
import { PublicPage } from '@/components/landing/PublicPage';

export const metadata: Metadata = {
  title: 'How It Works | Saplaya',
  description: 'Learn how to order farm produce, choose delivery options and track your Saplaya order from the farm to your door.',
  alternates: { canonical: '/how-it-works' },
};

export default function HowItWorksPage() {
  return (
    <PublicPage pathname="/how-it-works" title="How it works" description="Enjoy a simpler way to shop from farms. Choose what you need, see your delivery options and follow your order from preparation to your door.">
      <Pipeline />
      <section className="mx-auto max-w-7xl px-5 py-12">
        <h2 className="font-display text-2xl font-extrabold">Delivery that fits your day</h2>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Daily delivery windows are 07:00-10:00 and 15:00-18:00 local time. Available options depend on the farms serving your address.
          Review your delivery timeframe, distance-based fee and any extra charge before confirming your order.
        </p>
        <Link href="/fresh-today" className="mt-6 inline-block font-bold text-leaf-deep underline">Explore fresh produce</Link>
      </section>
    </PublicPage>
  );
}
