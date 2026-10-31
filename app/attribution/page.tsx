import { redirect } from "next/navigation";

type AttributionPageProps = {
  searchParams: Promise<{
    q?: string;
    course?: string;
    location?: string;
    country?: string;
    stage?: string;
  }>;
};

export default async function AttributionPage({ searchParams }: AttributionPageProps) {
  const query = await searchParams;
  const params = new URLSearchParams({ view: "attribution" });

  for (const key of ["q", "course", "location", "country", "stage"] as const) {
    const value = query[key]?.trim();
    if (value) params.set(key, value);
  }

  redirect(`/marketing?${params.toString()}`);
}
