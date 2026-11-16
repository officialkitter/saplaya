import type { Metadata } from 'next';
import { Farmers } from '@/components/landing/Farmers';
import { PublicPage } from '@/components/landing/PublicPage';

export const metadata: Metadata = {
  title: 'For Farmers | Saplaya',
  description: 'Apply to supply fresh produce through Saplaya. Manage your farm stock and orders with role-based access and customer privacy.',
  alternates: { canonical: '/for-farmers' },
};

export default function ForFarmersPage() {
  return (
    <PublicPage pathname="/for-farmers" title="For farmers" description="Bring your harvest to more customers while managing your own stock and orders. Explore the tools, privacy protections and steps to join Saplaya.">
      <Farmers />
    </PublicPage>
  );
}
