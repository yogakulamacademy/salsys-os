import { getCurrentSignupPlan } from "@/lib/commercial/signup-plan";

export async function SignupPlanBanner() {
  if (process.env.SALSYS_COMMERCIAL_ACCESS_ENABLED !== "true") return null;
  const plan = await getCurrentSignupPlan();
  if (!("remainingSeconds" in plan)) return null;
  const hours = Math.ceil(plan.remainingSeconds / 3600);
  const remaining = hours > 24 ? Math.ceil(hours / 24) + " days" : hours + " hours";
  return (
    <section className="mb-4 rounded-xl border border-line bg-surface p-4" aria-label="Subscription status">
      <p className="text-sm font-semibold text-copy-strong">
        {plan.state === "pro_trial" ? "Pro trial · " + remaining + " remaining" : "Free plan"}
      </p>
      <p className="mt-1 text-sm text-copy-muted">
        {plan.state === "pro_trial"
          ? "Your trial ends at " + new Date(plan.trialEndsAt).toISOString().replace("T", " ").slice(0, 16) + " UTC. Continue on Free afterward without automatic charges."
          : "Your account remains free. Your existing records are preserved."}
      </p>
    </section>
  );
}
