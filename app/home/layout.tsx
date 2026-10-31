import './source-icons.css';

import { HomeSetupRecommendations } from '@/components/home-setup-recommendations';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  await requirePrivilegedWorkspaceAccess();

  return (
    <>
      <HomeSetupRecommendations />
      {children}
    </>
  );
}
