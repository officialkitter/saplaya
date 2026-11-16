import { Eye, Lock, Users, Wallet } from 'lucide-react';
import { ApplyForm } from './ApplyForm';

const CONTROL = [
  { icon: Wallet, title: 'You set the prices', text: 'Add your produce, set retail and wholesale prices, and add stock when the harvest comes in.' },
  { icon: Eye, title: 'You see your own orders', text: 'Your orders and your stock history, nothing from other farms.' },
  { icon: Users, title: 'You choose who helps', text: 'Add packers to your farm. They can pack and add stock, but cannot change prices.' },
  { icon: Lock, title: 'Customers stay private', text: 'You see a first name and a delivery area, just enough to pack and send the order.' },
];

const STEPS = ['Send the form', 'We call you within 2 working days', 'You get a sign-in link by email', 'Add your produce and start selling'];

export function Farmers() {
  return (
    <section id="farmers" className="relative overflow-hidden bg-leaf-deep py-12 text-white sm:py-16">
      <div className="field-lines absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <h2 className="max-w-xl font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Grow it. We bring the customers.
          </h2>
          <p className="mt-4 max-w-xl text-lg text-white/80">
            Customers see one Saplaya shop. Behind it, every farm gets its own simple panel to run orders and stock, with strict limits on who can see and change what.
          </p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {CONTROL.map((c) => {
              const Icon = c.icon;
              return (
                <li key={c.title} className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur-sm">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sun text-ink"><Icon size={22} /></span>
                  <h3 className="mt-3 font-display text-lg font-extrabold">{c.title}</h3>
                  <p className="mt-1 text-[15px] text-white/75">{c.text}</p>
                </li>
              );
            })}
          </ul>

          <ol className="mt-10 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-4 text-lg font-semibold">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sun font-extrabold text-ink">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="lg:pt-4">
          <ApplyForm />
        </div>
      </div>
    </section>
  );
}
