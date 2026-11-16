import Link from 'next/link';
import type { ReactNode } from 'react';
import { Nav } from './Nav';
import { Footer } from './Footer';
import { serializeJsonLd } from '@/lib/json-ld';

export function PublicPage({
  title,
  description,
  pathname,
  parents = [],
  children,
}: {
  title: string;
  description: string;
  pathname: string;
  parents?: { href: string; label: string }[];
  children: ReactNode;
}) {
  const breadcrumbItems = [{ href: '/', label: 'Home' }, ...parents, { href: pathname, label: title }];
  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: new URL(item.href, 'https://www.saplaya.org').toString(),
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbData) }} />
      <Nav />
      <main>
        <header className="mx-auto max-w-7xl px-5 pb-10 pt-10 sm:pt-14">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm font-semibold text-ink-soft">
            <ol className="flex flex-wrap items-center gap-2">
              {breadcrumbItems.slice(0, -1).map((item) => (
                <li key={item.href} className="flex items-center gap-2">
                  <Link href={item.href} className="hover:text-leaf-deep hover:underline">{item.label}</Link>
                  <span aria-hidden="true">&gt;</span>
                </li>
              ))}
              <li aria-current="page">{title}</li>
            </ol>
          </nav>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">{description}</p>
        </header>
        {children}
      </main>
      <Footer />
    </>
  );
}
