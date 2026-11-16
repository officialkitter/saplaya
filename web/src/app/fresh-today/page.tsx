import type { Metadata } from 'next';
import { FreshToday } from '@/components/landing/FreshToday';
import { PublicPage } from '@/components/landing/PublicPage';

export const metadata: Metadata = {
  title: 'Fresh Today | Saplaya',
  description: 'Browse available farm produce and pantry essentials. Search by product or category and shop retail or wholesale with Saplaya.',
  alternates: { canonical: '/fresh-today' },
};

export default function FreshTodayPage() {
  return (
    <PublicPage pathname="/fresh-today" title="Fresh today" description="From everyday meals to business orders, discover farm produce and pantry essentials in one place. Find nearby stock and shop in quantities that suit you.">
      <FreshToday showShoppingMode />
    </PublicPage>
  );
}
