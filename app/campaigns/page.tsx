import { redirect } from "next/navigation";

type CampaignsPageProps = {
  searchParams: Promise<{
    q?: string;
    platform?: string;
    outcome?: string;
    sort?: string;
    page?: string;
  }>;
};

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  const query = await searchParams;
  const params = new URLSearchParams({ view: "campaigns" });

  for (const key of ["q", "platform", "outcome", "sort", "page"] as const) {
    const value = query[key]?.trim();
    if (value) params.set(key, value);
  }

  redirect(`/marketing?${params.toString()}`);
}
