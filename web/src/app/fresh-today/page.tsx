import { FreshToday } from '@/components/landing/FreshToday';
import { PublicPage } from '@/components/landing/PublicPage';
import { publicMetadata } from '@/lib/seo';
import { fetchStorefrontPage } from '@/lib/storefront-server';
import type { StorefrontPageData } from '@/lib/storefront-contract';

export const metadata = publicMetadata({
  title: 'Fresh Today | Saplaya',
  description: 'Browse available farm produce and pantry essentials. Search by product or category and shop retail or wholesale with Saplaya.',
  pathname: '/fresh-today',
});

type FreshTodayPageProps = {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
};

export default async function FreshTodayPage({ searchParams }: FreshTodayPageProps) {
  const params = await searchParams;
  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.slice(0, 100) ?? '';
  const category = (Array.isArray(params.category) ? params.category[0] : params.category)?.slice(0, 80) ?? '';
  let initialData: StorefrontPageData | undefined;
  let initialError = false;
  try {
    initialData = await fetchStorefrontPage(40, 0, { query, category });
  } catch (error) {
    console.error('Could not render initial fresh-today products:', error);
    initialError = true;
  }

  return (
    <PublicPage pathname="/fresh-today" title="Fresh today" description="From everyday meals to business orders, discover farm produce and pantry essentials in one place. Find nearby stock and shop in quantities that suit you.">
      <FreshToday
        showShoppingMode
        initialData={initialData}
        initialError={initialError}
        initialQuery={query}
        initialCategory={category}
      />
    </PublicPage>
  );
}
