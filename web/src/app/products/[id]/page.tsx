import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicPage } from '@/components/landing/PublicPage';
import { SmartImage } from '@/components/ui/SmartImage';
import { serializeJsonLd } from '@/lib/json-ld';
import { publicMetadata, SITE_URL } from '@/lib/seo';
import {
  fetchStorefrontProduct,
  StorefrontProductNotFoundError,
} from '@/lib/storefront-server';
import type { StorefrontProduct } from '@/lib/storefront-contract';

export const revalidate = 300;

type ProductPageProps = { params: Promise<{ id: string }> };

function productTitle(name: string): string {
  const shortName = name.length > 29 ? `${name.slice(0, 28).trimEnd()}…` : name;
  return `${shortName} | Fresh Produce | Saplaya`;
}

function productDescription(name: string): string {
  const shortName = name.length > 55 ? `${name.slice(0, 52).trimEnd()}…` : name;
  return `Shop ${shortName} from Saplaya, a fresh produce delivery and wholesale marketplace. See retail and wholesale availability.`;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const pathname = `/products/${encodeURIComponent(id)}`;
  try {
    const product = await fetchStorefrontProduct(id);
    return publicMetadata({
      title: productTitle(product.name),
      description: productDescription(product.name),
      pathname,
      image: product.image_url ?? '/saplaya-icon.png',
      imageAlt: product.name,
    });
  } catch (error) {
    if (!(error instanceof StorefrontProductNotFoundError)) {
      console.error('Could not generate product metadata:', error);
    }
    return {
      title: 'Fresh produce | Saplaya',
      description: 'Browse fresh farm produce and pantry essentials on Saplaya.',
      alternates: { canonical: new URL(pathname, SITE_URL).toString() },
      robots: { index: false, follow: true },
    };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const pathname = `/products/${encodeURIComponent(id)}`;
  let product: StorefrontProduct;
  try {
    product = await fetchStorefrontProduct(id);
  } catch (error) {
    if (error instanceof StorefrontProductNotFoundError) notFound();
    console.error('Could not load storefront product detail:', error);
    return (
      <PublicPage
        pathname={pathname}
        title="Product details unavailable"
        description="Product details are temporarily unavailable. Browse the current fresh produce listings and try again."
        parents={[{ href: '/fresh-today', label: 'Fresh produce' }]}
      >
        <p className="mx-auto max-w-7xl px-5 pb-16">
          <Link href="/fresh-today" className="font-bold text-leaf-deep underline">Browse fresh produce</Link>
        </p>
      </PublicPage>
    );
  }

  const productUrl = new URL(pathname, SITE_URL).toString();
  const image = product.image_url ? [product.image_url] : [`${SITE_URL}/saplaya-icon.png`];
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: productDescription(product.name),
    image,
    category: product.category,
    sku: product.id,
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'TZS',
      price: product.retail_price,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <PublicPage
        pathname={pathname}
        title={product.name}
        description={`${product.category} · Sold per ${product.unit}. Fresh produce from Saplaya farms, available for retail or wholesale.`}
        parents={[{ href: '/fresh-today', label: 'Fresh produce' }]}
      >
        <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-20 md:grid-cols-2 md:items-start">
          <SmartImage
            src={product.image_url ?? undefined}
            alt={`${product.name} fresh produce`}
            sizes="(max-width: 768px) 100vw, 50vw"
            className="aspect-[4/3] w-full rounded-[1.75rem] text-6xl"
          />
          <div className="rounded-[1.75rem] border border-line bg-white p-6 shadow-soft sm:p-8">
            <p className="text-sm font-bold uppercase tracking-wide text-leaf-deep">{product.category}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold">{product.name}</h2>
            <p className="mt-2 text-ink-soft">Available by the {product.unit} from active Saplaya farm listings.</p>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-leaf-soft p-4">
                <dt className="text-sm font-semibold text-leaf-deep">Retail</dt>
                <dd className="mt-1 text-xl font-extrabold text-leaf-deep">TZS {product.retail_price.toLocaleString('en')}</dd>
              </div>
              <div className="rounded-2xl bg-sun-soft p-4">
                <dt className="text-sm font-semibold text-[#8A5A00]">Wholesale · minimum {product.wholesale_min_qty} {product.unit}</dt>
                <dd className="mt-1 text-xl font-extrabold text-[#6B4A12]">TZS {product.wholesale_price.toLocaleString('en')}</dd>
              </div>
            </dl>
            <p className="mt-5 text-sm text-ink-soft">{product.stock.toLocaleString('en')} {product.unit} currently available.</p>
            <Link
              href={`/fresh-today?q=${encodeURIComponent(product.name)}`}
              className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-leaf px-5 py-3 font-extrabold text-white hover:bg-leaf-deep"
            >
              Shop this product
            </Link>
          </div>
        </section>
      </PublicPage>
    </>
  );
}
