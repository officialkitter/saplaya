import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export const metadata: Metadata = {
  title: 'Privacy policy | Saplaya',
  description: 'How Saplaya handles account, order and location information.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-milk px-5 py-10">
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-10">
        <Link href="/" aria-label="Saplaya home"><Logo /></Link>
        <h1 className="mt-8 font-display text-4xl font-extrabold">Privacy policy</h1>
        <p className="mt-4 text-ink-soft">
          This notice explains how Saplaya handles information when you use our website, mobile app and ordering services.
        </p>

        <div className="mt-8 space-y-7 leading-relaxed text-ink-soft">
          <section>
            <h2 className="font-display text-xl font-extrabold text-ink">Information we use</h2>
            <p className="mt-2">
              We use account and contact information you provide, such as your name, email address, phone number,
              profile details and delivery addresses. We also process your basket, orders, delivery details, reviews
              and payment status. Payment providers handle payment information through their own services.
            </p>
            <p className="mt-2">
              If you allow location access, we use your device coordinates to identify nearby farms, display your area
              and calculate delivery. You can decline location permission, although some delivery features require it.
              The app may save your chosen delivery location on your device.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-extrabold text-ink">How information is used and shared</h2>
            <p className="mt-2">
              We use information to operate accounts, verify sign-ins, process and deliver orders, provide support,
              maintain security and improve the service. Farms, delivery staff and other team members receive the
              information needed for their work, subject to their access permissions.
            </p>
            <p className="mt-2">
              We use service providers including Supabase for account and data services, Firebase for mobile phone
              authentication and notifications, Google for sign-in and location services, Railway for hosting, and
              payment and email providers to perform their respective services. Their processing is also subject to
              their own policies.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-extrabold text-ink">Retention and your choices</h2>
            <p className="mt-2">
              We retain information for as long as needed to provide the service, maintain records, resolve disputes
              and meet applicable legal obligations. You can request access, correction or deletion by contacting us.
              We may need to verify your identity and retain some records where required or permitted by law.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-extrabold text-ink">Contact</h2>
            <p className="mt-2">
              For privacy or account questions, email{' '}
              <a className="font-bold text-leaf underline" href="mailto:info@saplaya.org">info@saplaya.org</a>.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
