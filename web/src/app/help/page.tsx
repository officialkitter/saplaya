import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicPage } from '@/components/landing/PublicPage';

export const metadata: Metadata = {
  title: 'Help | Saplaya',
  description: 'Get help with Saplaya shopping and delivery, find answers to common questions or contact the team.',
  alternates: { canonical: '/help' },
};

export default function HelpPage() {
  return (
    <PublicPage pathname="/help" title="Help" description="Whether you are planning an order or bringing your harvest to customers, find the answers and support you need to get started.">
      <div className="mx-auto grid max-w-7xl gap-6 px-5 pb-20 sm:grid-cols-3">
        {[
          { href: '/faq', title: 'Questions', text: 'Answers about delivery, payments, privacy and wholesale shopping.' },
          { href: '/how-it-works', title: 'How it works', text: 'The four steps from selecting produce to receiving your delivery.' },
          { href: '/for-farmers', title: 'For farmers', text: 'Farm tools, supplier benefits and the application form.' },
        ].map((item) => (
          <section key={item.href} className="glass-surface rounded-3xl p-6">
            <h2 className="font-display text-xl font-extrabold"><Link href={item.href} className="text-leaf-deep hover:underline">{item.title}</Link></h2>
            <p className="mt-3 text-ink-soft">{item.text}</p>
          </section>
        ))}
        <p className="text-ink-soft sm:col-span-3">Still need help? Email <a href="mailto:info@saplaya.org" className="font-bold text-leaf-deep underline">info@saplaya.org</a>.</p>
      </div>
    </PublicPage>
  );
}
