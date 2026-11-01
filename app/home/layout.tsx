import './source-icons.css';

import { RecommendedActions } from '@/components/home/recommended-actions';
import { HomeSetupRecommendations } from '@/components/home-setup-recommendations';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  await requirePrivilegedWorkspaceAccess();

  return (
    <>
      <HomeSetupRecommendations />
      {children}
      <div className="mt-5 pb-8">
        <RecommendedActions />
      </div>
    </>
  );
}
