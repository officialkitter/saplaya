import { Farmers } from '@/components/landing/Farmers';
import { PublicPage } from '@/components/landing/PublicPage';
import { publicMetadata } from '@/lib/seo';

export const metadata = publicMetadata({
  title: 'For Farmers | Saplaya',
  description: 'Apply to supply fresh produce through Saplaya. Manage your farm stock and orders with role-based access and customer privacy.',
  pathname: '/for-farmers',
});

export default function ForFarmersPage() {
  return (
    <PublicPage pathname="/for-farmers" title="For farmers" description="Bring your harvest to more customers while managing your own stock and orders. Explore the tools, privacy protections and steps to join Saplaya.">
      <Farmers />
    </PublicPage>
  );
}
