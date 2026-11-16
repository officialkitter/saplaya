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
    <PublicPage pathname="/for-farmers" title="For farmers" description="Bring your harvest to Saplaya customers. Learn about farm tools, privacy and the supplier application process.">
      <Farmers />
    </PublicPage>
  );
}
