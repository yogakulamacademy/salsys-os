import './source-icons.css';

import { HomeSetupRecommendations } from '@/components/home-setup-recommendations';

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HomeSetupRecommendations />
      {children}
    </>
  );
}
