import { redirect } from "next/navigation";

export default function AnalyticsPage() {
  redirect("/marketing?view=analytics");
}
