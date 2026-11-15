import './source-icons.css';
import './command-center-v2.css';

import { RecommendedActions } from '@/components/home/recommended-actions';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  await requirePrivilegedWorkspaceAccess();

  return (
    <>
      {children}
      <div className="command-center-v2 home-recommendations mt-3 pb-7">
        <RecommendedActions />
      </div>
    </>
  );
}
