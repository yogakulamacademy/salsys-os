import { redirect } from "next/navigation";

export default function FunnelPage() {
  redirect("/marketing?view=funnel");
}
