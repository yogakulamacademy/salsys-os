import './source-icons.css';
import './command-center.css';

import { RecommendedActions } from '@/components/home/recommended-actions';
import { HomeSetupRecommendations } from '@/components/home-setup-recommendations';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  await requirePrivilegedWorkspaceAccess();

  return (
    <>
      {children}
      <details className="home-workflow-details"><summary>Recommended actions</summary><RecommendedActions /></details>
      <details className="home-workflow-details"><summary>Workspace setup</summary><HomeSetupRecommendations /></details>
    </>
  );
}
