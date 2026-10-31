import { redirect } from "next/navigation";

export default function ContactPerformanceLegacyPage() {
  redirect("/performance?view=communication");
}
